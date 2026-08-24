import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type {
  RetrievalGateway,
  RetrievedChunk,
} from '../rag/retrieval.gateway';
import type { SupabaseServerClient } from './supabase.server-client';

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
    const { data, error } = await this.client.rpc('search_document_chunks', {
      p_match_count: input.matchCount,
      p_match_threshold: input.matchThreshold,
      p_query_embedding: input.embedding,
      p_query_text: input.query,
      p_selected_module_id: input.selectedModuleId,
    });
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
