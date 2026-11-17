import { ServiceUnavailableException } from '@nestjs/common';
import type {
  DocumentRelationsGateway,
  RelatedDocumentRow,
} from '../rag/document-relations.gateway';
import type { SupabaseServerClient } from './supabase.server-client';

/**
 * Adaptador del RPC `get_related_documents`. Falla cerrado: sin cliente o con
 * error de base no devuelve una lista vacía que pudiera interpretarse como
 * «no hay relaciones registradas».
 */
export class SupabaseDocumentRelationsGatewayAdapter implements DocumentRelationsGateway {
  constructor(private readonly client: SupabaseServerClient | null) {}

  async relatedDocuments(documentId: string): Promise<RelatedDocumentRow[]> {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Document relations are not configured.',
      );
    }
    const { data, error } = await this.client.rpc('get_related_documents', {
      p_document_id: documentId,
    });
    if (error) {
      throw new ServiceUnavailableException(
        'Document relations could not be read.',
      );
    }
    return (data ?? []).map((row) => ({
      sourceDocumentId: row.source_document_id,
      sourceTitle: row.source_title,
      sourceType: row.source_type,
      sourceYear: row.source_year,
      relationId: row.relation_id,
      relationType: row.relation_type,
      notes: row.notes,
      targetDocumentId: row.target_document_id,
      targetTitle: row.target_title,
      targetType: row.target_type,
      targetYear: row.target_year,
      evidenceChunkId: row.evidence_chunk_id,
    }));
  }
}
