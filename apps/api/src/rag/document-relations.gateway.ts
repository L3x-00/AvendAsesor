/** Fila devuelta por `public.get_related_documents`. */
export interface RelatedDocumentRow {
  sourceDocumentId: string;
  sourceTitle: string;
  sourceType: string;
  sourceYear: number | null;
  relationId: string | null;
  relationType:
    'modifica' | 'deroga' | 'reglamenta' | 'cita' | 'complementa' | null;
  notes: string | null;
  targetDocumentId: string | null;
  targetTitle: string | null;
  targetType: string | null;
  targetYear: number | null;
  evidenceChunkId: string | null;
}

/**
 * Lectura de relaciones documentales. La tabla no se expone al cliente: el
 * adaptador llama al RPC acotado y traduce sus filas.
 */
export interface DocumentRelationsGateway {
  relatedDocuments(documentId: string): Promise<RelatedDocumentRow[]>;
}
