import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type {
  RetrievalGateway,
  RetrievedChunk,
} from '../rag/retrieval.gateway';
import type { SupabaseServerClient } from './supabase.server-client';

interface SituationAwareRetrievalRow {
  article_reference: string | null;
  chunk_content: string;
  chunk_id: string;
  document_id: string;
  document_situation: 'archived' | 'current' | 'replaced';
  document_title: string;
  document_version_id: string;
  lexical_score: number;
  module_ids: string[];
  module_names: string[];
  numeral_reference: string | null;
  page_end: number;
  page_start: number;
  section_title: string | null;
  semantic_score: number;
  version_number: number;
}

interface SituationAwareRetrievalClient {
  rpc(
    name: 'search_document_chunks_by_situation',
    args: {
      p_match_count: number;
      p_match_threshold: number;
      p_query_embedding: number[];
      p_query_text: string;
      p_retrieval_scope: 'archived_explicit' | 'current' | 'historical';
      p_selected_module_id: string | null;
    },
  ): Promise<{
    data: SituationAwareRetrievalRow[] | null;
    error: unknown;
  }>;
}

@Injectable()
export class SupabaseRetrievalGatewayAdapter implements RetrievalGateway {
  constructor(private readonly client: SupabaseServerClient | null) {}

  async search(
    input: Parameters<RetrievalGateway['search']>[0],
  ): Promise<RetrievedChunk[]> {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Document retrieval is not configured.',
      );
    }
    // The generated database client is updated by the DB/API integration
    // owner. This narrow local contract keeps this adapter type-safe meanwhile.
    const retrievalClient = this
      .client as unknown as SituationAwareRetrievalClient;
    const { data, error } = await retrievalClient.rpc(
      'search_document_chunks_by_situation',
      {
        p_match_count: input.matchCount,
        p_match_threshold: input.matchThreshold,
        p_query_embedding: input.embedding,
        p_query_text: input.query,
        p_retrieval_scope: input.retrievalScope,
        p_selected_module_id: input.selectedModuleId,
      },
    );
    if (error) {
      throw new ServiceUnavailableException(
        'Document retrieval is temporarily unavailable.',
      );
    }
    return (data ?? []).map((row) => ({
      articleReference: row.article_reference,
      chunkContent: row.chunk_content,
      chunkId: row.chunk_id,
      documentId: row.document_id,
      documentSituation: row.document_situation,
      documentTitle: row.document_title,
      documentVersionId: row.document_version_id,
      lexicalScore: row.lexical_score,
      moduleIds: row.module_ids,
      moduleNames: row.module_names,
      numeralReference: row.numeral_reference,
      pageEnd: row.page_end,
      pageStart: row.page_start,
      sectionTitle: row.section_title,
      semanticScore: row.semantic_score,
      versionNumber: row.version_number,
    }));
  }
}
