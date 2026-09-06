import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EmbeddingsGateway } from '../ingestion/embeddings.gateway';
import { EMBEDDINGS_GATEWAY } from '../ingestion/ingestion.tokens';
import { SUPABASE_RETRIEVAL_GATEWAY } from '../supabase/supabase.constants';
import {
  MAX_CHAT_CONTEXT_CHARS,
  RAG_TOPIC_SWITCH_SCORE_MARGIN,
} from './rag.constants';
import type {
  RetrievalGateway,
  RetrievedChunk,
  RetrievedModuleAssociation,
  RetrievalScope,
} from './retrieval.gateway';

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

function routeSources(sources: RetrievedChunk[]): SourceRoute {
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
  const common = [...(commonModuleIds ?? [])];

  if (common.length === 1) {
    const id = common[0];
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
  const context = priorUserQuestions
    .slice(-4)
    .map(cleanContextValue)
    .filter(Boolean)
    .join(' | ')
    .slice(0, Math.max(0, MAX_CHAT_CONTEXT_CHARS - question.length - 64));

  return context
    ? `Consultas anteriores: ${context}\nPregunta actual: ${question}`
    : question;
}

function normalizedIntentText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es')
    .replace(/\s+/g, ' ')
    .trim();
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
  const normalized = normalizedIntentText(question);

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
  ): Promise<RetrievalResult> {
    const followUpQuery = contextualQuery(question, priorUserQuestions);
    const retrievalScope = detectRetrievalScope(question);
    const queries =
      selectedModuleId && followUpQuery !== question
        ? [question, followUpQuery]
        : [question];
    const embeddings = await this.embeddings.embed(queries);
    const currentEmbedding = embeddings[0];
    const contextualEmbedding = embeddings.at(-1);

    if (
      !currentEmbedding ||
      currentEmbedding.length !== 1536 ||
      !contextualEmbedding ||
      contextualEmbedding.length !== 1536
    ) {
      throw new Error('RAG_INVALID_QUERY_EMBEDDING');
    }

    const searchBase = {
      matchCount: this.config.get<number>('RAG_MATCH_COUNT') ?? 5,
      matchThreshold: this.config.get<number>('RAG_MATCH_THRESHOLD') ?? 0.7,
    };
    const globalSearch = this.gateway.search({
      ...searchBase,
      embedding: currentEmbedding,
      query: question,
      retrievalScope,
      selectedModuleId: null,
    });
    const selectedSearch = selectedModuleId
      ? this.gateway.search({
          ...searchBase,
          embedding: contextualEmbedding,
          query: followUpQuery,
          retrievalScope,
          selectedModuleId,
        })
      : Promise.resolve<RetrievedChunk[]>([]);
    const [globalSources, selectedSources] = await Promise.all([
      globalSearch,
      selectedSearch,
    ]);

    if (!globalSources.length && !selectedSources.length) {
      return { kind: 'no_evidence', topRelevanceScore: null };
    }

    if (!selectedModuleId) {
      const route = routeSources(globalSources);
      if (route.kind === 'ambiguous') {
        return {
          kind: 'ambiguous',
          modules: route.modules,
          sources: globalSources,
          topRelevanceScore: topScore(globalSources),
        };
      }
      return {
        kind: 'evidence',
        resolvedModule: route.resolvedModule,
        sources: globalSources,
        topRelevanceScore: topScore(globalSources),
      };
    }

    const currentRoute = globalSources.length
      ? routeSources(globalSources)
      : null;
    if (currentRoute) {
      if (
        currentRoute.kind === 'resolved' &&
        currentRoute.resolvedModule &&
        currentRoute.resolvedModule.id !== selectedModuleId &&
        !globalSources.some((source) =>
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
          return {
            kind: 'topic_change',
            resolvedModule: currentRoute.resolvedModule,
            sources: globalSources,
            topRelevanceScore: globalScore,
          };
        }

        const competingSources = balancedUniqueSources(
          10,
          globalSources,
          selectedSources,
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
        !globalSources.some((source) =>
          sourceIncludesContext(source, selectedModuleId),
        )
      ) {
        return {
          kind: 'ambiguous',
          modules: currentRoute.modules,
          sources: globalSources,
          topRelevanceScore: topScore(globalSources),
        };
      }
    }

    if (selectedSources.length) {
      const selectedRoot = resolveSelectedRootModule(
        selectedSources,
        selectedModuleId,
      );
      return {
        kind: 'evidence',
        resolvedModule: selectedRoot ?? {
          id: selectedModuleId,
          name: 'Módulo seleccionado',
        },
        sources: selectedSources,
        topRelevanceScore: topScore(selectedSources),
      };
    }

    if (
      currentRoute?.kind === 'resolved' &&
      currentRoute.resolvedModule?.id === selectedModuleId
    ) {
      return {
        kind: 'evidence',
        resolvedModule: currentRoute.resolvedModule,
        sources: globalSources,
        topRelevanceScore: topScore(globalSources),
      };
    }

    if (globalSources.length) {
      return {
        kind: 'ambiguous',
        modules: currentRoute?.modules ?? [],
        sources: globalSources,
        topRelevanceScore: topScore(globalSources),
      };
    }

    return { kind: 'no_evidence', topRelevanceScore: null };
  }
}
