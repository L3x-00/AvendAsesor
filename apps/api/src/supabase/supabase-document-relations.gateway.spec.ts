import { ServiceUnavailableException } from '@nestjs/common';
import { SupabaseDocumentRelationsGatewayAdapter } from './supabase-document-relations.gateway';
import type { SupabaseServerClient } from './supabase.server-client';

const documentId = '11111111-1111-1111-1111-111111111111';

describe('SupabaseDocumentRelationsGatewayAdapter', () => {
  it('traduce las filas del RPC sin exponer la tabla', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [
        {
          source_document_id: documentId,
          source_title: 'Ley de prueba',
          source_type: 'LEY',
          source_year: 2012,
          relation_id: null,
          relation_type: null,
          notes: null,
          target_document_id: null,
          target_title: null,
          target_type: null,
          target_year: null,
          evidence_chunk_id: null,
        },
      ],
      error: null,
    });

    const rows = await new SupabaseDocumentRelationsGatewayAdapter({
      rpc,
    } as unknown as SupabaseServerClient).relatedDocuments(documentId);

    expect(rpc).toHaveBeenCalledWith('get_related_documents', {
      p_document_id: documentId,
    });
    expect(rows).toEqual([
      expect.objectContaining({
        sourceDocumentId: documentId,
        sourceTitle: 'Ley de prueba',
        relationId: null,
        targetDocumentId: null,
      }),
    ]);
  });

  it('devuelve lista vacía cuando el RPC no trae filas', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: null });
    await expect(
      new SupabaseDocumentRelationsGatewayAdapter({
        rpc,
      } as unknown as SupabaseServerClient).relatedDocuments(documentId),
    ).resolves.toEqual([]);
  });

  it('oculta el error de base detrás de error de servicio', async () => {
    const rpc = jest
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'down' } });

    await expect(
      new SupabaseDocumentRelationsGatewayAdapter({
        rpc,
      } as unknown as SupabaseServerClient).relatedDocuments(documentId),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('falla cerrado sin cliente configurado', async () => {
    await expect(
      new SupabaseDocumentRelationsGatewayAdapter(null).relatedDocuments(
        documentId,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
