import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EmbeddingsGateway } from '../ingestion/embeddings.gateway';
import { EMBEDDINGS_GATEWAY } from '../ingestion/ingestion.tokens';
import { SUPABASE_RETRIEVAL_GATEWAY } from '../supabase/supabase.constants';
import type { RetrievalGateway, RetrievedChunk } from './retrieval.gateway';

export type RetrievalResult =
  | { kind: 'no_evidence'; topRelevanceScore: null }
  | {
      kind: 'ambiguous';
      modules: { id: string; name: string }[];
      topRelevanceScore: number;
    }
  | {
      kind: 'evidence';
      sources: RetrievedChunk[];
      topRelevanceScore: number;
    };

function clampScore(value: number): number {
  return Math.min(1, Math.max(0, value));
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
  ): Promise<RetrievalResult> {
    const [embedding] = await this.embeddings.embed([question]);
    if (!embedding || embedding.length !== 1536) {
      throw new Error('RAG_INVALID_QUERY_EMBEDDING');
    }
    const sources = await this.gateway.search({
      embedding,
      matchCount: this.config.get<number>('RAG_MATCH_COUNT') ?? 5,
      matchThreshold: this.config.get<number>('RAG_MATCH_THRESHOLD') ?? 0.7,
      query: question,
      selectedModuleId,
    });
    if (!sources.length)
      return { kind: 'no_evidence', topRelevanceScore: null };

    const topRelevanceScore = clampScore(
      Math.max(...sources.map((source) => source.semanticScore)),
    );

    if (selectedModuleId) {
      return { kind: 'evidence', sources, topRelevanceScore };
    }

    const modules = new Map<string, string>();
    let commonModuleIds: Set<string> | null = null;

    for (const source of sources) {
      const sourceModuleIds = new Set(source.moduleIds);
      commonModuleIds = commonModuleIds
        ? new Set([...commonModuleIds].filter((id) => sourceModuleIds.has(id)))
        : sourceModuleIds;

      source.moduleIds.forEach((id, index) =>
        modules.set(id, source.moduleNames[index] ?? 'Módulo sin nombre'),
      );
    }
    if (modules.size > 1 && commonModuleIds?.size === 0) {
      return {
        kind: 'ambiguous',
        modules: [...modules].map(([id, name]) => ({ id, name })),
        topRelevanceScore,
      };
    }
    return { kind: 'evidence', sources, topRelevanceScore };
  }
}
