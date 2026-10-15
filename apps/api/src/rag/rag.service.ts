import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { INTERACTIVE_AI_LIMITS } from '../config/ai-gateway';
import type { EmbeddingsGateway } from '../ingestion/embeddings.gateway';
import { EMBEDDINGS_GATEWAY } from '../ingestion/ingestion.tokens';
import { SUPABASE_RETRIEVAL_GATEWAY } from '../supabase/supabase.constants';
import { refersBack } from './anaphora';
import { hasTopicTerm } from './domain-lexicon';
import { consolidateDocumentEvidence } from './evidence-consolidation';
import { sanitizeRetrievedEvidence } from './evidence-sanitizer';
import {
  isSalarySourceCompatible,
  salaryApplicabilityTier,
} from './salary-applicability';
import { orderSourcesForDelivery } from './temporal-precedence';
import {
  exactDocumentReferencesIn,
  type ExactDocumentReference,
  sourceMatchesExactDocumentReference,
} from './legal-reference';
import {
  RAG_DEFAULT_MATCH_THRESHOLD,
  RAG_QUERY_TEXT_MAX_CHARS,
  RAG_ROUTING_SCORE_MARGIN,
  RAG_SOURCE_SCORE_MARGIN,
  RAG_TOPIC_SWITCH_SCORE_MARGIN,
} from './rag.constants';
import type {
  RetrievalGateway,
  RetrievedChunk,
  RetrievedModuleAssociation,
  RetrievalScope,
} from './retrieval.gateway';
import { normalizeSpanishText } from './text-normalization';

export interface ResolvedModule {
  id: string;
  name: string;
}

export type RetrievalResult =
  | {
      kind: 'no_evidence';
      /** Referencias nombradas que aún no identifican una norma de forma unívoca. */
      incompleteExactReferences?: ExactDocumentReference[];
      /** Normas nombradas que no tienen evidencia aprobada utilizable. */
      missingExactReferences?: ExactDocumentReference[];
      topRelevanceScore: null;
    }
  | {
      kind: 'ambiguous';
      modules: ResolvedModule[];
      sources: RetrievedChunk[];
      topRelevanceScore: number;
    }
  | {
      kind: 'evidence';
      resolvedModule: ResolvedModule | null;
      sources: RetrievedChunk[];
      topRelevanceScore: number;
    }
  | {
      kind: 'topic_change';
      resolvedModule: ResolvedModule;
      sources: RetrievedChunk[];
      topRelevanceScore: number;
    };

interface SourceRoute {
  kind: 'ambiguous' | 'resolved';
  modules: ResolvedModule[];
  resolvedModule: ResolvedModule | null;
}

function sourceAssociations(
  source: RetrievedChunk,
): RetrievedModuleAssociation[] {
  if (source.moduleAssociations?.length) return source.moduleAssociations;

  return source.moduleIds.map((rootModuleId, index) => ({
    rootModuleId,
    rootModuleName: source.moduleNames[index] ?? 'Módulo sin nombre',
    submoduleId: null,
    submoduleName: null,
  }));
}

/** True when a root or a submodule is genuinely associated with the source. */
function sourceIncludesContext(
  source: RetrievedChunk,
  moduleOrSubmoduleId: string,
): boolean {
  return sourceAssociations(source).some(
    (association) =>
      association.rootModuleId === moduleOrSubmoduleId ||
      association.submoduleId === moduleOrSubmoduleId,
  );
}

/**
 * Evidencia entregable de un proceso resuelto: se conserva lo atribuible al
 * módulo (o sin asociaciones, que no contradice la ruta) y se descarta la cola
 * de otros procesos, para que la lista de referencias de una respuesta no
 * mezcle documentación de procesos no relacionados.
 */
function attributableToModule(
  sources: RetrievedChunk[],
  moduleId: string,
): RetrievedChunk[] {
  return sources.filter((source) => {
    const associations = sourceAssociations(source);
    return associations.length === 0 || sourceIncludesContext(source, moduleId);
  });
}

/**
 * A submodule is disclosed only when every recovered source has one identical
 * submodule association below the detected root. This avoids inventing a
 * narrow route for documents that were associated directly with the root.
 */
export function resolveDetectedSubmodule(
  sources: RetrievedChunk[],
  rootModuleId: string,
): ResolvedModule | null {
  if (!sources.length) return null;

  let common: Map<string, string> | null = null;
  for (const source of sources) {
    const candidates = new Map<string, string>();
    for (const association of sourceAssociations(source)) {
      if (
        association.rootModuleId === rootModuleId &&
        association.submoduleId !== null &&
        association.submoduleName !== null
      ) {
        candidates.set(association.submoduleId, association.submoduleName);
      }
    }
    if (!candidates.size) return null;
    if (common === null) {
      common = candidates;
    } else {
      const intersection = new Map<string, string>();
      common.forEach((name, id) => {
        if (candidates.has(id)) intersection.set(id, name);
      });
      common = intersection;
    }
    if (!common.size) return null;
  }

  if (common?.size !== 1) return null;
  const entry = common ? Array.from(common.entries())[0] : undefined;
  if (!entry) return null;
  const [id, name] = entry;
  return { id, name };
}

function resolveSelectedRootModule(
  sources: RetrievedChunk[],
  selectedModuleId: string,
): ResolvedModule | null {
  const roots = new Map<string, string>();
  for (const source of sources) {
    for (const association of sourceAssociations(source)) {
      if (
        association.rootModuleId === selectedModuleId ||
        association.submoduleId === selectedModuleId
      ) {
        roots.set(association.rootModuleId, association.rootModuleName);
      }
    }
  }
  if (roots.size !== 1) return null;
  const [id, name] = roots.entries().next().value as [string, string];
  return { id, name };
}

function clampScore(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function topScore(sources: RetrievedChunk[]): number {
  return clampScore(Math.max(...sources.map((source) => source.semanticScore)));
}

function evidenceTokens(content: string): string[] {
  return normalizeSpanishText(content)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
}

/**
 * Quita fragmentos vecinos repetidos de una misma versión. Esta colección se
 * usa para decidir la ruta: no se puede colapsar aún evidencia de documentos
 * distintos porque podría ocultar un segundo módulo aplicable.
 */
function sourcesWithoutVersionDuplicates(
  sources: RetrievedChunk[],
): RetrievedChunk[] {
  const kept: Array<{
    source: RetrievedChunk;
    text: string;
  }> = [];
  for (const source of sources) {
    const text = evidenceTokens(source.chunkContent).join(' ');
    const repeated = kept.some((item) => {
      return (
        item.source.documentVersionId === source.documentVersionId &&
        (item.text === text || item.text.includes(text))
      );
    });
    if (!repeated) kept.push({ source, text });
  }
  return kept.map((item) => item.source);
}

/**
 * Quita evidencia idéntica para una respuesta visible. Entre documentos solo
 * colapsa texto normalizado idéntico: una diferencia breve puede contener una
 * excepción, negación, importe o condición jurídica material y por eso se
 * conserva. La decisión de módulo siempre se toma antes, con
 * `sourcesWithoutVersionDuplicates`.
 */
function uniqueSources(sources: RetrievedChunk[]): RetrievedChunk[] {
  const kept: Array<{
    source: RetrievedChunk;
    text: string;
  }> = [];
  for (const source of sourcesWithoutVersionDuplicates(sources)) {
    const text = evidenceTokens(source.chunkContent).join(' ');
    const repeated = kept.some((item) => item.text === text);
    if (!repeated) kept.push({ source, text });
  }
  return kept.map((item) => item.source);
}

/**
 * La situación documental y los factores explícitos de una consulta salarial
 * se aplican antes de comparar puntajes. Una similitud alta no vuelve vigente a
 * una fuente reemplazada ni hace aplicable una cifra de otra jornada, cargo,
 * condición, escala o período.
 */
function sourcesEligibleForQuestion(
  sources: RetrievedChunk[],
  question: string,
  retrievalScope: RetrievalScope,
): RetrievedChunk[] {
  return sources.filter((source) => {
    if (
      retrievalScope === 'current' &&
      source.documentSituation !== 'current'
    ) {
      return false;
    }
    return isSalarySourceCompatible(question, source);
  });
}

/** Fuentes a no más de `margin` del mejor puntaje, en su orden original. */
function withinScoreMargin(
  sources: RetrievedChunk[],
  margin: number,
): RetrievedChunk[] {
  if (!sources.length) return sources;
  const best = Math.max(...sources.map((source) => source.semanticScore));
  return sources.filter((source) => source.semanticScore >= best - margin);
}

/**
 * Consolida la evidencia por documento y la ordena con precedencia temporal
 * determinista. Un documento no debe ocupar varias referencias por fragmentos
 * contiguos y la situación documental pesa más que el año.
 */
function prepareDelivery(
  sources: RetrievedChunk[],
  question?: string,
): RetrievedChunk[] {
  return orderSourcesForDelivery(
    consolidateDocumentEvidence(sources),
    question
      ? {
          applicability: (source: RetrievedChunk) =>
            salaryApplicabilityTier(question, source),
        }
      : {},
  );
}

/**
 * Evidencia que se entrega al modelo y al usuario: dentro de la banda de
 * relevancia, consolidada por documento (una referencia visible por versión,
 * salvo que otra ubicación aporte algo materialmente distinto) y en orden
 * determinista con precedencia temporal. `question` aporta la aplicabilidad al
 * concepto consultado: en una consulta salarial, la remuneración general
 * vigente precede a una asignación especial.
 */
function relevantSources(
  sources: RetrievedChunk[],
  limit: number,
  question?: string,
): RetrievedChunk[] {
  const eligible = prepareDelivery(
    withinScoreMargin(
      uniqueSources(byScoreDescending(sources)),
      RAG_SOURCE_SCORE_MARGIN,
    ),
    question,
  );
  const distinctDocuments = new Set(
    eligible.map((source) => source.documentVersionId),
  ).size;
  // Reserva la mayoría de plazas iniciales para versiones distintas. Después
  // vuelve al orden por relevancia y completa con chunks vecinos del mismo
  // documento, necesarios para condiciones y excepciones.
  const diversityTarget = Math.min(
    distinctDocuments,
    Math.max(1, Math.ceil(limit * 0.6)),
  );
  const selected: RetrievedChunk[] = [];
  const selectedChunks = new Set<string>();
  const selectedDocuments = new Set<string>();

  for (const source of eligible) {
    if (selectedDocuments.has(source.documentVersionId)) continue;
    selected.push(source);
    selectedChunks.add(source.chunkId);
    selectedDocuments.add(source.documentVersionId);
    if (selectedDocuments.size === diversityTarget) break;
  }
  for (const source of eligible) {
    if (selected.length === limit) break;
    if (selectedChunks.has(source.chunkId)) continue;
    selected.push(source);
  }
  return selected;
}

function byScoreDescending(sources: RetrievedChunk[]): RetrievedChunk[] {
  return [...sources].sort(
    (left, right) =>
      right.semanticScore - left.semanticScore ||
      right.lexicalScore - left.lexicalScore,
  );
}

function balancedUniqueSources(
  limit: number,
  ...groups: RetrievedChunk[][]
): RetrievedChunk[] {
  const result: RetrievedChunk[] = [];
  const seen = new Set<string>();
  const longestGroup = Math.max(0, ...groups.map((group) => group.length));

  for (
    let index = 0;
    index < longestGroup && result.length < limit;
    index += 1
  ) {
    for (const group of groups) {
      const source = group[index];
      if (!source || seen.has(source.chunkId)) continue;
      seen.add(source.chunkId);
      result.push(source);
      if (result.length === limit) break;
    }
  }

  return result;
}

/**
 * Palabras de los nombres de módulo que no discriminan entre procesos: son
 * genéricas del dominio (docente, educación), funcionales (para, como) o
 * describen un aspecto administrativo común (situaciones). Su presencia en la
 * consulta no debe desempatar un conflicto entre módulos.
 */
const MODULE_NAME_STOPWORDS = new Set([
  'como',
  'desde',
  'docencia',
  'docente',
  'docentes',
  'educacion',
  'entre',
  'general',
  'hacia',
  'magisterial',
  'otros',
  'para',
  'situaciones',
  'sobre',
]);

function significantModuleTokens(name: string): string[] {
  return normalizeSpanishText(name)
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length >= 4 && !MODULE_NAME_STOPWORDS.has(token));
}

/**
 * Variantes coloquiales verificadas contra consultas reales: la gente escribe
 * «contrato docente» donde el módulo dice «contratación». Solo se registran
 * pares probados; no se inventan sinónimos.
 */
const QUESTION_WORD_ALIASES: Record<string, string> = {
  contrato: 'contratacion',
  contratos: 'contratacion',
};

/** Coincidencia por palabra completa o flexión (plural/sufijo cercano). */
function questionWordMatchesToken(word: string, token: string): boolean {
  const candidate = QUESTION_WORD_ALIASES[word] ?? word;
  if (candidate.length < 4) return false;
  if (candidate.startsWith(token)) return true;
  // «remuneracion» → «remuneraciones» sí; «administra» → «administrativas»
  // no (proporción demasiado corta, sería un falso positivo genérico).
  return token.startsWith(candidate) && candidate.length / token.length >= 0.8;
}

function questionMentionsModuleToken(
  normalizedQuestion: string,
  token: string,
): boolean {
  return normalizedQuestion
    .split(/[^a-z0-9]+/u)
    .some((word) => questionWordMatchesToken(word, token));
}

/**
 * Cuando dos módulos compiten por puntajes casi idénticos, el nombre del
 * módulo mencionado en la propia consulta («contratación docente» frente a
 * «auxiliares») desempata: pedir precisión a quien ya nombró su tema es un
 * falso positivo. Solo resuelve con una ventaja estricta sobre el segundo
 * candidato; un empate mantiene la aclaración.
 */
export function disambiguateRouteByQuestion(
  question: string,
  modules: ResolvedModule[],
): ResolvedModule | null {
  if (modules.length < 2) return null;
  const normalizedQuestion = normalizeSpanishText(question);
  const scored = modules
    .map((module) => ({
      module,
      hits: significantModuleTokens(module.name).filter((token) =>
        questionMentionsModuleToken(normalizedQuestion, token),
      ).length,
    }))
    .filter((entry) => entry.hits > 0)
    .sort((left, right) => right.hits - left.hits);
  const [best, second] = scored;
  if (!best) return null;
  return best.hits > (second?.hits ?? 0) ? best.module : null;
}

/**
 * Decide el módulo de la evidencia. Solo cuentan las fuentes dominantes (a
 * `RAG_ROUTING_SCORE_MARGIN` del mejor puntaje): una fuente de cola de otro
 * módulo no es una segunda interpretación real. Si todas comparten al menos un
 * módulo, la ruta está resuelta —también cuando un mismo documento está
 * asociado a varios módulos—; solo hay ambigüedad cuando las fuentes dominantes
 * apuntan a módulos distintos sin ninguno en común.
 */
function routeSources(allSources: RetrievedChunk[]): SourceRoute {
  const sources = withinScoreMargin(allSources, RAG_ROUTING_SCORE_MARGIN);
  const modules = new Map<string, string>();
  let commonModuleIds: Set<string> | null = null;

  for (const source of sources) {
    const sourceModuleIds = new Set(source.moduleIds);
    commonModuleIds = commonModuleIds
      ? new Set([...commonModuleIds].filter((id) => sourceModuleIds.has(id)))
      : sourceModuleIds;

    source.moduleIds.forEach((id, index) => {
      modules.set(id, source.moduleNames[index] ?? 'Módulo sin nombre');
    });
  }

  const sortedModules = [...modules]
    .map(([id, name]) => ({ id, name }))
    .sort((left, right) =>
      left.name.localeCompare(right.name, 'es', { sensitivity: 'base' }),
    );
  const common = new Set(commonModuleIds ?? []);

  if (common.size >= 1) {
    // Módulo común preferido: el primero de la fuente mejor puntuada.
    const id =
      sources[0]?.moduleIds.find((moduleId) => common.has(moduleId)) ??
      [...common][0];
    if (!id) throw new Error('RAG_INVALID_MODULE_ROUTE');
    return {
      kind: 'resolved',
      modules: sortedModules,
      resolvedModule: {
        id,
        name: modules.get(id) ?? 'Módulo sin nombre',
      },
    };
  }

  if (sortedModules.length === 1) {
    return {
      kind: 'resolved',
      modules: sortedModules,
      resolvedModule: sortedModules[0] ?? null,
    };
  }

  return {
    kind: 'ambiguous',
    modules: sortedModules,
    resolvedModule: null,
  };
}

function cleanContextValue(value: string): string {
  return [...value]
    .map((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint <= 31 || codePoint === 127)
        ? ' '
        : character;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function contextualQuery(
  question: string,
  priorUserQuestions: string[],
): string {
  if (!priorUserQuestions.length) return question;
  // Presupuesto dentro del límite de texto de la RPC (8.000); si no alcanza se
  // conservan las consultas más recientes (el final del contexto).
  const budget = RAG_QUERY_TEXT_MAX_CHARS - question.length - 64;
  if (budget <= 0) return question;
  const context = priorUserQuestions
    .slice(-4)
    .map(cleanContextValue)
    .filter(Boolean)
    .join(' | ')
    .slice(-budget)
    .trim();

  return context
    ? `Consultas anteriores: ${context}\nPregunta actual: ${question}`
    : question;
}

/**
 * Un seguimiento elíptico ("¿y cuál es el plazo?", "¿y para auxiliares?") o
 * que remite a lo anterior ("¿y me pagan durante ese tiempo?") solo se entiende
 * con las consultas previas. Uno que nombra su propio tema sin remitir a lo
 * anterior ("¿y para una permuta?") se busca por sí mismo en la búsqueda global.
 */
export function isEllipticalFollowUp(question: string): boolean {
  const normalized = normalizeSpanishText(question);
  return !hasTopicTerm(normalized) || refersBack(question);
}

const ARCHIVED_INTENT_PATTERNS = [
  /\barchivad[oa]s?\b/u,
  /\bantecedentes? historicos? especificos?\b/u,
  /\bconservad[oa]s? (?:unicamente |solo )?como antecedentes? historicos?\b/u,
];

const HISTORICAL_INTENT_PATTERNS = [
  /\bantecedentes?\b/u,
  /\bhistoric[oa]s?\b/u,
  /\bcompar(?:ar|acion|aciones|ativa|ativas|ativo|ativos)\b/u,
  /\bevolucion\b/u,
  /\b(?:diferencias?|cambios?) entre versiones?\b/u,
  /\bversion(?:es)? (?:anterior|anteriores|previa|previas)\b/u,
  /\b(?:norma|normativa|documento|regla)s? (?:anterior|anteriores|previa|previas)\b/u,
  /\b(?:reemplazad[oa]s?|derogad[oa]s?|sin vigencia)\b/u,
  /\b(?:antes|anteriormente)\b/u,
];

/**
 * Keeps historical material fail-closed unless the current question asks for
 * it explicitly. Archived material requires an even stronger explicit signal.
 */
export function detectRetrievalScope(
  question: string,
  currentYear = new Date().getUTCFullYear(),
): RetrievalScope {
  const normalized = normalizeSpanishText(question);

  if (ARCHIVED_INTENT_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'archived_explicit';
  }

  if (HISTORICAL_INTENT_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'historical';
  }

  const years = normalized.match(/\b(?:19|20)\d{2}\b/gu) ?? [];
  if (years.some((year) => Number(year) < currentYear)) {
    return 'historical';
  }

  return 'current';
}

@Injectable()
export class RagService {
  constructor(
    @Inject(EMBEDDINGS_GATEWAY) private readonly embeddings: EmbeddingsGateway,
    @Inject(SUPABASE_RETRIEVAL_GATEWAY)
    private readonly gateway: RetrievalGateway,
    private readonly config: ConfigService,
  ) {}

  async retrieve(
    question: string,
    selectedModuleId: string | null,
    priorUserQuestions: string[] = [],
    options: { forceContext?: boolean } = {},
  ): Promise<RetrievalResult> {
    const directReferences = exactDocumentReferencesIn(question);
    const hasPrior = priorUserQuestions.length > 0;
    // Un seguimiento elíptico (o la respuesta a una aclaración, que completa la
    // pregunta pendiente) se busca con las consultas previas en TODAS las
    // búsquedas: con la pregunta escueta, "¿y el plazo?" coincidía con plazos de
    // otros temas y se declaraba un falso cambio de tema. Una consulta con tema
    // propio se busca tal cual en la global (que es la que detecta el cambio de
    // tema), y con contexto dentro del módulo de la conversación.
    const globalUsesContext =
      hasPrior && (options.forceContext || isEllipticalFollowUp(question));
    const contextual = hasPrior
      ? contextualQuery(question, priorUserQuestions)
      : question;
    const inheritedReferences =
      !directReferences.length && globalUsesContext
        ? ([...priorUserQuestions]
            .reverse()
            .map(exactDocumentReferencesIn)
            .find((references) => references.length > 0) ?? [])
        : [];
    const documentReferences = directReferences.length
      ? directReferences
      : inheritedReferences;
    const incompleteExactReferences = documentReferences.filter(
      (reference) => !reference.complete,
    );
    if (incompleteExactReferences.length) {
      return {
        incompleteExactReferences,
        kind: 'no_evidence',
        topRelevanceScore: null,
      };
    }
    const exactReferences = documentReferences.filter(
      (reference) => reference.complete,
    );
    const retrievalScope = detectRetrievalScope(
      inheritedReferences.length ? contextual : question,
    );
    const globalQuery = globalUsesContext ? contextual : question;
    const selectedQuery = hasPrior ? contextual : question;
    const queries =
      selectedModuleId && selectedQuery !== globalQuery
        ? [globalQuery, selectedQuery]
        : [globalQuery];
    const embeddings = await this.embeddings.embed(
      queries,
      INTERACTIVE_AI_LIMITS,
    );
    const globalEmbedding = embeddings[0];
    const selectedEmbedding = embeddings.at(-1);

    if (
      !globalEmbedding ||
      globalEmbedding.length !== 1536 ||
      !selectedEmbedding ||
      selectedEmbedding.length !== 1536
    ) {
      throw new Error('RAG_INVALID_QUERY_EMBEDDING');
    }

    const matchCount = this.config.get<number>('RAG_MATCH_COUNT') ?? 5;
    const searchBase = {
      // Holgura para descartar duplicados y fuentes fuera de banda sin quedarse
      // corto; la RPC admite hasta 10.
      matchCount: Math.min(10, matchCount * 2),
      matchThreshold:
        this.config.get<number>('RAG_MATCH_THRESHOLD') ??
        RAG_DEFAULT_MATCH_THRESHOLD,
      retrievalScope,
    };
    let rawGlobalSources: RetrievedChunk[];
    let rawSelectedSources: RetrievedChunk[];
    if (exactReferences.length) {
      // Sin una ruta exacta nunca se degrada a similitud: un doble antiguo o
      // una migración ausente debe producir «sin evidencia», no una norma
      // parecida que aparente responder el número solicitado.
      if (!this.gateway.searchExactReferences) {
        return {
          kind: 'no_evidence',
          missingExactReferences: exactReferences,
          topRelevanceScore: null,
        };
      }
      const exactCandidates = (
        await this.gateway.searchExactReferences({
          embedding: globalEmbedding,
          matchCount: searchBase.matchCount,
          query: globalQuery,
          referenceKeys: exactReferences.map(
            (reference) => reference.lookupKey,
          ),
          retrievalScope,
        })
      )
        .map(sanitizeRetrievedEvidence)
        .filter((source): source is RetrievedChunk => Boolean(source))
        .filter((source) =>
          exactReferences.some((reference) =>
            sourceMatchesExactDocumentReference(source, reference),
          ),
        );
      const missingExactReferences = exactReferences.filter(
        (reference) =>
          !exactCandidates.some((source) =>
            sourceMatchesExactDocumentReference(source, reference),
          ),
      );
      if (missingExactReferences.length) {
        return {
          kind: 'no_evidence',
          missingExactReferences,
          topRelevanceScore: null,
        };
      }
      rawGlobalSources = exactCandidates;
      rawSelectedSources = selectedModuleId
        ? exactCandidates.filter((source) =>
            sourceIncludesContext(source, selectedModuleId),
          )
        : [];
    } else {
      const globalSearch = this.gateway.search({
        ...searchBase,
        embedding: globalEmbedding,
        query: globalQuery,
        selectedModuleId: null,
      });
      const selectedSearch = selectedModuleId
        ? this.gateway.search({
            ...searchBase,
            embedding: selectedEmbedding,
            query: selectedQuery,
            selectedModuleId,
          })
        : Promise.resolve<RetrievedChunk[]>([]);
      [rawGlobalSources, rawSelectedSources] = await Promise.all([
        globalSearch,
        selectedSearch,
      ]);
    }
    // La ruta conserva las asociaciones de todos los documentos pertinentes.
    // La deduplicación interdocumental ocurre solo al armar las fuentes que se
    // entregan al modelo y a la interfaz, nunca antes de decidir el módulo.
    const globalRoutingSources = sourcesWithoutVersionDuplicates(
      byScoreDescending(
        sourcesEligibleForQuestion(
          rawGlobalSources
            .map(sanitizeRetrievedEvidence)
            .filter((source): source is RetrievedChunk => Boolean(source)),
          question,
          retrievalScope,
        ),
      ),
    );
    const selectedRoutingSources = sourcesWithoutVersionDuplicates(
      byScoreDescending(
        sourcesEligibleForQuestion(
          rawSelectedSources
            .map(sanitizeRetrievedEvidence)
            .filter((source): source is RetrievedChunk => Boolean(source)),
          question,
          retrievalScope,
        ),
      ),
    );
    if (!globalRoutingSources.length && !selectedRoutingSources.length) {
      return { kind: 'no_evidence', topRelevanceScore: null };
    }

    if (!selectedModuleId) {
      const route = routeSources(globalRoutingSources);
      if (route.kind === 'ambiguous') {
        // Antes de pedir precisión: si la consulta nombra a uno de los módulos
        // en conflicto, ese es el tema real y se responde con su evidencia.
        const namedModule = disambiguateRouteByQuestion(
          question,
          route.modules,
        );
        const scopedSources = namedModule
          ? attributableToModule(globalRoutingSources, namedModule.id)
          : [];
        if (namedModule && scopedSources.length) {
          const sources = relevantSources(scopedSources, matchCount, question);
          return {
            kind: 'evidence',
            resolvedModule: namedModule,
            sources,
            topRelevanceScore: topScore(sources),
          };
        }

        const sources = relevantSources(
          globalRoutingSources,
          matchCount,
          question,
        );
        return {
          kind: 'ambiguous',
          modules: route.modules,
          sources,
          topRelevanceScore: topScore(sources),
        };
      }
      const resolvedModule = route.resolvedModule;
      const sources = relevantSources(
        resolvedModule
          ? attributableToModule(globalRoutingSources, resolvedModule.id)
          : globalRoutingSources,
        matchCount,
        question,
      );
      return {
        kind: 'evidence',
        resolvedModule,
        sources,
        topRelevanceScore: topScore(sources),
      };
    }

    const dominantGlobal = withinScoreMargin(
      globalRoutingSources,
      RAG_ROUTING_SCORE_MARGIN,
    );
    const currentRoute = globalRoutingSources.length
      ? routeSources(globalRoutingSources)
      : null;
    if (currentRoute) {
      if (
        currentRoute.kind === 'resolved' &&
        currentRoute.resolvedModule &&
        currentRoute.resolvedModule.id !== selectedModuleId &&
        !dominantGlobal.some((source) =>
          sourceIncludesContext(source, selectedModuleId),
        )
      ) {
        const globalScore = topScore(globalRoutingSources);
        const selectedScore = selectedRoutingSources.length
          ? topScore(selectedRoutingSources)
          : null;
        if (
          selectedScore === null ||
          globalScore - selectedScore >= RAG_TOPIC_SWITCH_SCORE_MARGIN
        ) {
          const sources = relevantSources(
            attributableToModule(
              globalRoutingSources,
              currentRoute.resolvedModule.id,
            ),
            matchCount,
            question,
          );
          return {
            kind: 'topic_change',
            resolvedModule: currentRoute.resolvedModule,
            sources,
            topRelevanceScore: topScore(sources),
          };
        }

        const competingCandidates = balancedUniqueSources(
          10,
          withinScoreMargin(globalRoutingSources, RAG_SOURCE_SCORE_MARGIN),
          withinScoreMargin(selectedRoutingSources, RAG_SOURCE_SCORE_MARGIN),
        );
        const competingSources = prepareDelivery(
          uniqueSources(byScoreDescending(competingCandidates)),
          question,
        );
        return {
          kind: 'ambiguous',
          // La ruta conserva ambos temas candidatos aunque sus extractos sean
          // equivalentes; la lista visible no los repite.
          modules: routeSources(competingCandidates).modules,
          sources: competingSources,
          topRelevanceScore: Math.max(globalScore, selectedScore),
        };
      }

      if (
        currentRoute.kind === 'ambiguous' &&
        !dominantGlobal.some((source) =>
          sourceIncludesContext(source, selectedModuleId),
        )
      ) {
        // La consulta puede nombrar el proceso de otro módulo aunque la
        // conversación esté abierta en uno distinto: si nombra uno de los
        // módulos en conflicto, ese es el tema y no corresponde pedir una
        // aclaración (OBS-014).
        const namedModule = disambiguateRouteByQuestion(
          question,
          currentRoute.modules,
        );
        if (namedModule) {
          const sources = relevantSources(
            attributableToModule(globalRoutingSources, namedModule.id),
            matchCount,
            question,
          );
          if (sources.length) {
            return {
              kind: 'topic_change',
              resolvedModule: namedModule,
              sources,
              topRelevanceScore: topScore(sources),
            };
          }
        }

        const sources = relevantSources(
          globalRoutingSources,
          matchCount,
          question,
        );
        return {
          kind: 'ambiguous',
          modules: currentRoute.modules,
          sources,
          topRelevanceScore: topScore(sources),
        };
      }
    }

    if (selectedRoutingSources.length) {
      // Subtema dentro del mismo módulo: la evidencia global que pertenece al
      // módulo seleccionado también cuenta ("¿y para una permuta?" dentro de
      // Desplazamientos), no solo la de la búsqueda acotada.
      const sources = relevantSources(
        byScoreDescending([
          ...selectedRoutingSources,
          ...globalRoutingSources.filter((source) =>
            sourceIncludesContext(source, selectedModuleId),
          ),
        ]),
        matchCount,
        question,
      );
      const selectedRoot = resolveSelectedRootModule(sources, selectedModuleId);
      return {
        kind: 'evidence',
        resolvedModule: selectedRoot ?? {
          id: selectedModuleId,
          name: 'Módulo seleccionado',
        },
        sources,
        topRelevanceScore: topScore(sources),
      };
    }

    if (
      currentRoute?.kind === 'resolved' &&
      currentRoute.resolvedModule?.id === selectedModuleId
    ) {
      const sources = relevantSources(
        globalRoutingSources,
        matchCount,
        question,
      );
      return {
        kind: 'evidence',
        resolvedModule: currentRoute.resolvedModule,
        sources,
        topRelevanceScore: topScore(sources),
      };
    }

    if (globalRoutingSources.length) {
      const sources = relevantSources(
        globalRoutingSources,
        matchCount,
        question,
      );
      return {
        kind: 'ambiguous',
        modules: currentRoute?.modules ?? [],
        sources,
        topRelevanceScore: topScore(sources),
      };
    }

    return { kind: 'no_evidence', topRelevanceScore: null };
  }
}
