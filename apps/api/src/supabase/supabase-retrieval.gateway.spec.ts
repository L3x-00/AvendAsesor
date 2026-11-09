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

const row = {
  article_reference: null,
  chunk_content: 'Texto',
  chunk_id: 'chunk',
  document_id: 'document',
  document_situation: 'replaced',
  document_title: 'Norma',
  document_type: 'RESOLUCION_MINISTERIAL',
  document_version_id: 'version',
  issuance_year: 2024,
  lexical_score: 0.4,
  mime_type: 'application/pdf',
  module_associations: [
    {
      rootModuleId: 'module',
      rootModuleName: 'Módulo',
      submoduleId: 'submodule',
      submoduleName: 'Submódulo',
    },
  ],
  module_ids: ['module'],
  module_names: ['Módulo'],
  numeral_reference: null,
  page_end: 2,
  pdf_page_count: 17,
  page_start: 1,
  resolution_number: 'RM-123-2024-MINEDU',
  section_title: null,
  semantic_score: 0.9,
  version_number: 1,
} as const;

describe('SupabaseRetrievalGatewayAdapter', () => {
  describe('reviewed version context', () => {
    it('fails closed without a configured client', async () => {
      await expect(
        new SupabaseRetrievalGatewayAdapter(null).contextChunksOfVersion({
          versionId: 'v',
          chunkIds: ['c'],
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
    it.each([false, true])(
      'restricts a bounded read to the admitted version and explicit identifiers (empty=%s)',
      async (empty) => {
        const stored = {
          id: 'c',
          document_version_id: 'v',
          chunk_index: 33,
          chunk_content: 'original',
          page_start: 31,
          page_end: 31,
          section_title: null,
          article_reference: null,
          numeral_reference: null,
        };
        const query = {
          select: jest.fn(),
          eq: jest.fn(),
          in: jest.fn(),
          order: jest
            .fn()
            .mockResolvedValue({ data: empty ? [] : [stored], error: null }),
        };
        query.select.mockReturnValue(query);
        query.eq.mockReturnValue(query);
        query.in.mockReturnValue(query);
        const from = jest.fn().mockReturnValue(query);
        const gateway = new SupabaseRetrievalGatewayAdapter({
          from,
        } as unknown as SupabaseServerClient);
        const found = await gateway.contextChunksOfVersion({
          versionId: 'v',
          chunkIds: ['c', 'c', '2', '3', '4', '5', '6'],
        });
        expect(from).toHaveBeenCalledWith('document_chunks');
        expect(query.eq).toHaveBeenCalledWith('document_version_id', 'v');
        expect(query.in).toHaveBeenCalledWith('id', ['c', '2', '3', '4', '5']);
        expect(found).toEqual(
          empty
            ? []
            : [
                expect.objectContaining({
                  chunkId: 'c',
                  documentVersionId: 'v',
                  chunkIndex: 33,
                  chunkContent: 'original',
                  pageStart: 31,
                  pageEnd: 31,
                }),
              ],
        );
      },
    );
    it('does not silently authorize an unavailable read', async () => {
      const query = {
        select: jest.fn(),
        eq: jest.fn(),
        in: jest.fn(),
        order: jest
          .fn()
          .mockResolvedValue({ data: null, error: { message: 'unavailable' } }),
      };
      query.select.mockReturnValue(query);
      query.eq.mockReturnValue(query);
      query.in.mockReturnValue(query);
      const gateway = new SupabaseRetrievalGatewayAdapter({
        from: jest.fn().mockReturnValue(query),
      } as unknown as SupabaseServerClient);
      await expect(
        gateway.contextChunksOfVersion({ versionId: 'v', chunkIds: ['c'] }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });
  it('fails closed when no server client is configured', async () => {
    await expect(
      new SupabaseRetrievalGatewayAdapter(null).search(input),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('calls the protected hybrid search RPC and maps only its contract', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [row],
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
        documentType: 'RESOLUCION_MINISTERIAL',
        issuanceYear: 2024,
        moduleAssociations: [
          {
            rootModuleId: 'module',
            rootModuleName: 'Módulo',
            submoduleId: 'submodule',
            submoduleName: 'Submódulo',
          },
        ],
        mimeType: 'application/pdf',
        pdfPageCount: 17,
        resolutionNumber: 'RM-123-2024-MINEDU',
        semanticScore: 0.9,
      }),
    ]);
    expect(rpc).toHaveBeenCalledWith(
      'search_document_chunks_with_consultation_context',
      expect.objectContaining({
        p_query_text: input.query,
        p_retrieval_scope: 'historical',
      }),
    );
  });

  it('A09 attaches only the request abort signal to the protected RPC', async () => {
    const cancellation = new AbortController();
    const request = Object.assign(
      Promise.resolve({ data: [row], error: null }),
      { abortSignal: jest.fn() },
    );
    request.abortSignal.mockReturnValue(request);
    const rpc = jest.fn().mockReturnValue(request);
    const gateway = new SupabaseRetrievalGatewayAdapter({
      rpc,
    } as unknown as SupabaseServerClient);

    await gateway.search({ ...input, abortSignal: cancellation.signal });

    expect(request.abortSignal).toHaveBeenCalledWith(cancellation.signal);
    expect(request.abortSignal).toHaveBeenCalledTimes(1);
  });

  it('A09 does not start a protected RPC for an already cancelled request', async () => {
    const cancellation = new AbortController();
    cancellation.abort();
    const rpc = jest.fn();
    const gateway = new SupabaseRetrievalGatewayAdapter({
      rpc,
    } as unknown as SupabaseServerClient);

    await expect(
      gateway.search({ ...input, abortSignal: cancellation.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('uses the exact-reference RPC without a semantic substitute', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [row], error: null });
    const gateway = new SupabaseRetrievalGatewayAdapter({
      rpc,
    } as unknown as SupabaseServerClient);

    await expect(
      gateway.searchExactReferences({
        embedding: input.embedding,
        matchCount: 10,
        query: 'resolución ministerial 123-2024-MINEDU',
        referenceKeys: ['1232024MINEDU'],
        retrievalScope: 'historical',
      }),
    ).resolves.toEqual([expect.objectContaining({ documentId: 'document' })]);
    expect(rpc).toHaveBeenCalledWith(
      'search_document_chunks_by_exact_references',
      expect.objectContaining({
        p_reference_keys: ['1232024MINEDU'],
        p_retrieval_scope: 'historical',
      }),
    );
  });

  describe('datedChunksOfVersions', () => {
    function tableClient(result: { data: unknown; error: unknown }) {
      const query = {
        eq: jest.fn(),
        filter: jest.fn(),
        limit: jest.fn().mockResolvedValue(result),
        order: jest.fn(),
        select: jest.fn(),
      };
      query.select.mockReturnValue(query);
      query.eq.mockReturnValue(query);
      query.filter.mockReturnValue(query);
      query.order.mockReturnValue(query);
      const from = jest.fn().mockReturnValue(query);
      return { from, query };
    }

    it('lee por versión solo los fragmentos con fechas, en orden', async () => {
      const { from, query } = tableClient({
        data: [
          {
            article_reference: null,
            chunk_content: 'CRONOGRAMA 13.01.2026 14.01.2026 15.01.2026',
            chunk_index: 4,
            document_version_id: 'version',
            id: 'chunk-4',
            numeral_reference: null,
            page_end: 4,
            page_start: 3,
            section_title: null,
          },
        ],
        error: null,
      });
      const gateway = new SupabaseRetrievalGatewayAdapter({
        from,
      } as unknown as SupabaseServerClient);

      await expect(
        gateway.datedChunksOfVersions({
          limitPerVersion: 30,
          versionIds: ['version', 'version'],
        }),
      ).resolves.toEqual([
        {
          articleReference: null,
          chunkContent: 'CRONOGRAMA 13.01.2026 14.01.2026 15.01.2026',
          chunkId: 'chunk-4',
          chunkIndex: 4,
          documentVersionId: 'version',
          numeralReference: null,
          pageEnd: 4,
          pageStart: 3,
          sectionTitle: null,
        },
      ]);
      // Una versión repetida se lee una sola vez.
      expect(from).toHaveBeenCalledTimes(1);
      expect(from).toHaveBeenCalledWith('document_chunks');
      expect(query.eq).toHaveBeenCalledWith('document_version_id', 'version');
      expect(query.filter).toHaveBeenCalledWith(
        'chunk_content',
        'imatch',
        expect.stringContaining('[0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{2,4}'),
      );
      expect(query.order).toHaveBeenCalledWith('chunk_index', {
        ascending: true,
      });
      expect(query.limit).toHaveBeenCalledWith(30);
    });

    it('oculta el error de la base detrás de un error de servicio', async () => {
      const { from } = tableClient({ data: null, error: { code: 'XX000' } });

      await expect(
        new SupabaseRetrievalGatewayAdapter({
          from,
        } as unknown as SupabaseServerClient).datedChunksOfVersions({
          limitPerVersion: 30,
          versionIds: ['version'],
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('falla cerrado sin cliente configurado', async () => {
      await expect(
        new SupabaseRetrievalGatewayAdapter(null).datedChunksOfVersions({
          limitPerVersion: 30,
          versionIds: ['version'],
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
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
