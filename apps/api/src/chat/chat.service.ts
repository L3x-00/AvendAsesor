import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ChatCatalogService,
  fallbackSuggestions,
  overviewMessage,
} from './catalog/chat-catalog.service';
import type { AvailableDocument } from './catalog/chat-catalog.types';
import { detectOverviewRequest, matchTopicModule } from './catalog/topic-match';
import type { AuthorizationContext } from '../authorization';
import { FaqMemoryService } from '../learning/faq-memory.service';
import type { AnswerGateway } from '../rag/answer.gateway';
import type { InternalTopicContext } from '../rag/topic-context';
import { unsupportedTableRows } from '../rag/answer-tables';
import { CitationGroupNormalizer } from '../rag/citation-format';
import { NoSupportMarkerFilter } from '../rag/no-support-marker';
import { noIdentifiedChangesMessage } from '../rag/document-status';
import { causalClarificationFor } from '../rag/process-clarification';
import { recoverDomainQuery } from '../rag/query-normalization';
import {
  hasUnsupportedAdministrativeInference,
  needsAdministrativeAnswerSafety,
} from '../rag/administrative-answer-safety';
import { formatSalaryBulletsAsTable } from '../rag/salary-table-format';
import { buildExtractiveSalaryAnswer } from '../rag/salary-extractive-answer';
import {
  isAscensoRemunerationQuestion,
  isPayrollReviewQuestion,
  isRuralAllocationQuestion,
  isRuralPadronQuestion,
} from '../rag/remuneration-retrieval';
import {
  assessSalaryAnswerCoverage,
  hasAmount,
  hasGeneralSalaryEvidence,
  hasPersonalSalaryContext,
  hasSalaryPanoramaEvidence,
  isBroadSalaryQuestion,
  salaryClarificationFor,
  salaryQuestionProfile,
  salaryRowMismatch,
  withInheritedSalaryFactors,
} from '../rag/salary-applicability';
import { hasStrongDomainSignal, hasTopicTerm } from '../rag/domain-lexicon';
import {
  MAX_CHAT_CONTEXT_CHARS,
  MAX_CHAT_CONTEXT_MESSAGES,
  MAX_RAG_ADVISORY_CHARS,
  MAX_RAG_ANSWER_CHARS,
  MAX_RAG_SUMMARY_CHARS,
  RAG_DEFAULT_MATCH_THRESHOLD,
  RAG_NO_EVIDENCE_MESSAGE,
  RAG_TOPIC_CLARIFICATION_MESSAGE,
  RAG_TRUNCATION_NOTE,
} from '../rag/rag.constants';
import {
  detectRetrievalScope,
  inheritedFactorQuestions,
  RagService,
  resolveDetectedSubmodule,
  type ResolvedModule,
} from '../rag/rag.service';
import { RAG_ANSWER_GATEWAY } from '../rag/rag.tokens';
import {
  isLegalModuleName,
  isLegalQuestion,
  legalTopic,
} from '../rag/legal-retrieval';
import type { RetrievalScope, RetrievedChunk } from '../rag/retrieval.gateway';
import {
  CITATION_GROUP,
  citedIndexes,
  citesAnySource,
  withoutCitations,
} from '../rag/citations';
import { placeBlockCitations } from '../rag/block-citations';
import {
  LIST_ITEM_LINE,
  claimNumbersAppearInSources,
  sourceSupportsClaim,
} from '../rag/claim-support';
import {
  SUPABASE_CHAT_GATEWAY,
  SUPABASE_TEACHER_UPDATES_GATEWAY,
} from '../supabase/supabase.constants';
import {
  TEACHER_UPDATES_WINDOW_DAYS,
  type ResolvedConsultation,
  type TeacherUpdatesGateway,
} from './teacher-updates.types';
import type {
  ActiveChatModule,
  ChatCitationInput,
  ChatContextMessage,
  ChatConversationContext,
  ChatConversationSummary,
  ChatCatalogDocumentDownload,
  ChatHistoryGateway,
  ChatSourceDownload,
  DeletedChatConversation,
} from './chat-history.gateway';
import { jornadaClarificationExplanation } from './clarification-explanation';
import { refersBack } from '../rag/anaphora';
import {
  buildDeterministicConversationSummary,
  groundedConversationSummary,
  isConversationSummaryRequest,
} from './conversation-summary';
import {
  extractPendingFollowUp,
  hasGenericPendingOffer,
  isAffirmativeFollowUpAnswer,
} from './follow-up';
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
import { officialSitesIn } from './intent/official-sites';
import {
  sourceLocationMessage,
  sourceLocationRequestIn,
} from './intent/source-location';
import { normalizeSpanishText } from '../rag/text-normalization';

/** Mensajes que se cargan al retomar una conversación (máximo de get_chat_conversation). */
export const CHAT_CONVERSATION_MESSAGE_LIMIT = 100;

/** Recupera el tema previo cuando se pide un documento por referencia indirecta. */
function refersToPreviouslyMentionedDocument(question: string): boolean {
  const text = question.toLocaleLowerCase('es');
  // Un número de norma identifica un tema propio; no lo sustituimos por el
  // documento citado en un turno anterior.
  if (/\d/u.test(text)) return false;
  return (
    /\b(?:descarg\p{L}*|abrir|ver)\b/iu.test(text) &&
    /\b(?:primero?|segundo?|tercero?|anterior(?:es)?|mencionad[oa]s?|ese|esa|esos|esas|descargarl[oa]s?|descargal[oa]s?)\b/iu.test(
      text,
    )
  );
}

/**
 * Contexto de una propuesta aceptada: conserva la cabecera (donde suele estar
 * el número de la norma) y la cola (donde está la propuesta), sin arrastrar
 * toda la respuesta. El RAG puede así heredar la referencia exacta.
 */
function acceptedFollowUpContext(content: string): string {
  if (content.length <= 2_000) return content;
  return `${content.slice(0, 800)}\n…\n${content.slice(-1_200)}`;
}

/** Nota fija cuando la respuesta se corta por su extensión (tope de tokens o de caracteres). */
export { RAG_TRUNCATION_NOTE };

export interface ChatSource {
  articleReference: string | null;
  documentId: string;
  documentSituation: RetrievedChunk['documentSituation'];
  documentTitle: string;
  documentType: string | null;
  documentVersionId: string;
  id: string;
  issuanceYear: number | null;
  mimeType: string | null;
  moduleName: string | null;
  numeralReference: string | null;
  pageEnd: number;
  pdfPageCount?: number;
  pageStart: number;
  rank: number;
  relevanceScore: number;
  relatedModuleName: string | null;
  relatedSubmoduleName: string | null;
  resolutionNumber: string | null;
  sectionTitle: string | null;
  versionNumber: number;
}

export interface ChatCatalogDocument {
  documentId: string;
  documentType: string;
  issuanceYear: number | null;
  mimeType: string;
  originalFileName: string;
  pageCount: number | null;
  resolutionNumber: string | null;
  title: string;
  versionId: string;
}

function toChatCatalogDocument(
  document: AvailableDocument,
): ChatCatalogDocument {
  return {
    documentId: document.id,
    documentType: document.documentType,
    issuanceYear: document.issuanceYear,
    mimeType: document.mimeType,
    originalFileName: document.originalFileName,
    pageCount: document.pageCount,
    resolutionNumber: document.resolutionNumber,
    title: document.title,
    versionId: document.versionId,
  };
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
  /** Respuesta definitiva cuando difiere del texto ya transmitido (citas por bloque). */
  | { data: { text: string }; type: 'answer' }
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
        /** Archivos elegibles del catálogo, independientes del top-k del RAG. */
        documents?: ChatCatalogDocument[];
      };
      type: 'conversational';
    }
  | {
      data: {
        conversationId: string;
        inReplyToMessageId: string;
        messageId: string;
        /** Temas recomendados al pie de una respuesta con panorama. */
        modules?: ResolvedModule[];
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
function clampScore(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * A deterministic post-generation control complements the evidence-only
 * prompt. It cannot decide legal truth, so it flags a case for human review
 * whenever a substantive claim lacks a source marker or its cited evidence has
 * no meaningful lexical bridge to the claim. Una lista sustentada por una sola
 * fuente se cubre con la cita en su introducción, y dos citas
 * individuales contiguas ([1][2]) son válidas: la corroboración entre el
 * documento oficial y otro que coincide es el formato esperado.
 */
function normalizedReviewExcerpt(claim: string): string {
  return claim.replace(/\s+/gu, ' ').trim().slice(0, 2_000);
}

interface AnswerSegment {
  text: string;
  isListItem: boolean;
}

interface QualityClaim {
  claim: string;
  isListItem: boolean;
  blockCitations: number[];
}

/**
 * Divide un párrafo en segmentos de prosa y de lista. Cada viñeta empieza un
 * segmento propio aunque no lleve punto final, para verificar su cita por
 * separado; las líneas indentadas continúan la viñeta anterior.
 */
function paragraphSegments(paragraph: string): AnswerSegment[] {
  const segments: AnswerSegment[] = [];
  let current: string[] = [];
  let currentIsListItem = false;
  const flush = () => {
    if (!current.length) return;
    segments.push({ text: current.join('\n'), isListItem: currentIsListItem });
    current = [];
    currentIsListItem = false;
  };

  for (const line of paragraph.split('\n')) {
    if (LIST_ITEM_LINE.test(line)) {
      flush();
      currentIsListItem = true;
      current.push(line);
      continue;
    }
    if (currentIsListItem && /^[ \t\u00A0]+/u.test(line)) {
      current.push(line);
      continue;
    }
    if (currentIsListItem) flush();
    current.push(line);
  }
  flush();
  return segments;
}

/**
 * Afirmaciones de un párrafo con la cita de bloque que las cubre, si la hay.
 * La introducción es el bloque de prosa inmediatamente anterior a cada lista;
 * se recogen sus citas aunque la frase esté partida en varias líneas.
 */
function paragraphClaims(paragraph: string): QualityClaim[] {
  const segments = paragraphSegments(paragraph);
  return segments.flatMap((segment, index) => {
    let blockCitations: number[] = [];
    if (segment.isListItem) {
      let runStart = index;
      while (runStart > 0 && segments[runStart - 1].isListItem) {
        runStart -= 1;
      }
      const intro = runStart > 0 ? segments[runStart - 1] : null;
      blockCitations = intro ? [...new Set(citedIndexes(intro.text))] : [];
    }
    return [...segment.text.matchAll(CLAIM_PATTERN)].map((match) => ({
      claim: match[0].replace(/∶/gu, '.').trim(),
      isListItem: segment.isListItem,
      blockCitations,
    }));
  });
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
  const normalizedAnswer = answer
    .replace(/\r/gu, '')
    // N.° y numerales decimales no terminan una oración.
    .replace(/N\.\s*°/giu, 'N°')
    .replace(/(?<=\d)\.(?=\d)/gu, '∶')
    // Los modelos separan los elementos de una lista con líneas en blanco; se
    // tratan como un solo bloque para reconocer la introducción de cada lista.
    .replace(/\n{2,}(?=[ \t\u00A0]*(?:[-*•–—]|\d+[.)])[ \t\u00A0])/gu, '\n');
  const claims = normalizedAnswer
    .split(/\n{2,}/gu)
    .flatMap(paragraphClaims)
    .filter(({ claim, isListItem }) => {
      const withoutCitation = withoutCitations(claim);
      const text = withoutCitation.replace(LIST_ITEM_LINE, '');
      // La longitud se mide antes de retirar el marcador, como antes: una
      // viñeta de 30 caracteres no deja de revisarse por el guion.
      return (
        withoutCitation.replace(/\s+/gu, '').length >=
          MIN_SUBSTANTIVE_CLAIM_CHARS ||
        // Una viñeta breve con una fecha o una cifra también es verificable;
        // «Sí» o «No» no añaden ruido a la revisión.
        (isListItem &&
          (/\d{2,}/u.test(text) ||
            (/\d/u.test(text) && /\p{L}{2}/u.test(text))))
      );
    });

  for (const [
    index,
    { claim, isListItem, blockCitations },
  ] of claims.entries()) {
    // Solo la pregunta de cierre (la última del mensaje) no exige cita: es una
    // invitación al siguiente paso, no una afirmación.
    if (
      index === claims.length - 1 &&
      (claim.startsWith('¿') || /\?\s*$/u.test(claim))
    ) {
      continue;
    }

    const citationIndexes = citedIndexes(claim);
    if (!citationIndexes.length) {
      // Cita de bloque: la cita de la introducción de la lista cubre sus
      // ítems, nunca la prosa del párrafo (una afirmación suelta debe llevar
      // su propia cita).
      const blockSources = (isListItem ? blockCitations : [])
        .map((rank) => sources[rank - 1])
        .filter((source): source is RetrievedChunk => Boolean(source));
      if (blockSources.length) {
        // Cada ítem debe quedar respaldado por una sola fuente del bloque: no
        // se combinan el puente léxico de una con las cifras de otra.
        if (
          !blockSources.some(
            (source) =>
              sourceSupportsClaim(claim, source) &&
              claimNumbersAppearInSources(claim, [source]),
          )
        ) {
          signals.add('citation_insufficient');
          excerpts.citation_insufficient ??= normalizedReviewExcerpt(claim);
        }
        continue;
      }
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
      documentId: source.documentId,
      documentSituation: source.documentSituation,
      documentTitle: source.documentTitle,
      documentType: source.documentType ?? null,
      documentVersionId: source.documentVersionId,
      id: sourceId,
      issuanceYear: source.issuanceYear ?? null,
      mimeType: source.mimeType ?? null,
      moduleName: citationModuleName(source, citationModuleId),
      numeralReference: source.numeralReference,
      pageEnd: source.pageEnd,
      ...(source.pdfPageCount ? { pdfPageCount: source.pdfPageCount } : {}),
      pageStart: source.pageStart,
      rank: index + 1,
      relevanceScore,
      relatedModuleName: relatedModule?.name ?? null,
      relatedSubmoduleName: relatedSubmodule?.name ?? null,
      resolutionNumber: source.resolutionNumber ?? null,
      sectionTitle: source.sectionTitle,
      versionNumber: source.versionNumber,
    });
  });

  return { inputs, sources };
}

function moduleMention(modules: ResolvedModule[]): string | null {
  const names = [...new Set(modules.map((module) => module.name.trim()))]
    .filter(Boolean)
    .slice(0, 4);
  if (!names.length) return null;
  if (names.length === 1) return `el tema ${names[0]}`;
  if (names.length === 2) return `los temas ${names[0]} y ${names[1]}`;
  return `los temas ${names.slice(0, -1).join(', ')} y ${names.at(-1)}`;
}

/**
 * Temas recomendados al pie de una respuesta. En una ruta ambigua se ofrecen
 * los módulos en conflicto; en una respuesta ya resuelta, los módulos de las
 * fuentes recuperadas. Así el panorama salarial conserva los botones que antes
 * solo acompañaban a la aclaración.
 */
function recommendedModules(
  modules: readonly ResolvedModule[] | null,
  sources: readonly RetrievedChunk[],
): ResolvedModule[] {
  if (modules?.length) return [...modules].slice(0, 4);
  const found = new Map<string, ResolvedModule>();
  for (const source of sources) {
    source.moduleIds.forEach((id, index) => {
      const name = source.moduleNames[index];
      if (!id || !name || found.has(id)) return;
      found.set(id, { id, name });
    });
  }
  return [...found.values()].slice(0, 4);
}

/**
 * Una consulta de remuneración amplia no admite un monto único: antes de
 * comparar resultados del RAG, hay que conocer la condición que cambia la
 * respuesta. Esta detección solo ajusta el lenguaje de la aclaración; no
 * aporta importes, normas ni hechos que las fuentes no hayan confirmado.
 */
function isEducatorRemunerationQuestion(question: string): boolean {
  const normalized = normalizeSpanishText(question);
  const remunerationTerm =
    /\b(?:remuneracion(?:es)?|sueldo(?:s)?|salario(?:s)?|ingreso(?:s)?|pago(?:s)?|gana(?:n)?|cobra(?:n)?|percibe(?:n|r)?)\b/u;
  const educatorTerm =
    /\b(?:docente(?:s)?|profesor(?:a|as|es)?|maestr(?:o|a|os|as)|auxiliar(?:es)?|direct(?:or|ora|ores|oras))\b/u;

  return remunerationTerm.test(normalized) && educatorTerm.test(normalized);
}

/**
 * La ambigüedad es una señal de que el RAG halló rutas posibles, no una base
 * para atribuir un extracto o un monto al caso de la persona. Se mencionan los
 * temas recuperados y se solicita la condición decisiva; las citas solo se
 * exhiben cuando una respuesta concreta puede sustentarse de forma segura.
 */
function ambiguityMessage(question: string, modules: ResolvedModule[]): string {
  const foundTopics = moduleMention(modules);
  if (isEducatorRemunerationQuestion(question)) {
    const context = foundTopics
      ? `La búsqueda encontró información relacionada con ${foundTopics}.`
      : '';
    return [
      'Puedo darte el panorama de la remuneración docente con las condiciones que cambian la cifra.',
      context,
      'Para afinar tu caso, ¿tu consulta es del sector público o privado?',
    ]
      .join(' ')
      .replace(/\s{2,}/gu, ' ')
      .trim();
  }

  const context = foundTopics
    ? `La búsqueda encontró información relacionada con ${foundTopics}.`
    : '';
  return [
    'Para orientarte con precisión necesito identificar el trámite antes de elegir una respuesta.',
    context,
    '¿Qué trámite o proceso concreto deseas consultar?',
  ]
    .join(' ')
    .replace(/\s{2,}/gu, ' ')
    .trim();
}

/**
 * Sustitución segura cuando una tabla salarial no permite asociar el importe
 * con la condición correcta. Se prefiere pedir el dato decisivo antes que
 * mostrar una cifra que podría pertenecer a otra fila.
 */
function salaryEvidenceClarificationMessage(): string {
  return 'Tengo información salarial, pero necesito un dato para no darte una cifra equivocada: ¿me confirmas tu jornada, vínculo, cargo o escala?';
}

/**
 * Factores salariales que hereda un turno. Una propuesta aceptada solo hereda
 * si la consulta efectiva sigue siendo salarial o declara un factor de la
 * cifra; el texto de la propuesta nunca cuenta como declaración de la persona.
 */
export function salaryQuestionsForTurn(input: {
  acceptedQuestion: string | null;
  effectiveQuestion: string;
  forceSalaryContext: boolean;
  priorUserQuestions: readonly string[];
}): string[] {
  const profile = salaryQuestionProfile(input.effectiveQuestion);
  const normalized = normalizeSpanishText(input.effectiveQuestion);
  const factorFollowUp =
    /^(?:¿\s*)?(?:y|e|pero|entonces|ademas|tambien|o)\b/u.test(normalized) ||
    refersBack(input.effectiveQuestion) ||
    /\b(?:para|en|del?) (?:el |la )?(?:cargo|nivel|escala|condicion|regimen|ano)\b/u.test(
      normalized,
    );
  if (input.acceptedQuestion) {
    // Una pregunta con tema propio que solo menciona horas (por ejemplo, una
    // licencia de 40 horas) no es una consulta salarial y no hereda factores.
    const topicText = normalized.replace(
      /\b(?:horas?|jornadas?|carga horaria|escala magisterial|escala remunerativa)\b/gu,
      ' ',
    );
    if (
      !profile.isSalaryQuestion &&
      !(factorFollowUp && !hasTopicTerm(topicText))
    ) {
      return [];
    }
    // Un cambio explícito de cargo no hereda el año, la jornada ni la escala de
    // la consulta anterior: son factores de otro perfil.
    const priorSalaryQuestion = [...input.priorUserQuestions]
      .reverse()
      .find((prior) => salaryQuestionProfile(prior).isSalaryQuestion);
    const priorRole = priorSalaryQuestion
      ? salaryQuestionProfile(priorSalaryQuestion).role
      : null;
    if (
      profile.role !== null &&
      priorRole !== null &&
      profile.role !== priorRole
    ) {
      return [];
    }
    // Una propuesta aceptada solo hereda factores cuando la pregunta efectiva
    // declara uno de ellos (horas, escala, cargo, condición o año). Una
    // consulta salarial nueva («¿cuánto gana un director?») no arrastra el año
    // o la jornada de la consulta anterior.
    const declaresFactor =
      profile.jornadaHours !== null ||
      profile.scale !== null ||
      profile.asksSpecialAllocation ||
      (factorFollowUp &&
        (profile.condition !== null ||
          profile.role !== null ||
          profile.year !== null));
    if (!declaresFactor) return [];
    return inheritedFactorQuestions(
      input.effectiveQuestion,
      input.priorUserQuestions,
      true,
    );
  }
  return inheritedFactorQuestions(
    input.effectiveQuestion,
    input.priorUserQuestions,
    input.forceSalaryContext,
  );
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

/**
 * Hueco del módulo legal: la ley y su reglamento no están cargados como
 * documentos. Se nombra la carencia concreta para no sustituirla por normas
 * relacionadas ni por conocimiento externo.
 */
export function legalEvidenceGapMessage(question: string): string {
  const subject = '';
  const asked = normalizeSpanishText(question);
  if (/\bderechos?\b/u.test(asked) && /\bdeberes?\b/u.test(asked)) {
    return `No encontré en el corpus el texto de la Ley N.º 29944 (Ley de Reforma Magisterial) ni el de su Reglamento, aprobado por D. S. N.º 004-2013-ED${subject}. Sin ese texto no puedo enumerar los derechos ni los deberes de los docentes ni citar sus artículos. Las normas relacionadas que citan la ley no sustituyen su texto.`;
  }
  const base = `No encontré en el corpus el texto de la Ley N.º 29944 (Ley de Reforma Magisterial) ni el de su Reglamento, aprobado por D. S. N.º 004-2013-ED${subject}.`;
  const matter = legalTopic(question);
  if (matter === 'generic') {
    return `No encontré en el corpus la norma específica que responde a esta consulta dentro del módulo «Ley y reglamento»${subject}. Las normas que solo citan la ley no sustituyen su texto; indícame el número o el artículo concreto si lo conoces.`;
  }
  if (matter === 'rights') {
    return `${base} Sin ese texto no puedo enumerar los derechos de los docentes ni citar sus artículos. Las normas relacionadas que citan la ley no sustituyen su texto.`;
  }
  if (matter === 'duties') {
    return `${base} Sin ese texto no puedo enumerar los deberes de los docentes ni citar sus artículos. Las normas relacionadas que citan la ley no sustituyen su texto.`;
  }
  if (matter === 'modification') {
    return `${base} Sin el texto de la norma modificatoria no puedo determinar qué artículo cambió ni si el texto original sigue vigente. Las normas relacionadas que citan la ley no sustituyen su texto.`;
  }
  if (matter === 'regulation') {
    return `${base} Son dos normas distintas: la ley y su reglamento; como no están cargadas, no puedo comparar su contenido ni citar sus artículos.`;
  }
  return `${base} Por eso no puedo darte una explicación verificada de sus artículos. Las normas relacionadas que citan la ley no sustituyen su texto.`;
}

/**
 * Negativa verificable cuando la persona pide una norma concreta que no forma
 * parte de la evidencia aprobada. Solo repite identidades extraídas de la
 * pregunta: no completa títulos, vigencia ni contenido con conocimiento del
 * modelo.
 */
export function missingExactReferencesMessage(
  references: readonly { display: string }[],
): string {
  const labels = references.map(({ display }) => display);
  const named =
    labels.length <= 1
      ? labels[0]
      : `${labels.slice(0, -1).join(', ')} y ${labels.at(-1)}`;
  return `No encontré evidencia disponible y aprobada de ${named}. Para no atribuirle contenido de otra norma, no usaré documentos parecidos como sustituto. Verifica el número indicado o vuelve a consultar cuando el documento esté disponible.`;
}

/** Solicita completar una identidad normativa antes de buscar por similitud. */
export function incompleteExactReferencesMessage(
  references: readonly { display: string }[],
): string {
  const labels = references.map(({ display }) => display);
  const named =
    labels.length <= 1
      ? labels[0]
      : `${labels.slice(0, -1).join(', ')} y ${labels.at(-1)}`;
  const subject = labels.length > 1 ? 'Las referencias' : 'La referencia';
  const state = labels.length > 1 ? 'no están completas' : 'no está completa';
  return `${subject} ${named} ${state} para identificar una norma sin ambigüedad. Indica el número, el año y la entidad emisora tal como aparecen en el documento; hasta entonces no usaré una norma parecida como sustituto.`;
}

/** Marca del modo asesor, tolerante a variantes («[[FUERA_DE_ÁMBITO]]»). */
const ADVISORY_OUT_OF_SCOPE_MARKER_PATTERN =
  /\[\[\s*FUERA[\s_-]*DE[\s_-]*[AÁ]MBITO\s*\]\]/iu;
/** Tope de la respuesta amable a un pedido ajeno: dos o tres frases. */
const MAX_ADVISORY_OUT_OF_SCOPE_CHARS = 600;

/** Los módulos activos cambian poco: se releen cada 2 minutos. */
const MODULES_CACHE_MS = 2 * 60 * 1000;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private modulesCache: {
    expiresAt: number;
    promise: Promise<ActiveChatModule[]>;
  } | null = null;

  constructor(
    @Inject(RAG_ANSWER_GATEWAY) private readonly answerGateway: AnswerGateway,
    @Inject(SUPABASE_CHAT_GATEWAY)
    private readonly historyGateway: ChatHistoryGateway,
    private readonly ragService: RagService,
    private readonly configService: ConfigService,
    private readonly faqMemoryService: FaqMemoryService,
    @Optional() private readonly catalogService?: ChatCatalogService,
    @Optional()
    @Inject(SUPABASE_TEACHER_UPDATES_GATEWAY)
    private readonly teacherUpdates?: TeacherUpdatesGateway,
  ) {}

  /**
   * Consultas del docente que quedaron sin sustento y ya se resolvieron (se
   * cargó la documentación), de los últimos 30 días: puede volver a preguntar.
   */
  listUpdates(
    authorization: AuthorizationContext,
  ): Promise<ResolvedConsultation[]> {
    if (!this.teacherUpdates) return Promise.resolve([]);
    const since = new Date(
      Date.now() - TEACHER_UPDATES_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();
    return this.teacherUpdates.listResolvedConsultations({
      since,
      userId: authorization.userId,
    });
  }

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
    disposition: 'attachment' | 'inline' = 'inline',
  ): Promise<ChatSourceDownload> {
    return this.historyGateway.createSourceDownloadUrl({
      disposition,
      sourceId,
      ttlSeconds: 60,
      userId: authorization.userId,
    });
  }

  createCatalogDocumentDownloadUrl(
    documentVersionId: string,
    authorization: AuthorizationContext,
  ): Promise<ChatCatalogDocumentDownload> {
    return this.historyGateway.createCatalogDocumentDownloadUrl({
      documentVersionId,
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
    // Las correcciones automáticas de una letra se usan solo para entender y
    // buscar; en el historial queda exactamente lo que la persona escribió.
    // Si la corrección necesita inferir más de una letra o empata entre
    // conceptos, se pide confirmación antes de consultar el corpus.
    const recovery = recoverDomainQuery(input.question);
    const question = recovery.normalizedQuestion;

    const intent = classifyTurnIntent(question, {
      inConversation: Boolean(input.conversationId),
    });

    if (
      recovery.clarification &&
      intent.lane === 'domain' &&
      (!input.conversationId ||
        hasStrongDomainSignal(normalizeSpanishText(question)))
    ) {
      yield* this.askForOrthographicClarification({
        clarification: recovery.clarification,
        conversationId: input.conversationId,
        question: input.question,
        userId: input.authorization.userId,
      });
      return;
    }

    // Metapetición sobre la propia conversación: se responde con la memoria de
    // la sesión y no con el corpus. Sin turno nuevo: es una vista efímera, igual
    // que el catálogo, y no debe entrar a la cola de consultas sin sustento.
    if (isConversationSummaryRequest(question)) {
      yield* this.conversationSummary({
        abortSignal: input.abortSignal,
        conversationId: input.conversationId,
        question,
        userId: input.authorization.userId,
      });
      return;
    }

    // «Sí», «claro», «dale»… Antes de responder como charla, se comprueba si la
    // última respuesta propia dejó una propuesta pendiente. Si existe, la
    // consulta efectiva es esa propuesta; en el historial queda el «sí» real.
    let acceptedQuestion: string | null = null;
    let prefetchedContext: ChatConversationContext | null = null;
    if (input.conversationId && isAffirmativeFollowUpAnswer(question)) {
      try {
        prefetchedContext = this.historyGateway.getConversationSnapshot
          ? await this.historyGateway.getConversationSnapshot({
              conversationId: input.conversationId,
              limit: MAX_CHAT_CONTEXT_MESSAGES,
              userId: input.authorization.userId,
            })
          : await this.historyGateway.getConversationContext({
              characterLimit: MAX_CHAT_CONTEXT_CHARS,
              conversationId: input.conversationId,
              messageLimit: MAX_CHAT_CONTEXT_MESSAGES,
              userId: input.authorization.userId,
            });
        acceptedQuestion =
          extractPendingFollowUp(prefetchedContext.messages)?.question ?? null;
      } catch (error) {
        this.logger.warn(
          `No se pudo comprobar la propuesta pendiente: ${
            error instanceof Error ? error.message : 'error desconocido'
          }`,
        );
      }
    }
    const acceptedModuleChanged = Boolean(
      acceptedQuestion &&
      prefetchedContext &&
      input.selectedModuleId !== null &&
      input.selectedModuleId !== prefetchedContext.selectedModuleId,
    );
    if (acceptedModuleChanged) {
      // El usuario cambió de módulo mientras la conversación estaba abierta: su
      // elección manda y no se reutiliza una propuesta del módulo anterior.
      acceptedQuestion = null;
    }
    const effectiveQuestion = acceptedQuestion ?? question;

    if (acceptedQuestion && isConversationSummaryRequest(acceptedQuestion)) {
      yield* this.conversationSummary({
        abortSignal: input.abortSignal,
        conversationId: input.conversationId,
        question: acceptedQuestion,
        userId: input.authorization.userId,
      });
      return;
    }

    if (
      input.conversationId &&
      !acceptedQuestion &&
      isAffirmativeFollowUpAnswer(question) &&
      prefetchedContext &&
      hasGenericPendingOffer(prefetchedContext.messages)
    ) {
      // «¿Necesitas algo más?» / «¿Quieres saber más?»: un «sí» no tiene tema
      // para el RAG; se responde con calidez y se pide la consulta concreta.
      yield {
        data: { message: buildConversationalReply('acknowledgment') },
        type: 'conversational',
      };
      return;
    }

    if (
      input.conversationId &&
      !acceptedQuestion &&
      isAffirmativeFollowUpAnswer(question) &&
      prefetchedContext?.messages.at(-1)?.role === 'clarification'
    ) {
      const pendingClarification =
        prefetchedContext.messages.at(-1)?.content ?? '';
      if (
        pendingClarification.includes('Para no adivinar entre esas opciones,')
      ) {
        // Una duda ortográfica con alternativas empatadas no tiene botones ni
        // una propuesta aceptable con «sí»: se pide reescribir la palabra.
        yield {
          data: {
            message:
              'Para continuar, escribe de otra forma la palabra que te señalé. Así evito elegir una opción equivocada por ti.',
          },
          type: 'conversational',
        };
        return;
      }
      // El turno anterior pidió un dato o eligió entre varios temas. Un «sí» a
      // secas no responde esa pregunta: se invita a usar las opciones que ya
      // están en pantalla en vez de buscar «sí» en el corpus y caer en
      // «sin evidencia».
      yield {
        data: {
          message:
            'Para continuar, elige uno de los temas que te mostré en los botones o escríbeme el trámite o proceso concreto que quieres consultar.',
        },
        type: 'conversational',
      };
      return;
    }

    if (
      !acceptedQuestion &&
      intent.lane === 'social' &&
      intent.subtype === 'catalog' &&
      input.selectedModuleId
    ) {
      const scoped = await this.overviewReply(question, {
        forceSelected: true,
        inConversation: false,
        selectedModuleId: input.selectedModuleId,
      });
      if (scoped) {
        yield scoped;
        return;
      }
    }
    if (
      !acceptedQuestion &&
      (intent.lane === 'social' || intent.lane === 'out_of_scope')
    ) {
      const reply = await this.conversationalReply(
        intent.subtype,
        input.authorization.role,
        input.abortSignal,
        question,
        input.selectedModuleId,
      );
      // «Otra consulta» a secas dentro de una conversación: la siguiente
      // pregunta debe empezar una conversación nueva, sin el tema anterior.
      if (
        reply.type === 'conversational' &&
        input.conversationId &&
        intent.lane === 'social' &&
        intent.subtype === 'ask_announcement' &&
        announcesNewTopic(question)
      ) {
        reply.data.startsNewTopic = true;
      }
      yield reply;
      return;
    }

    // «¿De qué trata la remuneración?»: panorama del tema con sus documentos
    // y un resumen corto de cada uno, en lugar de buscar una cita puntual. Una
    // propuesta aceptada que pide el panorama usa la misma ruta.
    const overview = await this.overviewReply(effectiveQuestion, {
      inConversation:
        Boolean(input.conversationId) || Boolean(acceptedQuestion),
      selectedModuleId: input.selectedModuleId,
    });
    if (overview) {
      yield overview;
      return;
    }

    const faqMemory = this.faqMemoryService.prepare(
      acceptedQuestion ?? input.question,
    );

    // Primera consulta sin tema ni módulo elegido: se pide precisar el trámite
    // antes de buscar (tantas interpretaciones como procesos).
    if (
      !acceptedQuestion &&
      !input.conversationId &&
      !input.selectedModuleId &&
      isTopiclessQuestion(effectiveQuestion)
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
      Boolean(input.conversationId) && announcesNewTopicWithSubject(question);
    const storedContext =
      prefetchedContext ??
      (input.conversationId && !explicitTopicChange
        ? await this.historyGateway.getConversationContext({
            characterLimit: MAX_CHAT_CONTEXT_CHARS,
            conversationId: input.conversationId,
            messageLimit: MAX_CHAT_CONTEXT_MESSAGES,
            userId: input.authorization.userId,
          })
        : null);
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
    const explanation = jornadaClarificationExplanation(
      question,
      conversationContext.at(-1),
    );
    if (explanation) {
      if (input.abortSignal?.aborted) return;
      const turn = await this.historyGateway.beginTurn({
        conversationId,
        question: input.question,
        selectedModuleId,
        userId: input.authorization.userId,
      });
      yield {
        type: 'conversation',
        data: {
          conversationId: turn.conversationId,
          moduleId: selectedModuleId,
          startedNewConversation,
          userMessageId: turn.userMessageId,
        },
      };
      if (input.abortSignal?.aborted) return;
      const completed = await this.historyGateway.completeTurn({
        answer: explanation,
        conversationId: turn.conversationId,
        faqMemory,
        qualitySignals: [],
        replyRole: 'clarification',
        retrievalScope: detectRetrievalScope(question),
        sources: [],
        topRelevanceScore: null,
        unansweredReason: 'ambiguous_request',
        userId: input.authorization.userId,
        userMessageId: turn.userMessageId,
      });
      yield {
        type: 'clarification',
        data: { message: explanation, modules: [] },
      };
      yield {
        type: 'done',
        data: {
          conversationId: turn.conversationId,
          inReplyToMessageId: turn.userMessageId,
          messageId: completed.answerMessageId,
          provider: 'rule',
        },
      };
      return;
    }
    const priorUserQuestions = conversationContext
      .filter(
        (message, index) =>
          message.role === 'user' &&
          !jornadaClarificationExplanation(
            message.content,
            conversationContext[index - 1],
          ),
      )
      .map((message) => message.content);
    let selectedModuleName: string | null = null;
    if (selectedModuleId) {
      try {
        selectedModuleName =
          (await this.cachedModules())
            .find((module) => module.id === selectedModuleId)
            ?.name?.trim() ?? null;
      } catch {
        selectedModuleName = null;
      }
    }
    const legalModule = isLegalModuleName(selectedModuleName);
    const legalCrossModule = Boolean(
      legalModule &&
        (isLegalQuestion(effectiveQuestion) ||
          priorUserQuestions.some((prior) => isLegalQuestion(prior))),
    );
    // Una pregunta sin tema tampoco se responde como seguimiento: si ni la
    // consulta actual ni las anteriores nombran un proceso, hay tantas
    // interpretaciones como temas y corresponde pedir precisión. Cubre el
    // reintento tras un fallo (la segunda pregunta idéntica llegaba con la
    // conversación vacía y el contexto la resolvía como si tuviera tema).
    if (
      !acceptedQuestion &&
      !selectedModuleId &&
      isTopiclessQuestion(effectiveQuestion) &&
      !priorUserQuestions.some((prior) =>
        hasTopicTerm(normalizeSpanishText(prior)),
      )
    ) {
      yield* this.askForTopic({
        conversationId,
        faqMemory,
        question: input.question,
        userId: input.authorization.userId,
      });
      return;
    }
    const documentFollowUp =
      continuesConversation &&
      refersToPreviouslyMentionedDocument(effectiveQuestion);
    const lastDocumentAnswer = documentFollowUp
      ? [...conversationContext]
          .reverse()
          .find(
            (message) =>
              message.role === 'assistant' &&
              /\b(?:documento|fuente|norma|resoluci[oó]n|anexo)\b/iu.test(
                message.content,
              ),
          )
      : null;
    // La propuesta aceptada suele usar deícticos («estos cargos»): se entrega
    // solo su cola (donde está la propuesta) para resolver la referencia sin
    // arrastrar cifras o factores salariales del resto de la respuesta. Las
    // consultas salariales previas solo se pasan aparte si el turno sigue
    // siendo salarial.
    const acceptedAnswer = acceptedQuestion
      ? [...conversationContext]
          .reverse()
          .find((message) => message.role !== 'user')
      : null;
    // La propuesta aceptada exige contexto para resolver deícticos, pero no es
    // una declaración salarial: los factores solo se heredan si la consulta
    // efectiva continúa realmente ese hilo. La misma lista se usa para
    // recuperar y para redactar, sin que el RAG vuelva a heredar por su cuenta.
    const forceSalaryContext =
      Boolean(lastDocumentAnswer) ||
      conversationContext.at(-1)?.role === 'clarification';
    const inheritedSalaryQuestions = salaryQuestionsForTurn({
      acceptedQuestion,
      effectiveQuestion,
      forceSalaryContext,
      priorUserQuestions,
    });
    const personalSalary = hasPersonalSalaryContext(
      effectiveQuestion,
      priorUserQuestions,
    );
    // El contexto de recuperación conserva el tema, no la consulta salarial,
    // cuando el turno actual no es salarial. Así un pedido de documentos no
    // arrastra «cuánto gana un docente» a la búsqueda vectorial.
    const salaryRetrievalRequest =
      salaryQuestionProfile(effectiveQuestion).isSalaryQuestion ||
      inheritedSalaryQuestions.length > 0;
    const retrievalTopicContext = salaryRetrievalRequest
      ? priorUserQuestions
      : priorUserQuestions.filter(
          (prior) => !salaryQuestionProfile(prior).isSalaryQuestion,
        );
    // La respuesta anterior solo entra en la búsqueda cuando la propuesta tiene
    // un deíctico que resolver («estos cargos»).
    const acceptedAnswerContext =
      acceptedAnswer && refersBack(effectiveQuestion)
        ? [
            `Propuesta aceptada: ${acceptedFollowUpContext(acceptedAnswer.content)}`,
          ]
        : [];
    const retrievalContext = acceptedAnswer
      ? [...acceptedAnswerContext, ...retrievalTopicContext]
      : lastDocumentAnswer
        ? [
            ...retrievalTopicContext,
            `Respuesta anterior: ${lastDocumentAnswer.content.slice(0, 2000)}`,
          ]
        : retrievalTopicContext;
    const forceContext =
      Boolean(acceptedQuestion) ||
      Boolean(lastDocumentAnswer) ||
      conversationContext.at(-1)?.role === 'clarification' ||
      inheritedSalaryQuestions.length > 0;
    const selectedTopicContext = this.internalTopicContext(selectedModuleId);
    const retrieval = await this.ragService.retrieve(
      effectiveQuestion,
      selectedModuleId,
      retrievalContext,
      {
        forceContext,
        ...(legalModule
          ? {
              legalModule: true,
              legalCrossModule: true,
              selectedModuleName,
            }
          : {}),
        ...(personalSalary ? { personalSalary: true } : {}),
        ...(acceptedQuestion
          ? { salaryContextQuestions: inheritedSalaryQuestions }
          : {}),
      },
    );
    // La respuesta a una aclaración no repite la consulta salarial: el perfil
    // hereda los factores que la persona ya declaró en los turnos previos.
    const salaryQuestion = withInheritedSalaryFactors(
      effectiveQuestion,
      inheritedSalaryQuestions,
    );

    if (input.abortSignal?.aborted) return;

    const retrievalScope = detectRetrievalScope(effectiveQuestion);
    // Un panorama salarial no exige una cifra en la evidencia: una norma que
    // dice de qué depende la remuneración del cargo ya permite responder lo
    // que consta y explicar qué monto falta. Sin evidencia del tema, la
    // aclaración sigue siendo la salida correcta.
    const broadSalaryAnswerTurn =
      (retrieval.kind === 'ambiguous' ||
        retrieval.kind === 'evidence' ||
        retrieval.kind === 'topic_change') &&
      !personalSalary &&
      isBroadSalaryQuestion(salaryQuestion) &&
      hasSalaryPanoramaEvidence(
        retrieval.sources,
        retrievalScope,
        salaryQuestion,
      );
    const salaryProfileForTurn = salaryQuestionProfile(salaryQuestion);
    // La RIM de primera escala con jornada y vínculo expresos tiene una regla
    // aritmética comprobable. También en un caso personal se responde con esa
    // extracción, sin dejar que el modelo mezcle una tabla de contratados.
    const deterministicFirstScaleSalary =
      personalSalary &&
      salaryProfileForTurn.condition === 'nombrado' &&
      salaryProfileForTurn.role === 'docente' &&
      salaryProfileForTurn.scale === '1' &&
      salaryProfileForTurn.jornadaHours !== null;
    const deterministicRemunerationTopic =
      isAscensoRemunerationQuestion(salaryQuestion) ||
      isRuralPadronQuestion(salaryQuestion) ||
      isRuralAllocationQuestion(salaryQuestion) ||
      isPayrollReviewQuestion(salaryQuestion);

    // Los botones de temas que antes acompañaban a la aclaración se conservan en
    // la respuesta: el panorama salarial no debe dejar la conversación sin una
    // ruta sugerida. Se prefieren las rutas en conflicto y, si no las hay, los
    // módulos de las fuentes recuperadas.
    const broadSalaryModules = broadSalaryAnswerTurn
      ? recommendedModules(
          retrieval.kind === 'ambiguous' ? retrieval.modules : null,
          retrieval.sources,
        )
      : [];

    if (retrieval.kind === 'topic_change') {
      conversationId = null;
      conversationContext = [];
      startedNewConversation = true;
      selectedModuleId = retrieval.resolvedModule.id;
    } else if (
      retrieval.kind === 'ambiguous' &&
      selectedModuleId &&
      !acceptedQuestion
    ) {
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
      // Si la propuesta aceptada abre una conversación nueva (cambio de tema),
      // el turno nuevo guarda la consulta efectiva; un «sí» aislado no tendría
      // contexto en el historial. Dentro de la misma conversación se conserva
      // exactamente lo que escribió la persona.
      question:
        acceptedQuestion && startedNewConversation
          ? effectiveQuestion
          : input.question,
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

    // CR-08 (punto 4): «dame el enlace», «¿en qué página…?», «¿en qué minuto…?».
    // Se responde de forma determinista —sin invocar al proveedor— con la
    // identidad, la página física y la referencia enlazable de las fuentes ya
    // recuperadas: el modelo negaba una capacidad que la interfaz sí ofrece
    // (OBS-007) y una pregunta por «minuto» de un PDF no se corregía (OBS-012).
    // Corre antes de las aclaraciones: quien pide dónde está el documento no
    // está preguntando un monto ni una causal.
    if (
      (retrieval.kind === 'evidence' || retrieval.kind === 'topic_change') &&
      !deterministicFirstScaleSalary
    ) {
      const locationRequest = sourceLocationRequestIn(effectiveQuestion, {
        inConversation: continuesConversation,
      });
      if (locationRequest) {
        const citations = toCitationBundle(
          retrieval.sources,
          selectedModuleId,
          relatedModule,
          relatedSubmodule,
        );
        const message = sourceLocationMessage({
          asksMinute: locationRequest.asksMinute,
          sources: retrieval.sources,
        });
        if (message) {
          if (input.abortSignal?.aborted) return;
          const completed = await this.historyGateway.completeTurn({
            answer: message,
            conversationId: turn.conversationId,
            faqMemory,
            detectedModuleId: relatedModule?.id ?? null,
            detectedSubmoduleId: relatedSubmodule?.id ?? null,
            qualitySignals: [],
            replyRole: 'assistant',
            retrievalScope,
            sources: citations.inputs,
            topRelevanceScore: retrieval.topRelevanceScore,
            unansweredReason: null,
            userId: input.authorization.userId,
            userMessageId: turn.userMessageId,
          });
          yield { data: { sources: citations.sources }, type: 'sources' };
          yield { data: { text: message }, type: 'token' };
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
      }
    }

    if (retrieval.kind === 'no_evidence') {
      // Sin sustento no se consulta al modelo: cualquier orientación factual
      // sin fuentes sería indistinguible de una alucinación. Para una norma
      // nombrada, la negativa repite únicamente su identidad; para un pedido
      // aparentemente ajeno se usa la plantilla conversacional existente.
      const unrelated =
        !input.conversationId &&
        !selectedModuleId &&
        !hasEducationalSignal(effectiveQuestion);
      const message = legalCrossModule
        ? legalEvidenceGapMessage(effectiveQuestion)
        : retrieval.incompleteExactReferences?.length
          ? incompleteExactReferencesMessage(
              retrieval.incompleteExactReferences,
            )
          : retrieval.missingExactReferences?.length
            ? missingExactReferencesMessage(retrieval.missingExactReferences)
            : unrelated
              ? buildConversationalReply('unrelated_no_evidence')
              : undefined;
      yield* this.completeWithoutEvidence({
        conversationId: turn.conversationId,
        faqMemory,
        message,
        retrievalScope,
        topRelevanceScore: retrieval.topRelevanceScore,
        userId: input.authorization.userId,
        userMessageId: turn.userMessageId,
      });
      return;
    }

    if (retrieval.kind === 'ambiguous') {
      // Una consulta salarial general no se bloquea por la sola ambigüedad de
      // ruta: si la evidencia trata la remuneración del cargo, se responde con
      // el panorama y sus condiciones, aunque falte la cifra. La aclaración se
      // reserva para el caso propio o cuando la evidencia recuperada no trata
      // el tema consultado.
      if (!broadSalaryAnswerTurn) {
        // La ambigüedad identifica rutas posibles, pero no demuestra que alguno
        // de sus extractos sea aplicable al caso. No se muestran citas ni
        // fuentes hasta que la persona precise la condición que permite
        // responder.
        const contextualClarification =
          causalClarificationFor(effectiveQuestion, retrieval.sources) ??
          salaryClarificationFor(
            salaryQuestion,
            retrieval.sources,
            personalSalary,
          );
        const message =
          contextualClarification?.message ??
          ambiguityMessage(effectiveQuestion, retrieval.modules);
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
          sources: [],
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
    }

    // El turno tiene evidencia, pero puede depender de un dato que la persona no
    // dio y que la propia evidencia demuestra que cambia el resultado: la causal
    // de una reasignación o el factor que decide entre dos cifras vigentes. En
    // ese caso se pide una sola precisión (sin mostrar cifras ni fuentes) en vez
    // de responder con un subconjunto como si fuera la regla general.
    if (retrieval.kind === 'evidence' || retrieval.kind === 'topic_change') {
      const clarification =
        causalClarificationFor(effectiveQuestion, retrieval.sources) ??
        salaryClarificationFor(
          salaryQuestion,
          retrieval.sources,
          personalSalary,
        );
      if (clarification) {
        if (input.abortSignal?.aborted) return;
        const completed = await this.historyGateway.completeTurn({
          answer: clarification.message,
          conversationId: turn.conversationId,
          faqMemory,
          detectedModuleId: null,
          detectedSubmoduleId: null,
          qualitySignals: [],
          replyRole: 'clarification',
          retrievalScope,
          sources: [],
          topRelevanceScore: retrieval.topRelevanceScore,
          unansweredReason: 'ambiguous_request',
          userId: input.authorization.userId,
          userMessageId: turn.userMessageId,
        });
        yield {
          data: { message: clarification.message, modules: [] },
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
    }

    const useExtractiveSalary =
      broadSalaryAnswerTurn ||
      deterministicFirstScaleSalary ||
      deterministicRemunerationTopic;
    const extractiveSalary = useExtractiveSalary
      ? buildExtractiveSalaryAnswer(
          retrieval.sources,
          salaryQuestion,
          retrievalScope,
        )
      : null;
    const responseSources = useExtractiveSalary
      ? (extractiveSalary?.sources ?? [])
      : retrieval.sources;
    const citations = toCitationBundle(
      responseSources,
      selectedModuleId,
      relatedModule,
      relatedSubmodule,
    );

    // Las cifras, períodos y condiciones de un panorama general no se
    // reformulan con texto generado. Esta respuesta muestra la tabla o las
    // unidades verificadas que recuperó el RAG y la cita creada por el
    // servidor, para no convertir una remuneración mensual en anual ni
    // extenderla a otro cargo o sector. Cuando la evidencia no permite
    // siquiera atribuir un enunciado al cargo, se cierra sin evidencia: el
    // contrato de persistencia no admite una respuesta «assistant» sin fuente.
    if (useExtractiveSalary) {
      if (input.abortSignal?.aborted) return;
      if (!extractiveSalary) {
        yield* this.completeWithoutEvidence({
          conversationId: turn.conversationId,
          faqMemory,
          message:
            'No tengo un monto que pueda atribuir con seguridad a ese cargo o sector. Para no darte una cifra equivocada, prefiero no inventarla.',
          modules: broadSalaryModules,
          retrievalScope,
          topRelevanceScore: retrieval.topRelevanceScore,
          userId: input.authorization.userId,
          userMessageId: turn.userMessageId,
        });
        return;
      }
      const finalAnswer = extractiveSalary.answer;
      const completed = await this.historyGateway.completeTurn({
        answer: finalAnswer,
        conversationId: turn.conversationId,
        faqMemory,
        detectedModuleId: relatedModule?.id ?? null,
        detectedSubmoduleId: relatedSubmodule?.id ?? null,
        qualitySignals: [],
        replyRole: 'assistant',
        retrievalScope,
        sources: citations.inputs,
        topRelevanceScore: retrieval.topRelevanceScore,
        unansweredReason: null,
        userId: input.authorization.userId,
        userMessageId: turn.userMessageId,
      });
      yield { data: { sources: citations.sources }, type: 'sources' };
      yield { data: { text: finalAnswer }, type: 'token' };
      yield {
        data: {
          conversationId: turn.conversationId,
          inReplyToMessageId: turn.userMessageId,
          messageId: completed.answerMessageId,
          ...(broadSalaryModules.length ? { modules: broadSalaryModules } : {}),
          provider: 'rule',
        },
        type: 'done',
      };
      return;
    }

    // La ausencia de una modificación expresa no puede salir del modelo como
    // una «vigencia confirmada». Esta ruta conserva las fuentes revisadas,
    // pero entrega una conclusión limitada y reproducible antes de transmitir
    // cualquier token generado.
    const noChangesMessage = noIdentifiedChangesMessage(
      effectiveQuestion,
      retrieval.sources,
    );
    if (noChangesMessage) {
      if (input.abortSignal?.aborted) return;
      const completed = await this.historyGateway.completeTurn({
        answer: noChangesMessage,
        conversationId: turn.conversationId,
        faqMemory,
        detectedModuleId: relatedModule?.id ?? null,
        detectedSubmoduleId: relatedSubmodule?.id ?? null,
        qualitySignals: [],
        replyRole: 'assistant',
        retrievalScope,
        sources: citations.inputs,
        topRelevanceScore: retrieval.topRelevanceScore,
        unansweredReason: null,
        userId: input.authorization.userId,
        userMessageId: turn.userMessageId,
      });
      yield { data: { sources: citations.sources }, type: 'sources' };
      yield { data: { text: noChangesMessage }, type: 'token' };
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

    const preparedTopicContext = await selectedTopicContext;
    const topicContext =
      preparedTopicContext?.moduleId === selectedModuleId
        ? preparedTopicContext
        : null;

    // Las fuentes se emiten junto con el primer fragmento real de la respuesta:
    // si el modelo declara que ninguna fuente responde (marca de «sin
    // sustento»), el turno se cierra como «sin evidencia» y el usuario nunca ve
    // una tabla de «documentos que sustentan» que no sustentan nada.
    const marker = new NoSupportMarkerFilter();
    // Una cita agrupada («[1, 2]») se reescribe como citas individuales
    // («[1][2]») sin cortar una cita a medias: retiene el corchete abierto
    // hasta que cierra.
    const citator = new CitationGroupNormalizer(retrieval.sources.length);
    // Hasta ver una cita [n] válida no se muestra nada. Así ninguna respuesta
    // que termine en `no_evidence` filtra temporalmente hechos, fuentes o texto
    // sin sustento a la web ni a otros clientes SSE.
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

    // Una respuesta salarial sustentada en tablas se retiene hasta comprobar
    // que cada importe quedó asociado a su fila. Si el modelo mezcla una
    // jornada o un vínculo, se sustituye por una precisión en vez de mostrar
    // una cifra equivocada. El panorama sin monto también se retiene: es la
    // única forma de impedir que una cifra inventada llegue a la pantalla
    // cuando ninguna fuente trae un importe que la respalde.
    const salaryProfile = salaryQuestionProfile(salaryQuestion);
    const deferStreaming =
      salaryProfile.isSalaryQuestion ||
      needsAdministrativeAnswerSafety(effectiveQuestion);

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
      question: acceptedQuestion ?? input.question,
      sources: retrieval.sources,
      selectedModuleName,
      topicContext,
    })) {
      if (input.abortSignal?.aborted) return;

      const visible = citator.push(marker.push(token));
      if (!streaming) {
        leadIn += visible;
        if (marker.partialSupport && !cites(leadIn)) {
          declined = true;
          break;
        }
        if (!cites(leadIn)) {
          if (leadIn.length >= answerCap) {
            leadIn = leadIn.slice(0, answerCap);
            cutByLength = true;
            break;
          }
          continue;
        }
        streaming = true;
        if (!deferStreaming) {
          yield { data: { sources: citations.sources }, type: 'sources' };
        }
        const piece = takePiece(leadIn);
        leadIn = '';
        if (!deferStreaming && piece) {
          yield { data: { text: piece }, type: 'token' };
        }
        if (cutByLength) break;
        continue;
      }
      if (!visible) continue;
      const piece = takePiece(visible);
      if (!deferStreaming && piece) {
        yield { data: { text: piece }, type: 'token' };
      }
      if (cutByLength) break;
    }

    if (input.abortSignal?.aborted) return;

    const ending = marker.finish();
    const tail = `${citator.push(ending.tail)}${citator.flush()}`;
    const unstreamed = streaming ? '' : `${leadIn}${tail}`;
    // Fail-closed (punto 4): una respuesta que no cita ninguna fuente no puede
    // demostrar de dónde sale —suele ser una negativa («Lo siento, las fuentes
    // no mencionan…») o la marca mal escrita— y se cierra como «sin
    // evidencia». Si ya se mostró texto, el evento «no_evidence» lo reemplaza.
    const whole = `${answer}${streaming ? tail : unstreamed}`;
    if (
      ending.noSupport ||
      declined ||
      (whole.trim() !== '' && !cites(whole))
    ) {
      // Una negativa del modelo a dar una cifra no debe convertirse en «sin
      // evidencia» si las fuentes sí contienen remuneración general. Se pide
      // la condición decisiva en lugar de ocultar el panorama disponible.
      const salaryGeneralEvidence =
        salaryProfile.isSalaryQuestion &&
        hasGeneralSalaryEvidence(retrieval.sources, retrievalScope);
      const refusedSalary =
        salaryGeneralEvidence &&
        /\b(?:no ser[ií]a responsable|no puedo darte una cifra|no tengo acceso|no encontr[eé] (?:una cifra|informaci[oó]n))/iu.test(
          whole,
        );
      if (refusedSalary) {
        const message =
          salaryClarificationFor(effectiveQuestion, retrieval.sources, true)
            ?.message ?? salaryEvidenceClarificationMessage();
        const completed = await this.historyGateway.completeTurn({
          answer: message,
          conversationId: turn.conversationId,
          faqMemory,
          detectedModuleId: null,
          detectedSubmoduleId: null,
          qualitySignals: [],
          replyRole: 'clarification',
          retrievalScope,
          sources: [],
          topRelevanceScore: retrieval.topRelevanceScore,
          unansweredReason: 'ambiguous_request',
          userId: input.authorization.userId,
          userMessageId: turn.userMessageId,
        });
        yield { data: { message, modules: [] }, type: 'clarification' };
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
    const pending = streaming ? tail : unstreamed;
    if (deferStreaming) {
      // El texto retenido se valida completo antes de emitirlo.
      answer = whole;
    } else if (pending && !cutByLength) {
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
    // de mostrarse (y guardarse) como si estuviera completa. En un panorama
    // salarial, las filas «Campo: valor» se convierten en tabla aunque el
    // modelo haya ignorado la instrucción de formato.
    // La cita de cada lista se coloca en la frase que la introduce cuando el
    // modelo la dejó al final del mensaje o tras la última viñeta. Las
    // respuestas salariales conservan su formato validado.
    const withBlockCitations = salaryProfile.isSalaryQuestion
      ? normalizedAnswer
      : placeBlockCitations(normalizedAnswer, retrieval.sources);
    // Las citas añadidas no pueden empujar la respuesta guardada por encima del
    // tope que la base acepta (el espacio del aviso de corte ya está reservado).
    const placedAnswer =
      withBlockCitations.length + truncationNote.length <= MAX_RAG_ANSWER_CHARS
        ? withBlockCitations
        : normalizedAnswer;
    let finalAnswer = salaryProfile.isSalaryQuestion
      ? formatSalaryBulletsAsTable(normalizedAnswer)
      : placedAnswer;
    const truncated = cutByLength || finishReason === 'length';
    if (truncated) finalAnswer = `${finalAnswer}${truncationNote}`;

    if (hasUnsupportedAdministrativeInference(effectiveQuestion, finalAnswer)) {
      yield* this.completeWithoutEvidence({
        conversationId: turn.conversationId,
        faqMemory,
        message:
          'La fuente recuperada trata esta consulta, pero no permite confirmar ese detalle sin extender una regla más allá de lo que dice el documento. Para no darte una orientación incorrecta, necesito evidencia que lo establezca expresamente.',
        retrievalScope,
        topRelevanceScore: retrieval.topRelevanceScore,
        userId: input.authorization.userId,
        userMessageId: turn.userMessageId,
      });
      return;
    }

    // La validación salarial de una tabla se hace antes de emitir el texto
    // retenido. Si el importe no coincide con su fila, se pide la condición
    // decisiva en vez de mostrar una cifra que podría ser de otra jornada.
    const salaryFinding = assessSalaryAnswerCoverage(
      finalAnswer,
      retrieval.sources,
      salaryQuestion,
    );
    const salaryRowFinding = salaryRowMismatch(
      finalAnswer,
      retrieval.sources,
      salaryQuestion,
    );
    const specialAllocationExempt =
      salaryProfile.isSalaryQuestion && salaryProfile.asksSpecialAllocation;
    if (
      deferStreaming &&
      !specialAllocationExempt &&
      (salaryRowFinding || salaryFinding)
    ) {
      // Si el panorama se habilitó sin ningún importe en las fuentes y el modelo
      // aun así escribió una cifra, no se pide un factor que no puede resolverlo:
      // se declara que los documentos tratan el tema pero no traen el monto.
      const noSalaryAmountEvidence = !retrieval.sources.some((source) =>
        hasAmount(source.chunkContent),
      );
      const message =
        broadSalaryAnswerTurn && noSalaryAmountEvidence
          ? 'Los documentos disponibles tratan la remuneración del cargo consultado, pero no incluyen el monto. Para no darte una cifra equivocada, prefiero no inventarla. ¿Quieres que te explique qué regla sí consta?'
          : (salaryClarificationFor(effectiveQuestion, retrieval.sources, true)
              ?.message ?? salaryEvidenceClarificationMessage());
      const completed = await this.historyGateway.completeTurn({
        answer: message,
        conversationId: turn.conversationId,
        faqMemory,
        detectedModuleId: null,
        detectedSubmoduleId: null,
        qualitySignals: [],
        replyRole: 'clarification',
        retrievalScope,
        sources: [],
        topRelevanceScore: retrieval.topRelevanceScore,
        unansweredReason: 'ambiguous_request',
        userId: input.authorization.userId,
        userMessageId: turn.userMessageId,
      });
      yield {
        data: { message, modules: [] },
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
    if (deferStreaming) {
      yield { data: { sources: citations.sources }, type: 'sources' };
      yield { data: { text: finalAnswer }, type: 'token' };
    } else {
      // El texto ya se transmitió tal como lo escribió el modelo: si las citas
      // cambiaron de lugar, la interfaz sustituye el mensaje por el definitivo.
      if (placedAnswer !== normalizedAnswer) {
        yield { data: { text: placedAnswer }, type: 'answer' };
      }
      if (truncated) yield { data: { text: truncationNote }, type: 'token' };
    }

    // La calidad se evalúa sobre la respuesta, sin el aviso de corte (que no
    // lleva citas y marcaría toda respuesta cortada para revisión).
    const lastCompleteSentence = Math.max(
      placedAnswer.lastIndexOf('.'),
      placedAnswer.lastIndexOf('!'),
      placedAnswer.lastIndexOf('?'),
      placedAnswer.lastIndexOf(']'),
    );
    const citationQuality = evaluateAnswerCitationQualityDetails(
      truncated && lastCompleteSentence > 0
        ? placedAnswer.slice(0, lastCompleteSentence + 1)
        : placedAnswer,
      retrieval.sources,
    );
    const qualityExcerpts: Partial<Record<CitationQualitySignal, string>> = {
      ...citationQuality.excerpts,
    };
    const qualitySignals = new Set<string>(citationQuality.signals);
    if (marker.partialSupport) qualitySignals.add('support_partial');
    // Una respuesta salarial que presente un importe como sueldo o remuneración
    // citando solo un concepto adicional (asignación, bono, gratificación) se
    // marca para revisión humana: pudo tomar una cifra que no es la general.
    // Se revisa el contenido generado también si se preguntó por la finalidad
    // de una norma: el modelo puede introducir un importe que no se le pidió.
    if (
      salaryFinding &&
      !(salaryProfile.isSalaryQuestion && salaryProfile.asksSpecialAllocation)
    ) {
      qualitySignals.add('support_partial');
      qualityExcerpts.support_partial ??= salaryFinding.excerpt;
    }
    // CR-07 (punto 4): una tabla solo se sostiene con una cita válida por fila.
    // Si alguna fila no cita ninguna fuente entregada —o si la tabla excede el
    // tope de filas y no se pintará entera—, la interfaz la mostrará como texto
    // y el caso queda señalado para revisión humana.
    const unsupportedRows = unsupportedTableRows(
      finalAnswer,
      retrieval.sources.length,
    );
    if (unsupportedRows.length) {
      qualitySignals.add('support_partial');
      qualityExcerpts.support_partial ??= unsupportedRows[0];
    }
    if (retrieval.topRelevanceScore < this.matchThreshold() + 0.05) {
      qualitySignals.add('low_confidence');
    }

    const completed = await this.historyGateway.completeTurn({
      answer: finalAnswer,
      conversationId: turn.conversationId,
      faqMemory,
      detectedModuleId: relatedModule?.id ?? null,
      detectedSubmoduleId: relatedSubmodule?.id ?? null,
      qualityExcerpts,
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
        ...(broadSalaryModules.length ? { modules: broadSalaryModules } : {}),
        provider: 'openai',
      },
      type: 'done',
    };
  }

  /**
   * Genera la respuesta del modo asesor. `orientation` es una consulta del
   * ámbito; `out_of_scope`, un pedido ajeno o de información interna (el
   * modelo la abre con la marca). `null` si el proveedor falla o la respuesta
   * no respeta las reglas (citas, marca de sin sustento o cifras inventadas).
   */
  private async generateAdvisoryBody(input: {
    abortSignal?: AbortSignal;
    conversationContext: ChatContextMessage[];
    question: string;
  }): Promise<{ kind: 'orientation' | 'out_of_scope'; text: string } | null> {
    try {
      let body = '';
      for await (const token of this.answerGateway.generate({
        abortSignal: input.abortSignal,
        conversationContext: input.conversationContext,
        mode: 'advisory',
        question: input.question,
        sources: [],
      })) {
        if (input.abortSignal?.aborted) return null;
        if (body.length < MAX_RAG_ADVISORY_CHARS) body += token;
      }
      const trimmed = body
        .trim()
        // Por si el modelo repite la etiqueta que ya no se usa.
        .replace(/^orientaci[oó]n general[^:\n]*:\s*/iu, '');
      if (
        !trimmed ||
        /\[\d+\]/u.test(trimmed) ||
        /\[{1,2}\s*sin[\s_-]*sustento\s*\]{1,2}/iu.test(trimmed)
      ) {
        return null;
      }
      // Sin cifras, plazos ni números de norma inventados. La numeración de
      // una lista («1. Reúne tus documentos») no cuenta como cifra.
      const inventsFigures = (text: string) =>
        /\b\d+(?:[.,-]\d+)*\b/u.test(text.replace(/^\s*\d+[.)]\s+/gmu, ''));
      // Solo una respuesta que ABRE con la marca es una respuesta amable a un
      // pedido ajeno; pasa por los mismos filtros y con un tope breve, para que
      // nadie pueda pedir «empieza con la marca y luego escribe…» y obtener
      // cualquier texto. Una marca en otro lugar se descarta y el resto se
      // trata como orientación.
      const marker = ADVISORY_OUT_OF_SCOPE_MARKER_PATTERN;
      if (trimmed.search(marker) === 0) {
        const text = trimmed.replace(marker, '').trim();
        if (
          !text ||
          text.length > MAX_ADVISORY_OUT_OF_SCOPE_CHARS ||
          inventsFigures(text) ||
          new RegExp(marker.source, 'iu').test(text)
        ) {
          return {
            kind: 'out_of_scope',
            text: buildConversationalReply('out_of_domain'),
          };
        }
        return { kind: 'out_of_scope', text };
      }
      const orientation = trimmed
        .replace(new RegExp(marker.source, 'giu'), '')
        .trim();
      if (!orientation || inventsFigures(orientation)) return null;
      return { kind: 'orientation', text: orientation };
    } catch (error) {
      this.logger.warn(
        `Orientación general no disponible: ${error instanceof Error ? error.message : 'error desconocido'}`,
      );
      return null;
    }
  }

  /**
   * «Resume lo que hablamos»: se responde con la memoria completa de la
   * conversación (hasta el tope de `get_chat_conversation`), sin recuperar
   * corpus. Es una respuesta efímera como el catálogo: no crea un turno nuevo
   * ni una consulta sin sustento. Si el proveedor falla, el resumen
   * determinista repite solo lo ya guardado.
   */
  private async *conversationSummary(input: {
    abortSignal?: AbortSignal;
    conversationId: string | null;
    messages?: ChatContextMessage[];
    question: string;
    userId: string;
  }): AsyncIterable<ChatStreamEvent> {
    if (!input.conversationId) {
      yield {
        data: {
          message:
            'Todavía no tenemos una conversación que resumir. Hazme una consulta y, cuando quieras, te resumo lo que hemos hablado.',
        },
        type: 'conversational',
      };
      return;
    }

    let messages: ChatContextMessage[] = input.messages ?? [];
    if (!input.messages) {
      try {
        messages = await this.loadConversationMessages(
          input.conversationId,
          input.userId,
        );
      } catch (error) {
        this.logger.warn(
          `No se pudo leer la conversación para resumirla: ${
            error instanceof Error ? error.message : 'error desconocido'
          }`,
        );
        yield {
          data: {
            message:
              'No pude recuperar el historial de esta conversación en este momento. Inténtalo de nuevo en unos segundos.',
          },
          type: 'conversational',
        };
        return;
      }
    }

    const hasUserMessage = messages.some((message) => message.role === 'user');
    const summary = hasUserMessage
      ? await this.generateConversationSummary(
          input.question,
          messages,
          input.abortSignal,
        )
      : null;
    const fallback = buildDeterministicConversationSummary(messages);
    yield {
      data: {
        message: summary ?? fallback,
      },
      type: 'conversational',
    };
  }

  /**
   * Historial completo para el resumen. `getConversationMessages` es opcional
   * para adaptadores antiguos; en ese caso se usa el contexto acotado.
   */
  private async loadConversationMessages(
    conversationId: string,
    userId: string,
  ): Promise<ChatContextMessage[]> {
    if (this.historyGateway.getConversationMessages) {
      return this.historyGateway.getConversationMessages({
        conversationId,
        limit: CHAT_CONVERSATION_MESSAGE_LIMIT,
        userId,
      });
    }
    const context = await this.historyGateway.getConversationContext({
      characterLimit: MAX_CHAT_CONTEXT_CHARS,
      conversationId,
      messageLimit: MAX_CHAT_CONTEXT_MESSAGES,
      userId,
    });
    return context.messages;
  }

  /** Resumen generado y comprobado; `null` activa el respaldo determinista. */
  private async generateConversationSummary(
    question: string,
    messages: ChatContextMessage[],
    abortSignal?: AbortSignal,
  ): Promise<string | null> {
    try {
      let summary = '';
      let finishReason: string | null = null;
      for await (const token of this.answerGateway.generate({
        abortSignal,
        conversationContext: messages,
        mode: 'summary',
        onFinish: (reason) => {
          finishReason = reason;
        },
        question,
        sources: [],
      })) {
        if (abortSignal?.aborted) return null;
        if (summary.length < MAX_RAG_SUMMARY_CHARS + 500) summary += token;
      }
      // Un resumen cortado por tokens no se presenta como completo.
      if (finishReason === 'length') return null;
      return groundedConversationSummary(summary, messages);
    } catch (error) {
      this.logger.warn(
        `Resumen de la conversación no disponible: ${
          error instanceof Error ? error.message : 'error desconocido'
        }`,
      );
      return null;
    }
  }

  /** Cierra el turno como «sin evidencia»: mensaje claro, sin fuentes. */
  private async *completeWithoutEvidence(input: {
    conversationId: string;
    faqMemory: ReturnType<FaqMemoryService['prepare']>;
    message?: string;
    modules?: ResolvedModule[];
    retrievalScope: RetrievalScope;
    topRelevanceScore: number | null;
    userId: string;
    userMessageId: string;
  }): AsyncIterable<ChatStreamEvent> {
    const base = input.message ?? noEvidenceMessage(input.retrievalScope);
    const message = base;
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
        ...(input.modules?.length ? { modules: input.modules } : {}),
        provider: 'rule',
      },
      type: 'done',
    };
  }

  /** Respuesta amable efímera; la capacidad y el anuncio listan los temas reales. */
  private async conversationalReply(
    kind: ConversationalReplyKind,
    role: AuthorizationContext['role'],
    abortSignal?: AbortSignal,
    question?: string,
    selectedModuleId?: string | null,
  ): Promise<ChatStreamEvent> {
    // Pedido ajeno («¿cómo preparo un arroz chaufa?»): respuesta amable que
    // menciona lo que pidió y reorienta. Sigue siendo efímera (sin turno ni
    // RAG). Si el proveedor falla o no lo trata como ajeno, plantilla fija.
    if (kind === 'out_of_domain' && question) {
      const friendly = await this.generateAdvisoryBody({
        abortSignal,
        conversationContext: [],
        question,
      });
      if (friendly?.kind === 'out_of_scope') {
        return { data: { message: friendly.text }, type: 'conversational' };
      }
    }
    // «¿De qué tienes información?»: documentos reales y preguntas sugeridas.
    // Si el catálogo falla, se responde sin lista de temas (texto determinista):
    // los temas se comprueban contra ese mismo catálogo, que acaba de fallar.
    let catalogFailed = false;
    if (
      (kind === 'catalog' || kind === 'document_catalog') &&
      this.catalogService
    ) {
      try {
        const catalog = await this.catalogService.reply(abortSignal, {
          question,
          selectedModuleId,
        });
        return {
          data: {
            message: catalog.message,
            documents: catalog.documents.map(toChatCatalogDocument),
            ...(catalog.suggestions.length
              ? { suggestions: catalog.suggestions }
              : {}),
          },
          type: 'conversational',
        };
      } catch (error) {
        catalogFailed = true;
        this.logger.warn(
          `Catálogo no disponible; se responde sin la lista de temas: ${error instanceof Error ? error.message : 'error desconocido'}`,
        );
      }
    }
    // «¿Puedo saber la página del MINEDU?»: enlaces verificados, sin RAG.
    if (kind === 'official_sites') {
      return {
        data: {
          message: buildConversationalReply(kind, {
            officialSites: officialSitesIn(
              normalizeSpanishText(question ?? ''),
            ),
          }),
        },
        type: 'conversational',
      };
    }
    const topics =
      !catalogFailed &&
      (kind === 'capabilities' ||
        kind === 'ask_announcement' ||
        kind === 'catalog' ||
        kind === 'document_catalog')
        ? (await this.activeTopics())?.map((topic) => topic.name)
        : undefined;
    return {
      data: { message: buildConversationalReply(kind, { role, topics }) },
      type: 'conversational',
    };
  }

  /**
   * Primera consulta sin tema ("¿Cuáles son los requisitos?"): se pide precisar
   * el trámite con los temas reales como opciones. Se guarda como aclaración
   * para que la respuesta del usuario ("de reasignación") conserve la pregunta.
   */
  private async *askForTopic(input: {
    conversationId?: string | null;
    faqMemory: ReturnType<FaqMemoryService['prepare']>;
    question: string;
    userId: string;
  }): AsyncIterable<ChatStreamEvent> {
    const modules = ((await this.activeTopics()) ?? []).slice(0, 8);
    const turn = await this.historyGateway.beginTurn({
      conversationId: input.conversationId ?? null,
      question: input.question,
      selectedModuleId: null,
      userId: input.userId,
    });
    yield {
      data: {
        conversationId: turn.conversationId,
        moduleId: null,
        startedNewConversation: !input.conversationId,
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
  /** Módulos activos con caché corta: se consultan en cada turno. */
  private cachedModules(): Promise<ActiveChatModule[]> {
    if (this.modulesCache && this.modulesCache.expiresAt > Date.now()) {
      return this.modulesCache.promise;
    }
    const promise = this.historyGateway.listActiveModules();
    const entry = { expiresAt: Date.now() + MODULES_CACHE_MS, promise };
    this.modulesCache = entry;
    promise.catch(() => {
      if (this.modulesCache === entry) this.modulesCache = null;
    });
    return promise;
  }

  /**
   * Detiene una corrección ortográfica de baja certeza antes del RAG. El texto
   * literal sigue siendo el turno del docente; la propuesta solo se convierte
   * en consulta si la acepta con «sí».
   */
  private async *askForOrthographicClarification(input: {
    clarification: {
      originalWord: string;
      suggestions: readonly string[];
      suggestedQuestion: string | null;
    };
    conversationId: string | null;
    question: string;
    userId: string;
  }): AsyncIterable<ChatStreamEvent> {
    const turn = await this.historyGateway.beginTurn({
      conversationId: input.conversationId,
      question: input.question,
      selectedModuleId: null,
      userId: input.userId,
    });
    yield {
      data: {
        conversationId: turn.conversationId,
        moduleId: null,
        startedNewConversation: !input.conversationId,
        userMessageId: turn.userMessageId,
      },
      type: 'conversation',
    };

    const suggestions = input.clarification.suggestions.map(
      (suggestion) => `«${suggestion}»`,
    );
    const proposal = suggestions.join(' o ');
    const message = input.clarification.suggestedQuestion
      ? [
          'Quiero asegurarme de entender tu consulta antes de buscar la información.',
          `La palabra «${input.clarification.originalWord}» podría referirse a ${proposal}.`,
          '',
          'Sugerencia:',
          `¿Te explico esta consulta: «${input.clarification.suggestedQuestion
            .trim()
            .replace(/^¿\s*/u, '')
            .replace(/[?!.]+\s*$/u, '')}»?`,
          'Si no es eso, escribe la palabra como prefieras y la revisamos juntos.',
        ].join('\n')
      : [
          'Quiero asegurarme de entender tu consulta antes de buscar la información.',
          `La palabra «${input.clarification.originalWord}» puede referirse a ${proposal}.`,
          'Para no adivinar entre esas opciones, ¿podrías escribir esa palabra de otra forma?',
        ].join('\n');
    const completed = await this.historyGateway.completeTurn({
      answer: message,
      conversationId: turn.conversationId,
      faqMemory: this.faqMemoryService.prepare(input.question),
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
    yield { data: { message, modules: [] }, type: 'clarification' };
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

  /**
   * Panorama del tema si la pregunta lo pide («¿de qué trata…?», «¿qué
   * información tienes sobre…?»). Devuelve null para seguir con el RAG: sin
   * tema reconocible o sin documentos, la búsqueda normal decide.
   */
  private async overviewReply(
    question: string,
    context: {
      forceSelected?: boolean;
      inConversation: boolean;
      selectedModuleId: string | null;
    },
  ): Promise<ChatStreamEvent | null> {
    if (!this.catalogService) return null;
    const request = context.forceSelected
      ? { topic: null }
      : detectOverviewRequest(question);
    if (!request) return null;
    // «¿De qué trata?» a secas dentro de una conversación se refiere a lo
    // que se está hablando: lo resuelve el RAG con el contexto.
    if (!request.topic && context.inConversation) return null;
    try {
      const modules = await this.cachedModules();
      const module = request.topic
        ? matchTopicModule(request.topic, modules)
        : (modules.find((item) => item.id === context.selectedModuleId) ??
          null);
      if (!module) return null;
      const overview = await this.catalogService.moduleOverview({
        module,
        parent:
          modules.find((item) => item.id === module.parentModuleId) ?? null,
      });
      if (overview.scope === 'empty') return null;
      const suggestions = fallbackSuggestions(overview.documents);
      return {
        data: {
          message: overviewMessage(overview),
          ...(suggestions.length ? { suggestions } : {}),
        },
        type: 'conversational',
      };
    } catch (error) {
      this.logger.warn(
        `Panorama del tema no disponible: ${error instanceof Error ? error.message : 'error desconocido'}`,
      );
      return null;
    }
  }

  /** Prepara el contexto interno del tema sin devolver resúmenes al cliente. */
  async prepareModuleContext(moduleId: string): Promise<void> {
    if (!this.catalogService) {
      throw new ServiceUnavailableException({
        code: 'CHAT_CATALOG_UNAVAILABLE',
        message: 'El catálogo no está disponible.',
      });
    }
    const modules = await this.cachedModules();
    const module = modules.find((item) => item.id === moduleId);
    if (!module) {
      throw new NotFoundException({
        code: 'CHAT_MODULE_NOT_FOUND',
        message: 'El tema no existe o no está activo.',
      });
    }
    await this.catalogService.prepareModuleContext({
      module,
      parent: modules.find((item) => item.id === module.parentModuleId) ?? null,
      submodules: modules.filter((item) => item.parentModuleId === module.id),
    });
  }

  private async internalTopicContext(
    moduleId: string | null,
  ): Promise<InternalTopicContext | null> {
    if (!moduleId || !this.catalogService) return null;
    // La preparación es complementaria: una implementación antigua del
    // catálogo no debe impedir que el RAG responda con sus fuentes reales.
    if (typeof this.catalogService.internalTopicContext !== 'function') {
      return null;
    }
    try {
      const modules = await this.cachedModules();
      const module = modules.find((item) => item.id === moduleId);
      if (!module) return null;
      return await this.catalogService.internalTopicContext({
        module,
        parent:
          modules.find((item) => item.id === module.parentModuleId) ?? null,
        submodules: modules.filter((item) => item.parentModuleId === module.id),
      });
    } catch (error) {
      this.logger.warn(
        `No se pudo preparar el contexto interno del tema: ${
          error instanceof Error ? error.message : 'error desconocido'
        }`,
      );
      return null;
    }
  }

  /**
   * Temas raíz que se pueden consultar hoy: activos y con al menos un
   * documento aprobado e indexado (el catálogo ya exige vigencia, módulo activo
   * y versión indexada, igual que la búsqueda del RAG). Un módulo activo sin
   * corpus existe, pero no se anuncia: ofrecerlo promete una respuesta que
   * luego no tiene sustento. Si no se puede comprobar (sin catálogo o con la
   * base caída) no se anuncia ninguno: es mejor omitir la lista que prometer.
   */
  private async activeTopics(): Promise<ResolvedModule[] | undefined> {
    if (!this.catalogService) return undefined;
    try {
      const [modules, documents] = await Promise.all([
        this.cachedModules(),
        this.catalogService.availableDocuments(),
      ]);
      // `moduleIds` incluye el módulo enlazado y su padre: un documento de un
      // subtema da corpus al tema raíz.
      const withCorpus = new Set(
        documents.flatMap((document) => document.moduleIds),
      );
      return modules
        .filter(
          (module) =>
            module.parentModuleId === null && withCorpus.has(module.id),
        )
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
