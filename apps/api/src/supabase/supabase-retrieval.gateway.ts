import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DATE_SQL_PATTERN } from '../rag/dated-evidence';
import {
  EXACT_REFERENCE_RETRIEVAL_RPC_NAME,
  RETRIEVAL_RPC_NAME,
} from '../rag/retrieval.constants';
import type {
  RetrievalGateway,
  RetrievedChunk,
  VersionChunk,
} from '../rag/retrieval.gateway';
import type { SupabaseServerClient } from './supabase.server-client';

interface SituationAwareRetrievalRow {
  article_reference: string | null;
  chunk_content: string;
  chunk_id: string;
  document_id: string;
  document_situation: 'archived' | 'current' | 'replaced';
  document_title: string;
  document_type: string | null;
  document_version_id: string;
  issuance_year: number | null;
  lexical_score: number;
  mime_type: string;
  module_associations: Array<{
    rootModuleId: string;
    rootModuleName: string;
    submoduleId: string | null;
    submoduleName: string | null;
  }>;
  module_ids: string[];
  module_names: string[];
  numeral_reference: string | null;
  page_end: number;
  pdf_page_count: number | null;
  page_start: number;
  resolution_number: string | null;
  section_title: string | null;
  semantic_score: number;
  version_number: number;
}

interface SituationAwareRetrievalClient {
  rpc(
    name: typeof RETRIEVAL_RPC_NAME,
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

interface ExactReferenceRetrievalClient {
  rpc(
    name: typeof EXACT_REFERENCE_RETRIEVAL_RPC_NAME,
    args: {
      p_match_count: number;
      p_query_embedding: number[];
      p_query_text: string;
      p_reference_keys: string[];
      p_retrieval_scope: 'archived_explicit' | 'current' | 'historical';
    },
  ): Promise<{
    data: SituationAwareRetrievalRow[] | null;
    error: unknown;
  }>;
}

function toRetrievedChunk(row: SituationAwareRetrievalRow): RetrievedChunk {
  return {
    articleReference: row.article_reference,
    chunkContent: row.chunk_content,
    chunkId: row.chunk_id,
    documentId: row.document_id,
    documentSituation: row.document_situation,
    documentTitle: row.document_title,
    documentType: row.document_type,
    documentVersionId: row.document_version_id,
    issuanceYear: row.issuance_year,
    lexicalScore: row.lexical_score,
    mimeType: row.mime_type,
    moduleAssociations: row.module_associations,
    moduleIds: row.module_ids,
    moduleNames: row.module_names,
    numeralReference: row.numeral_reference,
    pageEnd: row.page_end,
    ...(row.pdf_page_count == null ? {} : { pdfPageCount: row.pdf_page_count }),
    pageStart: row.page_start,
    resolutionNumber: row.resolution_number,
    sectionTitle: row.section_title,
    semanticScore: row.semantic_score,
    versionNumber: row.version_number,
  };
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
    const { data, error } = await retrievalClient.rpc(RETRIEVAL_RPC_NAME, {
      p_match_count: input.matchCount,
      p_match_threshold: input.matchThreshold,
      p_query_embedding: input.embedding,
      p_query_text: input.query,
      p_retrieval_scope: input.retrievalScope,
      p_selected_module_id: input.selectedModuleId,
    });
    if (error) {
      throw new ServiceUnavailableException(
        'Document retrieval is temporarily unavailable.',
      );
    }
    return (data ?? []).map(toRetrievedChunk);
  }

  async searchExactReferences(
    input: Parameters<
      NonNullable<RetrievalGateway['searchExactReferences']>
    >[0],
  ): Promise<RetrievedChunk[]> {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Document retrieval is not configured.',
      );
    }
    const retrievalClient = this
      .client as unknown as ExactReferenceRetrievalClient;
    const { data, error } = await retrievalClient.rpc(
      EXACT_REFERENCE_RETRIEVAL_RPC_NAME,
      {
        p_match_count: input.matchCount,
        p_query_embedding: input.embedding,
        p_query_text: input.query,
        p_reference_keys: input.referenceKeys,
        p_retrieval_scope: input.retrievalScope,
      },
    );
    if (error) {
      throw new ServiceUnavailableException(
        'Exact document retrieval is temporarily unavailable.',
      );
    }
    return (data ?? []).map(toRetrievedChunk);
  }

  /**
   * Lee en la base solo los fragmentos con alguna fecha (`~*`) de cada versión,
   * en orden de aparición. Las versiones vienen de la búsqueda protegida del
   * mismo turno, que ya comprobó que son evidencia aprobada y vigente.
   */
  async datedChunksOfVersions(input: {
    limitPerVersion: number;
    versionIds: string[];
  }): Promise<VersionChunk[]> {
    const client = this.client;
    if (!client) {
      throw new ServiceUnavailableException(
        'Document retrieval is not configured.',
      );
    }
    const results = await Promise.all(
      [...new Set(input.versionIds)].map((versionId) =>
        client
          .from('document_chunks')
          .select(
            'id, document_version_id, chunk_index, page_start, page_end, section_title, article_reference, numeral_reference, chunk_content',
          )
          .eq('document_version_id', versionId)
          .filter('chunk_content', 'imatch', DATE_SQL_PATTERN)
          .order('chunk_index', { ascending: true })
          .limit(input.limitPerVersion),
      ),
    );
    if (results.some((result) => result.error)) {
      throw new ServiceUnavailableException(
        'Dated document evidence is temporarily unavailable.',
      );
    }
    return results.flatMap((result) =>
      (result.data ?? []).map((row) => ({
        articleReference: row.article_reference,
        chunkContent: row.chunk_content,
        chunkId: row.id,
        chunkIndex: row.chunk_index,
        documentVersionId: row.document_version_id,
        numeralReference: row.numeral_reference,
        pageEnd: row.page_end,
        pageStart: row.page_start,
        sectionTitle: row.section_title,
      })),
    );
  }
}
