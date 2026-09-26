import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatCatalogService } from './catalog/chat-catalog.service';
import type { AuthorizationContext } from '../authorization';
import { FaqMemoryService } from '../learning/faq-memory.service';
import type { AnswerGateway } from '../rag/answer.gateway';
import { NoSupportMarkerFilter } from '../rag/no-support-marker';
import {
  MAX_CHAT_CONTEXT_CHARS,
  MAX_CHAT_CONTEXT_MESSAGES,
  MAX_RAG_ANSWER_CHARS,
  RAG_AMBIGUITY_MESSAGE,
  RAG_DEFAULT_MATCH_THRESHOLD,
  RAG_NO_EVIDENCE_MESSAGE,
  RAG_ORIENTATION_SCORE_MARGIN,
  RAG_TOPIC_CLARIFICATION_MESSAGE,
} from '../rag/rag.constants';
import {
  detectRetrievalScope,
  RagService,
  resolveDetectedSubmodule,
  type ResolvedModule,
} from '../rag/rag.service';
import { RAG_ANSWER_GATEWAY } from '../rag/rag.tokens';
import type { RetrievalScope, RetrievedChunk } from '../rag/retrieval.gateway';
import {
  CITATION_GROUP,
  citedIndexes,
  citesAnySource,
  withoutCitations,
} from '../rag/citations';
import { SUPABASE_CHAT_GATEWAY } from '../supabase/supabase.constants';
import type {
  ActiveChatModule,
  ChatCitationInput,
  ChatContextMessage,
  ChatConversationSummary,
  ChatHistoryGateway,
  ChatSourceDownload,
  DeletedChatConversation,
} from './chat-history.gateway';
import {
  decodeChatHistoryCursor,
  encodeChatHistoryCursor,
} from './chat-history-cursor';
import {
  buildConversationalReply,
  type ConversationalReplyKind,
} from './intent/conversational-replies';
import {
  announcesNewTopic,
  announcesNewTopicWithSubject,
  classifyTurnIntent,
  hasEducationalSignal,
  isTopiclessQuestion,
} from './intent/intent-classifier';

/** Caracteres sin cita tras los cuales la respuesta empieza a mostrarse. */
const LEAD_IN_WINDOW_CHARS = 400;
/** Mensajes que se cargan al retomar una conversación (máximo de get_chat_conversation). */
export const CHAT_CONVERSATION_MESSAGE_LIMIT = 100;

/** Nota fija cuando la respuesta se corta por su extensión (tope de tokens o de caracteres). */
export const RAG_TRUNCATION_NOTE =
  '(La respuesta se acortó por su extensión. Si necesitas más detalle, pregúntame por un punto específico).';

export interface ChatSource {
  articleReference: string | null;
  documentSituation: RetrievedChunk['documentSituation'];
  documentTitle: string;
  id: string;
  moduleName: string | null;
  numeralReference: string | null;
  pageEnd: number;
  pageStart: number;
  rank: number;
  relevanceScore: number;
  relatedModuleName: string | null;
  relatedSubmoduleName: string | null;
  sectionTitle: string | null;
  versionNumber: number;
}

export type ChatStreamEvent =
  | {
      data: {
        conversationId: string;
        moduleId: string | null;
        startedNewConversation: boolean;
        userMessageId: string;
      };
      type: 'conversation';
    }
  | { data: { sources: ChatSource[] }; type: 'sources' }
  | { data: { text: string }; type: 'token' }
  | {
      data: { message: string; modules: ResolvedModule[] };
      type: 'clarification';
    }
  | { data: { message: string }; type: 'no_evidence' }
  | {
      data: {
        message: string;
        startsNewTopic?: boolean;
        /** Preguntas recomendadas (catálogo): la interfaz las ofrece como botones. */
        suggestions?: string[];
      };
      type: 'conversational';
    }
  | {
      data: {
        conversationId: string;
        inReplyToMessageId: string;
        messageId: string;
        provider: 'openai' | 'rule';
      };
      type: 'done';
    };

export interface ChatConversationPage {
  items: ChatConversationSummary[];
  nextCursor: string | null;
}

interface CitationBundle {
  inputs: ChatCitationInput[];
  sources: ChatSource[];
}

const MAX_AMBIGUITY_EXCERPT_CHARS = 280;
const MIN_SUBSTANTIVE_CLAIM_CHARS = 30;
type CitationQualitySignal =
  'citation_insufficient' | 'support_insufficient' | 'support_partial';

export interface AnswerCitationQualityEvaluation {
  excerpts: Partial<Record<CitationQualitySignal, string>>;
  signals: CitationQualitySignal[];
}
/** Afirmación: una frase con las citas que la cierran (también agrupadas). */
const CLAIM_PATTERN = new RegExp(
  `[^.!?]+(?:[.!?]+(?:\\s*${CITATION_GROUP.source})*|\\s*$)`,
  'gu',
);
const QUALITY_STOP_WORDS = new Set([
  'acerca',
  'ademas',
  'como',
  'conforme',
  'cuando',
  'desde',
  'donde',
  'esta',
  'este',
  'estos',
  'fuente',
  'informacion',
  'norma',
  'para',
  'porque',
  'puede',
  'respuesta',
  'segun',
  'sobre',
  'tambien',
]);

function clampScore(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function normalizedTerms(value: string): string[] {
  return [
    ...new Set(
      (
        value
          .normalize('NFD')
          .replace(/\p{Diacritic}/gu, '')
          .toLocaleLowerCase('es')
          .match(/[\p{L}\p{N}]{4,}/gu) ?? []
      ).filter((term) => !QUALITY_STOP_WORDS.has(term)),
    ),
  ];
}

function sourceSupportsClaim(claim: string, source: RetrievedChunk): boolean {
  const claimTerms = normalizedTerms(withoutCitations(claim));
  if (!claimTerms.length) return true;

  const sourceTerms = normalizedTerms(source.chunkContent);
  return claimTerms.some((claimTerm) =>
    sourceTerms.some(
      (sourceTerm) =>
        sourceTerm === claimTerm ||
        (claimTerm.length >= 6 &&
          sourceTerm.length >= 6 &&
          (sourceTerm.startsWith(claimTerm.slice(0, 6)) ||
            claimTerm.startsWith(sourceTerm.slice(0, 6)))),
    ),
  );
}

/**
 * Cifras de la afirmación (días, plazos, N.° de ley o artículo) que no figuran en
 * ninguna fuente citada: señal de que el modelo pudo completar de memoria. Solo
 * marca el caso para revisión humana; no decide la verdad jurídica.
 */
function claimNumbersAppearInSources(
  claim: string,
  citedSources: RetrievedChunk[],
): boolean {
  const numbers = withoutCitations(claim).match(/\d+(?:[.,]\d+)*/gu) ?? [];
  return numbers.every((number) =>
    citedSources.some((source) => source.chunkContent.includes(number)),
  );
}

/**
 * A deterministic post-generation control complements the evidence-only
 * prompt. It cannot decide legal truth, so it flags a case for human review
 * whenever a substantive claim lacks a source marker or its cited evidence has
 * no meaningful lexical bridge to the claim.
 */
function normalizedReviewExcerpt(claim: string): string {
  return claim.replace(/\s+/gu, ' ').trim().slice(0, 2_000);
}

export function evaluateAnswerCitationQualityDetails(
  answer: string,
  sources: RetrievedChunk[],
): AnswerCitationQualityEvaluation {
  if (!sources.length) {
    return { excerpts: {}, signals: ['support_insufficient'] };
  }

  const signals = new Set<CitationQualitySignal>();
  const excerpts: AnswerCitationQualityEvaluation['excerpts'] = {};
  const claims = answer
    .replace(/\r/gu, '')
    .split(/\n{2,}/gu)
    .flatMap((paragraph) => paragraph.match(CLAIM_PATTERN) ?? [])
    .map((claim) => claim.trim())
    .filter(
      (claim) =>
        withoutCitations(claim).replace(/\s+/gu, '').length >=
        MIN_SUBSTANTIVE_CLAIM_CHARS,
    );

  for (const claim of claims) {
    const citationIndexes = citedIndexes(claim);
    if (!citationIndexes.length) {
      signals.add('support_partial');
      excerpts.support_partial ??= normalizedReviewExcerpt(claim);
      continue;
    }

    const citedSources = citationIndexes
      .map((index) => sources[index - 1])
      .filter((source): source is RetrievedChunk => Boolean(source));
    if (
      citedSources.length !== citationIndexes.length ||
      !citedSources.some((source) => sourceSupportsClaim(claim, source)) ||
      !claimNumbersAppearInSources(claim, citedSources)
    ) {
      signals.add('citation_insufficient');
      excerpts.citation_insufficient ??= normalizedReviewExcerpt(claim);
    }
  }

  return { excerpts, signals: [...signals] };
}

/**
 * Compatibility wrapper used by callers that only need the quality flags.
 * The detailed evaluation is persisted by the chat flow so the administrator
 * can see the concrete answer fragment that needs review.
 */
export function evaluateAnswerCitationQuality(
  answer: string,
  sources: RetrievedChunk[],
): CitationQualitySignal[] {
  return evaluateAnswerCitationQualityDetails(answer, sources).signals;
}

function sourceIncludesModuleContext(
  source: RetrievedChunk,
  moduleId: string,
): boolean {
  return Boolean(
    source.moduleAssociations?.some(
      (association) =>
        association.rootModuleId === moduleId ||
        association.submoduleId === moduleId,
    ) ?? source.moduleIds.includes(moduleId),
  );
}

function selectCitationModule(
  source: RetrievedChunk,
  selectedModuleId: string | null,
  detectedSubmoduleId: string | null,
): string | null {
  if (
    detectedSubmoduleId &&
    sourceIncludesModuleContext(source, detectedSubmoduleId)
  ) {
    return detectedSubmoduleId;
  }
  if (
    selectedModuleId &&
    sourceIncludesModuleContext(source, selectedModuleId)
  ) {
    return selectedModuleId;
  }
  if (selectedModuleId) return source.moduleIds[0] ?? null;
  return source.moduleIds.length === 1 ? (source.moduleIds[0] ?? null) : null;
}

/**
 * Nombre del módulo con el que se guarda la cita. Antes la fuente en vivo decía
 * «No especificado» cuando el documento tenía varios módulos, y el historial
 * mostraba el módulo guardado: la misma fuente cambiaba de «Proceso».
 */
function citationModuleName(
  source: RetrievedChunk,
  moduleId: string | null,
): string | null {
  if (!moduleId) return null;
  for (const association of source.moduleAssociations ?? []) {
    if (association.submoduleId === moduleId) return association.submoduleName;
    if (association.rootModuleId === moduleId) {
      return association.rootModuleName;
    }
  }
  const index = source.moduleIds.indexOf(moduleId);
  return index >= 0 ? (source.moduleNames[index] ?? null) : null;
}

function toCitationBundle(
  retrieved: RetrievedChunk[],
  selectedModuleId: string | null,
  relatedModule: ResolvedModule | null,
  relatedSubmodule: ResolvedModule | null,
): CitationBundle {
  const inputs: ChatCitationInput[] = [];
  const sources: ChatSource[] = [];

  retrieved.forEach((source, index) => {
    const sourceId = randomUUID();
    const relevanceScore = clampScore(source.semanticScore);
    const citationModuleId = selectCitationModule(
      source,
      selectedModuleId,
      relatedSubmodule?.id ?? null,
    );
    inputs.push({
      chunkId: source.chunkId,
      moduleId: citationModuleId,
      relevanceScore,
      sourceId,
    });
    sources.push({
      articleReference: source.articleReference,
      documentSituation: source.documentSituation,
      documentTitle: source.documentTitle,
      id: sourceId,
      moduleName: citationModuleName(source, citationModuleId),
      numeralReference: source.numeralReference,
      pageEnd: source.pageEnd,
      pageStart: source.pageStart,
      rank: index + 1,
      relevanceScore,
      relatedModuleName: relatedModule?.name ?? null,
      relatedSubmoduleName: relatedSubmodule?.name ?? null,
      sectionTitle: source.sectionTitle,
      versionNumber: source.versionNumber,
    });
  });

  return { inputs, sources };
}

function evidenceExcerpt(source: RetrievedChunk): string {
  const normalized = [...source.chunkContent]
    .map((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint <= 31 || codePoint === 127)
        ? ' '
        : character;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  const firstSentence = normalized.match(/^.*?[.!?](?=\s|$)/u)?.[0];
  const excerpt = (firstSentence ?? normalized).slice(
    0,
    MAX_AMBIGUITY_EXCERPT_CHARS,
  );

  return excerpt.length < (firstSentence ?? normalized).length
    ? `${excerpt.trimEnd()}…`
    : excerpt;
}

function evidenceOrientation(sources: RetrievedChunk[]): string {
  return sources
    .slice(0, 2)
    .map((source, index) => {
      const excerpt = evidenceExcerpt(source);
      if (!excerpt) return null;
      const reference =
        source.articleReference ??
        source.numeralReference ??
        source.sectionTitle ??
        source.documentTitle;
      const situation =
        source.documentSituation === 'current'
          ? 'vigente'
          : source.documentSituation === 'replaced'
            ? 'reemplazada o sin vigencia, conservada como antecedente histórico'
            : 'archivada, conservada como antecedente histórico';
      return `Como orientación inicial, la fuente ${situation} ${reference} señala: “${excerpt}” [${index + 1}].`;
    })
    .filter((orientation): orientation is string => Boolean(orientation))
    .join(' ');
}

function ambiguityMessage(
  modules: ResolvedModule[],
  sources: RetrievedChunk[],
): string {
  const names = modules
    .slice(0, 4)
    .map((module) => module.name)
    .join(', ');
  const orientation = evidenceOrientation(sources);
  const clarification = names
    ? `Los temas relacionados son: ${names}. ¿Sobre cuál de ellos es tu consulta?`
    : '¿Sobre qué tema específico deseas que te oriente?';

  return [RAG_AMBIGUITY_MESSAGE, orientation, clarification]
    .filter(Boolean)
    .join(' ');
}

/**
 * Mensaje de "sin evidencia" (Hito 3, Fase 9). Amable y sin suposiciones. Cuando
 * la consulta se resolvió con alcance vigente (`current`), invita a revisar
 * antecedentes/versiones anteriores por si la intención era histórica, ya que el
 * alcance se detecta de forma heurística. NUNCA completa la respuesta.
 */
export function noEvidenceMessage(retrievalScope: RetrievalScope): string {
  if (retrievalScope === 'current') {
    return `${RAG_NO_EVIDENCE_MESSAGE} Si tu consulta se refiere a una norma anterior o a un antecedente histórico, indícamelo y con gusto lo reviso.`;
  }
  return RAG_NO_EVIDENCE_MESSAGE;
}

@Injectable()
export class ChatService {
  constructor(
    @Inject(RAG_ANSWER_GATEWAY) private readonly answerGateway: AnswerGateway,
    @Inject(SUPABASE_CHAT_GATEWAY)
    private readonly historyGateway: ChatHistoryGateway,
    private readonly ragService: RagService,
    private readonly configService: ConfigService,
    private readonly faqMemoryService: FaqMemoryService,
    @Optional() private readonly catalogService?: ChatCatalogService,
  ) {}

  getConversation(
    conversationId: string,
    authorization: AuthorizationContext,
  ): Promise<unknown> {
    // Al retomar una conversación se muestran hasta 100 mensajes (tope de la
    // RPC y del esquema web). Con el límite del listado (20) las primeras
    // respuestas de una consulta larga y sus fuentes quedaban inaccesibles.
    return this.historyGateway.getConversation({
      conversationId,
      limit: CHAT_CONVERSATION_MESSAGE_LIMIT,
      userId: authorization.userId,
    });
  }

  createSourceDownloadUrl(
    sourceId: string,
    authorization: AuthorizationContext,
  ): Promise<ChatSourceDownload> {
    return this.historyGateway.createSourceDownloadUrl({
      sourceId,
      ttlSeconds: 60,
      userId: authorization.userId,
    });
  }

  async listConversations(
    limit: number | undefined,
    cursor: string | undefined,
    authorization: AuthorizationContext,
  ): Promise<ChatConversationPage> {
    const pageLimit = limit ?? this.historyLimit();
    const page = await this.historyGateway.listConversations({
      cursor: decodeChatHistoryCursor(cursor),
      limit: pageLimit + 1,
      userId: authorization.userId,
    });

    const items = page.slice(0, pageLimit);
    const lastItem = items.at(-1);
    return {
      items,
      nextCursor:
        page.length > pageLimit && lastItem
          ? encodeChatHistoryCursor({
              id: lastItem.id,
              updatedAt: lastItem.updatedAt,
            })
          : null,
    };
  }

  deleteConversation(
    conversationId: string,
    authorization: AuthorizationContext,
  ): Promise<DeletedChatConversation> {
    return this.historyGateway.deleteConversation({
      conversationId,
      userId: authorization.userId,
    });
  }

  recordTechnicalFailure(
    input: {
      conversationId: string;
      errorCode: string;
      userMessageId: string;
    },
    authorization: AuthorizationContext,
  ): Promise<void> {
    return this.historyGateway.recordTechnicalFailure({
      ...input,
      userId: authorization.userId,
    });
  }

  listModules(): Promise<ActiveChatModule[]> {
    return this.historyGateway.listActiveModules();
  }

  async *stream(input: {
    abortSignal?: AbortSignal;
    authorization: AuthorizationContext;
    conversationId: string | null;
    question: string;
    selectedModuleId: string | null;
  }): AsyncIterable<ChatStreamEvent> {
    // Carriles no-RAG (Hito 3, Fases 2 y 10): los turnos sociales
    // (saludo/agradecimiento/acuse/despedida/anuncio/capacidad) se responden con
    // calidez y los ajenos al ámbito se declinan con cortesía reorientando —
    // ambos SIN activar el RAG, sin persistir turno y sin ensuciar las colas
    // (efímeros). Fail-closed: cualquier señal de dominio, mezcla o duda la
    // enruta `classifyTurnIntent` a `domain`, que sigue el flujo evidence-only
    // de abajo. No crear conversación por "hola"/"gracias" cumple el lineamiento
    // de historial.
    const intent = classifyTurnIntent(input.question, {
      inConversation: Boolean(input.conversationId),
    });
    if (intent.lane === 'social' || intent.lane === 'out_of_scope') {
      const reply = await this.conversationalReply(
        intent.lane === 'social' ? intent.subtype : 'out_of_domain',
      );
      // «Otra consulta» a secas dentro de una conversación: la siguiente
      // pregunta debe empezar una conversación nueva, sin el tema anterior.
      if (
        reply.type === 'conversational' &&
        input.conversationId &&
        intent.lane === 'social' &&
        intent.subtype === 'ask_announcement' &&
        announcesNewTopic(input.question)
      ) {
        reply.data.startsNewTopic = true;
      }
      yield reply;
      return;
    }

    const faqMemory = this.faqMemoryService.prepare(input.question);

    // Primera consulta sin tema ni módulo elegido: se pide precisar el trámite
    // antes de buscar (tantas interpretaciones como procesos).
    if (
      !input.conversationId &&
      !input.selectedModuleId &&
      isTopiclessQuestion(input.question)
    ) {
      yield* this.askForTopic({
        faqMemory,
        question: input.question,
        userId: input.authorization.userId,
      });
      return;
    }

    // "Otra consulta: …" o "cambiando de tema…": la consulta se busca y se
    // responde en una conversación nueva, sin arrastrar el tema anterior.
    const explicitTopicChange =
      Boolean(input.conversationId) &&
      announcesNewTopicWithSubject(input.question);
    const storedContext =
      input.conversationId && !explicitTopicChange
        ? await this.historyGateway.getConversationContext({
            characterLimit: MAX_CHAT_CONTEXT_CHARS,
            conversationId: input.conversationId,
            messageLimit: MAX_CHAT_CONTEXT_MESSAGES,
            userId: input.authorization.userId,
          })
        : null;
    const manuallyChangedModule = Boolean(
      storedContext &&
      input.selectedModuleId !== null &&
      input.selectedModuleId !== storedContext.selectedModuleId,
    );
    const continuesConversation = Boolean(
      storedContext && !manuallyChangedModule,
    );
    let startedNewConversation = !continuesConversation;
    let conversationContext: ChatContextMessage[] = continuesConversation
      ? (storedContext?.messages ?? [])
      : [];
    let selectedModuleId = continuesConversation
      ? (storedContext?.selectedModuleId ?? null)
      : input.selectedModuleId;
    let conversationId = continuesConversation ? input.conversationId : null;
    const priorUserQuestions = conversationContext
      .filter((message) => message.role === 'user')
      .map((message) => message.content);
    const retrieval = await this.ragService.retrieve(
      input.question,
      selectedModuleId,
      priorUserQuestions,
      {
        forceContext: conversationContext.at(-1)?.role === 'clarification',
      },
    );

    if (input.abortSignal?.aborted) return;

    const retrievalScope = detectRetrievalScope(input.question);

    if (retrieval.kind === 'topic_change') {
      conversationId = null;
      conversationContext = [];
      selectedModuleId = retrieval.resolvedModule.id;
      startedNewConversation = true;
    } else if (retrieval.kind === 'ambiguous' && selectedModuleId) {
      conversationId = null;
      conversationContext = [];
      selectedModuleId = null;
      startedNewConversation = true;
    } else if (
      retrieval.kind === 'evidence' &&
      !selectedModuleId &&
      retrieval.resolvedModule &&
      !conversationId
    ) {
      // Solo una conversación NUEVA adopta el módulo detectado. Una
      // conversación general (sin módulo) sigue siéndolo: antes se partía en
      // otra y la precisión del usuario ("de reasignación") llegaba al modelo
      // sin la pregunta original.
      selectedModuleId = retrieval.resolvedModule.id;
    }

    const turn = await this.historyGateway.beginTurn({
      conversationId,
      question: input.question,
      selectedModuleId,
      userId: input.authorization.userId,
    });

    const relatedModule =
      retrieval.kind === 'evidence' || retrieval.kind === 'topic_change'
        ? retrieval.resolvedModule
        : null;
    const relatedSubmodule =
      (retrieval.kind === 'evidence' || retrieval.kind === 'topic_change') &&
      relatedModule
        ? resolveDetectedSubmodule(retrieval.sources, relatedModule.id)
        : null;

    yield {
      data: {
        conversationId: turn.conversationId,
        moduleId: selectedModuleId,
        startedNewConversation,
        userMessageId: turn.userMessageId,
      },
      type: 'conversation',
    };

    if (input.abortSignal?.aborted) return;

    if (retrieval.kind === 'no_evidence') {
      // Primera consulta sin sustento ni señal del ámbito ("¿qué es la
      // fotosíntesis?"): además de decir que no hay sustento, se orienta sobre
      // el alcance. Se guarda igual como pendiente: puede ser una consulta del
      // ámbito con un término que el léxico no conoce ("DS 004-2013-ED").
      const unrelated =
        !input.conversationId && !hasEducationalSignal(input.question);
      yield* this.completeWithoutEvidence({
        conversationId: turn.conversationId,
        faqMemory,
        message: unrelated
          ? buildConversationalReply('unrelated_no_evidence')
          : undefined,
        retrievalScope,
        topRelevanceScore: retrieval.topRelevanceScore,
        userId: input.authorization.userId,
        userMessageId: turn.userMessageId,
      });
      return;
    }

    if (retrieval.kind === 'ambiguous') {
      // Solo se citan fragmentos como «orientación inicial» si son claramente
      // pertinentes; con coincidencias débiles se pide precisar sin citarlos.
      const orient =
        retrieval.topRelevanceScore >=
        this.matchThreshold() + RAG_ORIENTATION_SCORE_MARGIN;
      const orientationSources = orient ? retrieval.sources : [];
      const citations = toCitationBundle(orientationSources, null, null, null);
      const message = ambiguityMessage(retrieval.modules, orientationSources);
      if (orient) {
        yield { data: { sources: citations.sources }, type: 'sources' };
      }
      if (input.abortSignal?.aborted) return;
      const completed = await this.historyGateway.completeTurn({
        answer: message,
        conversationId: turn.conversationId,
        faqMemory,
        detectedModuleId: null,
        detectedSubmoduleId: null,
        qualitySignals: [],
        replyRole: 'clarification',
        retrievalScope,
        sources: citations.inputs,
        topRelevanceScore: retrieval.topRelevanceScore,
        unansweredReason: 'ambiguous_request',
        userId: input.authorization.userId,
        userMessageId: turn.userMessageId,
      });
      yield {
        data: { message, modules: retrieval.modules },
        type: 'clarification',
      };
      yield {
        data: {
          conversationId: turn.conversationId,
          inReplyToMessageId: turn.userMessageId,
          messageId: completed.answerMessageId,
          provider: 'rule',
        },
        type: 'done',
      };
      return;
    }

    const citations = toCitationBundle(
      retrieval.sources,
      selectedModuleId,
      relatedModule,
      relatedSubmodule,
    );

    // Las fuentes se emiten junto con el primer fragmento real de la respuesta:
    // si el modelo declara que ninguna fuente responde (marca de «sin
    // sustento»), el turno se cierra como «sin evidencia» y el usuario nunca ve
    // una tabla de «documentos que sustentan» que no sustentan nada.
    const marker = new NoSupportMarkerFilter();
    // Ventana inicial: hasta ver una cita [n] (o suficiente texto) no se
    // muestra nada. Así una negativa breve sin citas («Las fuentes no contienen
    // …», con o sin la marca) se cierra como «sin evidencia» antes de exhibir
    // fuentes que no sustentan nada.
    let leadIn = '';
    let streaming = false;
    let declined = false;
    let answer = '';
    let cutByLength = false;
    let finishReason: string | null = null;
    // Se reserva el espacio del aviso de corte para que lo transmitido y lo
    // guardado coincidan exactamente y nunca superen MAX_RAG_ANSWER_CHARS.
    const truncationNote = `\n\n${RAG_TRUNCATION_NOTE}`;
    const answerCap = MAX_RAG_ANSWER_CHARS - truncationNote.length;
    const takePiece = (text: string): string => {
      // Truncado con gracia (M6): al llegar al tope de longitud se cierra el
      // turno con lo generado, sin lanzar 503 a mitad del stream.
      const remaining = answerCap - answer.length;
      const piece = text.length > remaining ? text.slice(0, remaining) : text;
      if (text.length > remaining) cutByLength = true;
      answer += piece;
      return piece;
    };

    // Solo cuenta una cita a una fuente entregada: un año entre corchetes
    // ([2012]) o una fuente inventada no sustentan la respuesta.
    const cites = (text: string) =>
      citesAnySource(text, retrieval.sources.length);
    for await (const token of this.answerGateway.generate({
      abortSignal: input.abortSignal,
      conversationContext,
      onFinish: (reason) => {
        finishReason = reason;
      },
      question: input.question,
      sources: retrieval.sources,
    })) {
      if (input.abortSignal?.aborted) return;

      const visible = marker.push(token);
      if (!streaming) {
        leadIn += visible;
        if (marker.partialSupport && !cites(leadIn)) {
          declined = true;
          break;
        }
        if (!cites(leadIn) && leadIn.length < LEAD_IN_WINDOW_CHARS) {
          continue;
        }
        streaming = true;
        yield { data: { sources: citations.sources }, type: 'sources' };
        const piece = takePiece(leadIn);
        leadIn = '';
        if (piece) yield { data: { text: piece }, type: 'token' };
        if (cutByLength) break;
        continue;
      }
      if (!visible) continue;
      const piece = takePiece(visible);
      if (piece) yield { data: { text: piece }, type: 'token' };
      if (cutByLength) break;
    }

    if (input.abortSignal?.aborted) return;

    const ending = marker.finish();
    const unstreamed = streaming ? '' : `${leadIn}${ending.tail}`;
    // Fail-closed (punto 4): una respuesta que no cita ninguna fuente no puede
    // demostrar de dónde sale —suele ser una negativa («Lo siento, las fuentes
    // no mencionan…») o la marca mal escrita— y se cierra como «sin
    // evidencia». Si ya se mostró texto, el evento «no_evidence» lo reemplaza.
    const whole = `${answer}${streaming ? ending.tail : unstreamed}`;
    if (
      ending.noSupport ||
      declined ||
      (whole.trim() !== '' && !cites(whole))
    ) {
      yield* this.completeWithoutEvidence({
        conversationId: turn.conversationId,
        faqMemory,
        retrievalScope,
        topRelevanceScore: retrieval.topRelevanceScore,
        userId: input.authorization.userId,
        userMessageId: turn.userMessageId,
      });
      return;
    }
    const pending = streaming ? ending.tail : unstreamed;
    if (pending && !cutByLength) {
      if (!streaming) {
        streaming = true;
        yield { data: { sources: citations.sources }, type: 'sources' };
      }
      const piece = takePiece(pending);
      if (piece) yield { data: { text: piece }, type: 'token' };
    }

    const normalizedAnswer = answer.trim();
    if (!normalizedAnswer) {
      throw new ServiceUnavailableException(
        'The RAG answer provider returned no answer.',
      );
    }

    // Una respuesta cortada por su extensión se avisa en lenguaje llano en vez
    // de mostrarse (y guardarse) como si estuviera completa.
    let finalAnswer = normalizedAnswer;
    if (cutByLength || finishReason === 'length') {
      finalAnswer = `${normalizedAnswer}${truncationNote}`;
      yield { data: { text: truncationNote }, type: 'token' };
    }

    // La calidad se evalúa sobre la respuesta, sin el aviso de corte (que no
    // lleva citas y marcaría toda respuesta cortada para revisión).
    const truncated = cutByLength || finishReason === 'length';
    const lastCompleteSentence = Math.max(
      normalizedAnswer.lastIndexOf('.'),
      normalizedAnswer.lastIndexOf('!'),
      normalizedAnswer.lastIndexOf('?'),
      normalizedAnswer.lastIndexOf(']'),
    );
    const citationQuality = evaluateAnswerCitationQualityDetails(
      truncated && lastCompleteSentence > 0
        ? normalizedAnswer.slice(0, lastCompleteSentence + 1)
        : normalizedAnswer,
      retrieval.sources,
    );
    const qualitySignals = new Set<string>(citationQuality.signals);
    if (marker.partialSupport) qualitySignals.add('support_partial');
    if (retrieval.topRelevanceScore < this.matchThreshold() + 0.05) {
      qualitySignals.add('low_confidence');
    }

    const completed = await this.historyGateway.completeTurn({
      answer: finalAnswer,
      conversationId: turn.conversationId,
      faqMemory,
      detectedModuleId: relatedModule?.id ?? null,
      detectedSubmoduleId: relatedSubmodule?.id ?? null,
      qualityExcerpts: citationQuality.excerpts,
      qualitySignals: [...qualitySignals],
      replyRole: 'assistant',
      retrievalScope,
      sources: citations.inputs,
      topRelevanceScore: retrieval.topRelevanceScore,
      unansweredReason: null,
      userId: input.authorization.userId,
      userMessageId: turn.userMessageId,
    });
    yield {
      data: {
        conversationId: turn.conversationId,
        inReplyToMessageId: turn.userMessageId,
        messageId: completed.answerMessageId,
        provider: 'openai',
      },
      type: 'done',
    };
  }

  /** Cierra el turno como «sin evidencia»: mensaje claro, sin fuentes. */
  private async *completeWithoutEvidence(input: {
    conversationId: string;
    faqMemory: ReturnType<FaqMemoryService['prepare']>;
    message?: string;
    retrievalScope: RetrievalScope;
    topRelevanceScore: number | null;
    userId: string;
    userMessageId: string;
  }): AsyncIterable<ChatStreamEvent> {
    const message = input.message ?? noEvidenceMessage(input.retrievalScope);
    const completed = await this.historyGateway.completeTurn({
      answer: message,
      conversationId: input.conversationId,
      faqMemory: input.faqMemory,
      detectedModuleId: null,
      detectedSubmoduleId: null,
      qualitySignals: [],
      replyRole: 'no_evidence',
      retrievalScope: input.retrievalScope,
      sources: [],
      topRelevanceScore: input.topRelevanceScore,
      unansweredReason: 'insufficient_evidence',
      userId: input.userId,
      userMessageId: input.userMessageId,
    });
    yield { data: { message }, type: 'no_evidence' };
    yield {
      data: {
        conversationId: input.conversationId,
        inReplyToMessageId: input.userMessageId,
        messageId: completed.answerMessageId,
        provider: 'rule',
      },
      type: 'done',
    };
  }

  /** Respuesta amable efímera; la capacidad y el anuncio listan los temas reales. */
  private async conversationalReply(
    kind: ConversationalReplyKind,
  ): Promise<ChatStreamEvent> {
    // «¿De qué tienes información?»: documentos reales y preguntas sugeridas.
    // Si el catálogo falla, se responde con los temas (texto determinista).
    if (kind === 'catalog' && this.catalogService) {
      try {
        const catalog = await this.catalogService.reply();
        return {
          data: {
            message: catalog.message,
            ...(catalog.suggestions.length
              ? { suggestions: catalog.suggestions }
              : {}),
          },
          type: 'conversational',
        };
      } catch {
        // Continúa con la respuesta de temas.
      }
    }
    const topics =
      kind === 'capabilities' ||
      kind === 'ask_announcement' ||
      kind === 'catalog'
        ? (await this.activeTopics())?.map((topic) => topic.name)
        : undefined;
    return {
      data: { message: buildConversationalReply(kind, { topics }) },
      type: 'conversational',
    };
  }

  /**
   * Primera consulta sin tema ("¿Cuáles son los requisitos?"): se pide precisar
   * el trámite con los temas reales como opciones. Se guarda como aclaración
   * para que la respuesta del usuario ("de reasignación") conserve la pregunta.
   */
  private async *askForTopic(input: {
    faqMemory: ReturnType<FaqMemoryService['prepare']>;
    question: string;
    userId: string;
  }): AsyncIterable<ChatStreamEvent> {
    const modules = ((await this.activeTopics()) ?? []).slice(0, 8);
    const turn = await this.historyGateway.beginTurn({
      conversationId: null,
      question: input.question,
      selectedModuleId: null,
      userId: input.userId,
    });
    yield {
      data: {
        conversationId: turn.conversationId,
        moduleId: null,
        startedNewConversation: true,
        userMessageId: turn.userMessageId,
      },
      type: 'conversation',
    };
    const message = modules.length
      ? `${RAG_TOPIC_CLARIFICATION_MESSAGE} También puedes elegir uno de estos temas.`
      : RAG_TOPIC_CLARIFICATION_MESSAGE;
    const completed = await this.historyGateway.completeTurn({
      answer: message,
      conversationId: turn.conversationId,
      faqMemory: input.faqMemory,
      detectedModuleId: null,
      detectedSubmoduleId: null,
      qualitySignals: [],
      replyRole: 'clarification',
      retrievalScope: detectRetrievalScope(input.question),
      sources: [],
      topRelevanceScore: null,
      unansweredReason: 'ambiguous_request',
      userId: input.userId,
      userMessageId: turn.userMessageId,
    });
    yield { data: { message, modules }, type: 'clarification' };
    yield {
      data: {
        conversationId: turn.conversationId,
        inReplyToMessageId: turn.userMessageId,
        messageId: completed.answerMessageId,
        provider: 'rule',
      },
      type: 'done',
    };
  }

  /** Módulos raíz activos, en su orden; si la lista falla, la respuesta sigue sin ellos. */
  private async activeTopics(): Promise<ResolvedModule[] | undefined> {
    try {
      const modules = await this.historyGateway.listActiveModules();
      return modules
        .filter((module) => module.parentModuleId === null)
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map(({ id, name }) => ({ id, name }));
    } catch {
      return undefined;
    }
  }

  /** Umbral configurado; un valor fuera de [0, 1] se ignora (la validación de
   * entorno ya lo impide, pero el cálculo no debe depender de ello). */
  private matchThreshold(): number {
    const value = this.configService.get<number>('RAG_MATCH_THRESHOLD');
    return typeof value === 'number' && value >= 0 && value <= 1
      ? value
      : RAG_DEFAULT_MATCH_THRESHOLD;
  }

  private historyLimit(): number {
    return this.configService.get<number>('CHAT_HISTORY_LIMIT') ?? 20;
  }
}
