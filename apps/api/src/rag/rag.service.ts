import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EmbeddingsGateway } from '../ingestion/embeddings.gateway';
import { EMBEDDINGS_GATEWAY } from '../ingestion/ingestion.tokens';
import { SUPABASE_RETRIEVAL_GATEWAY } from '../supabase/supabase.constants';
import { hasTopicTerm } from './domain-lexicon';
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
  | { kind: 'no_evidence'; topRelevanceScore: null }
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

/**
 * Quita fragmentos repetidos (mismo texto de la misma versión). El chunker
 * anterior guardaba duplicados exactos; hasta reindexar, sin este filtro
 * ocupaban dos de las cinco fuentes y repetían filas en las referencias.
 */
function uniqueSources(sources: RetrievedChunk[]): RetrievedChunk[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = `${source.documentVersionId}\u0000${source.chunkContent.replace(/\s+/gu, ' ').trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
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

/** Evidencia que se entrega: sin duplicados, dentro de la banda y acotada. */
function relevantSources(
  sources: RetrievedChunk[],
  limit: number,
): RetrievedChunk[] {
  return withinScoreMargin(
    uniqueSources(sources),
    RAG_SOURCE_SCORE_MARGIN,
  ).slice(0, limit);
}

function byScoreDescending(sources: RetrievedChunk[]): RetrievedChunk[] {
  return [...sources].sort(
    (left, right) => right.semanticScore - left.semanticScore,
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

/** Referencia a lo ya hablado: «durante ese tiempo», «en ese caso», «lo mismo». */
const ANAPHORA =
  /\b(ese|esa|eso|esos|esas|este|esta|esto|estos|estas|dicho|dicha|dichos|dichas|mismo|misma|ello|aquel|aquella)\b/u;

/**
 * Un seguimiento elíptico ("¿y cuál es el plazo?", "¿y para auxiliares?") o
 * que remite a lo anterior ("¿y me pagan durante ese tiempo?") solo se entiende
 * con las consultas previas. Uno que nombra su propio tema sin remitir a lo
 * anterior ("¿y para una permuta?") se busca por sí mismo en la búsqueda global.
 */
export function isEllipticalFollowUp(question: string): boolean {
  const normalized = normalizeSpanishText(question);
  return !hasTopicTerm(normalized) || ANAPHORA.test(normalized);
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
    const retrievalScope = detectRetrievalScope(question);
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
    const globalQuery = globalUsesContext ? contextual : question;
    const selectedQuery = hasPrior ? contextual : question;
    const queries =
      selectedModuleId && selectedQuery !== globalQuery
        ? [globalQuery, selectedQuery]
        : [globalQuery];
    const embeddings = await this.embeddings.embed(queries);
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
    const [rawGlobalSources, rawSelectedSources] = await Promise.all([
      globalSearch,
      selectedSearch,
    ]);
    const globalSources = uniqueSources(rawGlobalSources);
    const selectedSources = uniqueSources(rawSelectedSources);

    if (!globalSources.length && !selectedSources.length) {
      return { kind: 'no_evidence', topRelevanceScore: null };
    }

    if (!selectedModuleId) {
      const route = routeSources(globalSources);
      const sources = relevantSources(globalSources, matchCount);
      if (route.kind === 'ambiguous') {
        return {
          kind: 'ambiguous',
          modules: route.modules,
          sources,
          topRelevanceScore: topScore(sources),
        };
      }
      return {
        kind: 'evidence',
        resolvedModule: route.resolvedModule,
        sources,
        topRelevanceScore: topScore(sources),
      };
    }

    const dominantGlobal = withinScoreMargin(
      globalSources,
      RAG_ROUTING_SCORE_MARGIN,
    );
    const currentRoute = globalSources.length
      ? routeSources(globalSources)
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
        const globalScore = topScore(globalSources);
        const selectedScore = selectedSources.length
          ? topScore(selectedSources)
          : null;
        if (
          selectedScore === null ||
          globalScore - selectedScore >= RAG_TOPIC_SWITCH_SCORE_MARGIN
        ) {
          const sources = relevantSources(globalSources, matchCount);
          return {
            kind: 'topic_change',
            resolvedModule: currentRoute.resolvedModule,
            sources,
            topRelevanceScore: topScore(sources),
          };
        }

        const competingSources = balancedUniqueSources(
          10,
          withinScoreMargin(globalSources, RAG_SOURCE_SCORE_MARGIN),
          withinScoreMargin(selectedSources, RAG_SOURCE_SCORE_MARGIN),
        );
        return {
          kind: 'ambiguous',
          modules: routeSources(competingSources).modules,
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
        const sources = relevantSources(globalSources, matchCount);
        return {
          kind: 'ambiguous',
          modules: currentRoute.modules,
          sources,
          topRelevanceScore: topScore(sources),
        };
      }
    }

    if (selectedSources.length) {
      // Subtema dentro del mismo módulo: la evidencia global que pertenece al
      // módulo seleccionado también cuenta ("¿y para una permuta?" dentro de
      // Desplazamientos), no solo la de la búsqueda acotada.
      const sources = relevantSources(
        byScoreDescending([
          ...selectedSources,
          ...globalSources.filter((source) =>
            sourceIncludesContext(source, selectedModuleId),
          ),
        ]),
        matchCount,
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
      const sources = relevantSources(globalSources, matchCount);
      return {
        kind: 'evidence',
        resolvedModule: currentRoute.resolvedModule,
        sources,
        topRelevanceScore: topScore(sources),
      };
    }

    if (globalSources.length) {
      const sources = relevantSources(globalSources, matchCount);
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
