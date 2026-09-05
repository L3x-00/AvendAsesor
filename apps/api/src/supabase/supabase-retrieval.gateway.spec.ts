import { ServiceUnavailableException } from '@nestjs/common';
import { SupabaseRetrievalGatewayAdapter } from './supabase-retrieval.gateway';
import type { SupabaseServerClient } from './supabase.server-client';

const input = {
  embedding: Array.from({ length: 1536 }, () => 0.1),
  matchCount: 5,
  matchThreshold: 0.7,
  query: 'Consulta normativa',
  retrievalScope: 'historical' as const,
  selectedModuleId: null,
};

describe('SupabaseRetrievalGatewayAdapter', () => {
  it('fails closed when no server client is configured', async () => {
    await expect(
      new SupabaseRetrievalGatewayAdapter(null).search(input),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('calls the protected hybrid search RPC and maps only its contract', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [
        {
          article_reference: null,
          chunk_content: 'Texto',
          chunk_id: 'chunk',
          document_id: 'document',
          document_situation: 'replaced',
          document_title: 'Norma',
          document_version_id: 'version',
          lexical_score: 0.4,
          module_ids: ['module'],
          module_names: ['Módulo'],
          numeral_reference: null,
          page_end: 2,
          page_start: 1,
          section_title: null,
          semantic_score: 0.9,
          version_number: 1,
        },
      ],
      error: null,
    });
    const gateway = new SupabaseRetrievalGatewayAdapter({
      rpc,
    } as unknown as SupabaseServerClient);
    await expect(gateway.search(input)).resolves.toEqual([
      expect.objectContaining({
        chunkId: 'chunk',
        documentSituation: 'replaced',
        documentTitle: 'Norma',
        semanticScore: 0.9,
      }),
    ]);
    expect(rpc).toHaveBeenCalledWith(
      'search_document_chunks_by_situation',
      expect.objectContaining({
        p_query_text: input.query,
        p_retrieval_scope: 'historical',
      }),
    );
  });

  it('hides database errors behind a service error', async () => {
    const rpc = jest
      .fn()
      .mockResolvedValue({ data: null, error: { code: 'XX000' } });
    await expect(
      new SupabaseRetrievalGatewayAdapter({
        rpc,
      } as unknown as SupabaseServerClient).search(input),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
