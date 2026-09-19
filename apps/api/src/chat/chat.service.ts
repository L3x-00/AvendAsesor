import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthorizationContext } from '../authorization';
import { FaqMemoryService } from '../learning/faq-memory.service';
import type { AnswerGateway } from '../rag/answer.gateway';
import {
  MAX_CHAT_CONTEXT_CHARS,
  MAX_CHAT_CONTEXT_MESSAGES,
  MAX_RAG_ANSWER_CHARS,
  RAG_AMBIGUITY_MESSAGE,
  RAG_NO_EVIDENCE_MESSAGE,
} from '../rag/rag.constants';
import {
  detectRetrievalScope,
  RagService,
  resolveDetectedSubmodule,
  type ResolvedModule,
} from '../rag/rag.service';
import { RAG_ANSWER_GATEWAY } from '../rag/rag.tokens';
import type { RetrievedChunk } from '../rag/retrieval.gateway';
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
import { buildConversationalReply } from './intent/conversational-replies';
import { classifyTurnIntent } from './intent/intent-classifier';

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
  | { data: { message: string }; type: 'conversational' }
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
const CITATION_PATTERN = /\[(\d+)\]/gu;
type CitationQualitySignal =
  'citation_insufficient' | 'support_insufficient' | 'support_partial';

export interface AnswerCitationQualityEvaluation {
  excerpts: Partial<Record<CitationQualitySignal, string>>;
  signals: CitationQualitySignal[];
}
const CLAIM_PATTERN = /[^.!?]+(?:[.!?]+(?:\s*\[\d+\])?|\s*$)/gu;
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
  const claimTerms = normalizedTerms(claim.replace(CITATION_PATTERN, ''));
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
        claim.replace(CITATION_PATTERN, '').replace(/\s+/gu, '').length >=
        MIN_SUBSTANTIVE_CLAIM_CHARS,
    );

  for (const claim of claims) {
    const citationIndexes = [...claim.matchAll(CITATION_PATTERN)].map((match) =>
      Number(match[1]),
    );
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
      !citedSources.some((source) => sourceSupportsClaim(claim, source))
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
    inputs.push({
      chunkId: source.chunkId,
      moduleId: selectCitationModule(
        source,
        selectedModuleId,
        relatedSubmodule?.id ?? null,
      ),
      relevanceScore,
      sourceId,
    });
    sources.push({
      articleReference: source.articleReference,
      documentSituation: source.documentSituation,
      documentTitle: source.documentTitle,
      id: sourceId,
      moduleName:
        source.moduleNames.length === 1
          ? (source.moduleNames[0] ?? null)
          : null,
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
    ? `Encontré información relacionada con varios temas: ${names}. Para orientarte con precisión, ¿sobre cuál de ellos es tu consulta?`
    : '¿Sobre qué tema específico deseas que te oriente?';

  return [RAG_AMBIGUITY_MESSAGE, orientation, clarification]
    .filter(Boolean)
    .join(' ');
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
  ) {}

  getConversation(
    conversationId: string,
    authorization: AuthorizationContext,
  ): Promise<unknown> {
    return this.historyGateway.getConversation({
      conversationId,
      limit: this.historyLimit(),
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
    // (saludo/agradecimiento/despedida/capacidad) se responden con calidez y los
    // ajenos al ámbito se declinan con cortesía reorientando — ambos SIN activar
    // el RAG, sin persistir turno y sin ensuciar las colas (efímeros). Fail-closed:
    // cualquier señal de dominio, mezcla o duda la enruta `classifyTurnIntent` a
    // `domain`, que sigue el flujo evidence-only de abajo. No crear conversación por
    // "hola"/"gracias" cumple el lineamiento de historial.
    const intent = classifyTurnIntent(input.question);
    if (intent.lane === 'social' || intent.lane === 'out_of_scope') {
      yield {
        data: { message: buildConversationalReply(intent.subtype) },
        type: 'conversational',
      };
      return;
    }

    const faqMemory = this.faqMemoryService.prepare(input.question);
    const storedContext = input.conversationId
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
    let startedNewConversation = !input.conversationId || manuallyChangedModule;
    let conversationContext: ChatContextMessage[] = manuallyChangedModule
      ? []
      : (storedContext?.messages ?? []);
    let selectedModuleId = manuallyChangedModule
      ? input.selectedModuleId
      : (storedContext?.selectedModuleId ?? input.selectedModuleId);
    let conversationId = manuallyChangedModule ? null : input.conversationId;
    const priorUserQuestions = conversationContext
      .filter((message) => message.role === 'user')
      .map((message) => message.content);
    const retrieval = await this.ragService.retrieve(
      input.question,
      selectedModuleId,
      priorUserQuestions,
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
      retrieval.resolvedModule
    ) {
      if (storedContext) {
        conversationId = null;
        conversationContext = [];
        startedNewConversation = true;
      }
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
      const completed = await this.historyGateway.completeTurn({
        answer: RAG_NO_EVIDENCE_MESSAGE,
        conversationId: turn.conversationId,
        faqMemory,
        detectedModuleId: null,
        detectedSubmoduleId: null,
        qualitySignals: [],
        replyRole: 'no_evidence',
        retrievalScope,
        sources: [],
        topRelevanceScore: retrieval.topRelevanceScore,
        unansweredReason: 'insufficient_evidence',
        userId: input.authorization.userId,
        userMessageId: turn.userMessageId,
      });
      yield { data: { message: RAG_NO_EVIDENCE_MESSAGE }, type: 'no_evidence' };
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

    if (retrieval.kind === 'ambiguous') {
      const citations = toCitationBundle(retrieval.sources, null, null, null);
      const message = ambiguityMessage(retrieval.modules, retrieval.sources);
      yield { data: { sources: citations.sources }, type: 'sources' };
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
    yield { data: { sources: citations.sources }, type: 'sources' };

    let answer = '';
    for await (const token of this.answerGateway.generate({
      abortSignal: input.abortSignal,
      conversationContext,
      question: input.question,
      sources: retrieval.sources,
    })) {
      if (input.abortSignal?.aborted) return;

      answer += token;
      if (answer.length > MAX_RAG_ANSWER_CHARS) {
        throw new ServiceUnavailableException(
          'The generated answer is too long.',
        );
      }
      yield { data: { text: token }, type: 'token' };
    }

    if (input.abortSignal?.aborted) return;

    const normalizedAnswer = answer.trim();
    if (!normalizedAnswer) {
      throw new ServiceUnavailableException(
        'The RAG answer provider returned no answer.',
      );
    }

    const citationQuality = evaluateAnswerCitationQualityDetails(
      normalizedAnswer,
      retrieval.sources,
    );
    const qualitySignals = new Set<string>(citationQuality.signals);
    if (
      retrieval.topRelevanceScore <
      (this.configService.get<number>('RAG_MATCH_THRESHOLD') ?? 0.7) + 0.05
    ) {
      qualitySignals.add('low_confidence');
    }

    const completed = await this.historyGateway.completeTurn({
      answer: normalizedAnswer,
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

  private historyLimit(): number {
    return this.configService.get<number>('CHAT_HISTORY_LIMIT') ?? 20;
  }
}
