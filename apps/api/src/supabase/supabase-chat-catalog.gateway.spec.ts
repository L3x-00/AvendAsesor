import { ServiceUnavailableException } from '@nestjs/common';
import { SupabaseChatCatalogGatewayAdapter } from './supabase-chat-catalog.gateway';
import type { SupabaseServerClient } from './supabase.server-client';

type Rows = Record<string, unknown>[];
type QueryCall = { args: unknown[]; method: string; table: string };

/** Cliente mínimo: cada tabla responde sus filas sin importar los filtros. */
function fakeClient(
  tables: Record<string, Rows>,
  failing?: string,
  calls: QueryCall[] = [],
) {
  return {
    from(table: string) {
      let selectedRange: [number, number] | null = null;
      const chain: Record<string, unknown> = {};
      for (const method of [
        'select',
        'eq',
        'is',
        'not',
        'order',
        'range',
        'limit',
        'in',
      ]) {
        chain[method] = (...args: unknown[]) => {
          calls.push({ args, method, table });
          if (method === 'range') {
            selectedRange = [args[0] as number, args[1] as number];
          }
          return chain;
        };
      }
      chain.then = (resolve: (value: unknown) => unknown) => {
        if (failing === table) {
          return resolve({ data: null, error: { message: 'down' } });
        }
        const rows = tables[table] ?? [];
        const data = selectedRange
          ? rows.slice(selectedRange[0], selectedRange[1] + 1)
          : rows;
        return resolve({ data, error: null });
      };
      return chain;
    },
  } as unknown as SupabaseServerClient;
}

const baseTables: Record<string, Rows> = {
  document_chunks: [
    { document_id: 'd1', section_title: 'Funciones' },
    { document_id: 'd1', section_title: 'Funciones' },
    { document_id: 'd1', section_title: 'Perfil del cargo' },
  ],
  document_modules: [
    { document_id: 'd1', module_id: 'sub' },
    { document_id: 'd2', module_id: 'inactive' },
    { document_id: 'd3', module_id: 'root' },
    { document_id: 'demo', module_id: 'root' },
  ],
  document_versions: [
    {
      id: 'v1',
      mime_type: 'application/pdf',
      original_file_name: 'ley-a.pdf',
      page_count: 12,
    },
    {
      id: 'v2',
      mime_type: 'application/pdf',
      original_file_name: 'ley-b.pdf',
      page_count: 8,
    },
  ],
  documents: [
    {
      approved_version_id: 'v1',
      document_type: 'LEY',
      id: 'd1',
      issuance_year: 2012,
      metadata: {},
      resolution_number: null,
      title: 'Ley A',
    },
    {
      approved_version_id: 'v2',
      document_type: 'LEY',
      id: 'd2',
      issuance_year: null,
      metadata: {},
      resolution_number: null,
      title: 'Ley B',
    },
    {
      approved_version_id: 'v3',
      document_type: 'LEY',
      id: 'd3',
      issuance_year: null,
      metadata: {},
      resolution_number: null,
      title: 'Ley C (sin indexar)',
    },
    {
      approved_version_id: 'v1',
      document_type: 'LEY',
      id: 'demo',
      issuance_year: null,
      metadata: { demoSeed: true },
      resolution_number: null,
      title: 'Demo',
    },
  ],
  modules: [
    {
      id: 'root',
      is_active: true,
      is_deleted: false,
      name: 'Cargos y plazas',
      parent_module_id: null,
      sort_order: 0,
    },
    {
      id: 'sub',
      is_active: true,
      is_deleted: false,
      name: 'Coordinadores',
      parent_module_id: 'root',
      sort_order: 0,
    },
    {
      id: 'inactive',
      is_active: false,
      is_deleted: false,
      name: 'Apagado',
      parent_module_id: null,
      sort_order: 1,
    },
  ],
};

describe('SupabaseChatCatalogGatewayAdapter', () => {
  it('ofrece solo lo que el RAG puede citar: indexado, no demo y en un módulo activo', async () => {
    const adapter = new SupabaseChatCatalogGatewayAdapter(
      fakeClient(baseTables),
    );

    await expect(adapter.listAvailableDocuments()).resolves.toEqual([
      {
        documentType: 'LEY',
        id: 'd1',
        issuanceYear: 2012,
        mimeType: 'application/pdf',
        moduleIds: ['sub', 'root'],
        moduleNames: ['Cargos y plazas'],
        originalFileName: 'ley-a.pdf',
        pageCount: 12,
        resolutionNumber: null,
        sectionTitles: ['Funciones', 'Perfil del cargo'],
        title: 'Ley A',
        versionId: 'v1',
      },
    ]);
  });

  it('pagina más de cien documentos homónimos con orden estable y sin corte silencioso', async () => {
    const calls: QueryCall[] = [];
    const documents = Array.from({ length: 520 }, (_, index) => ({
      approved_version_id: `v${index}`,
      document_type: 'LEY',
      id: `d${String(index).padStart(3, '0')}`,
      issuance_year: 2026,
      metadata: {},
      resolution_number: null,
      title: 'Documento homónimo',
    }));
    const adapter = new SupabaseChatCatalogGatewayAdapter(
      fakeClient(
        {
          document_chunks: [],
          document_modules: documents.map((document) => ({
            document_id: document.id,
            module_id: 'root',
          })),
          document_versions: documents.map((document) => ({
            id: document.approved_version_id,
            mime_type: 'application/pdf',
            original_file_name: `${document.id}.pdf`,
            page_count: 1,
          })),
          documents,
          modules: [baseTables.modules[0]],
        },
        undefined,
        calls,
      ),
    );

    const result = await adapter.listAvailableDocuments();

    expect(result).toHaveLength(520);
    expect(new Set(result.map((document) => document.id)).size).toBe(520);
    expect(
      calls.filter(
        (call) => call.table === 'documents' && call.method === 'range',
      ),
    ).toEqual([
      { args: [0, 99], method: 'range', table: 'documents' },
      { args: [100, 199], method: 'range', table: 'documents' },
      { args: [200, 299], method: 'range', table: 'documents' },
      { args: [300, 399], method: 'range', table: 'documents' },
      { args: [400, 499], method: 'range', table: 'documents' },
      { args: [500, 599], method: 'range', table: 'documents' },
    ]);
    expect(
      calls.filter(
        (call) => call.table === 'documents' && call.method === 'order',
      ),
    ).toEqual(
      expect.arrayContaining([
        {
          args: ['title', { ascending: true }],
          method: 'order',
          table: 'documents',
        },
        {
          args: ['id', { ascending: true }],
          method: 'order',
          table: 'documents',
        },
      ]),
    );
    expect(
      calls.filter(
        (call) => call.table === 'document_modules' && call.method === 'range',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('lee el inicio del texto indexado para resumir el documento', async () => {
    const adapter = new SupabaseChatCatalogGatewayAdapter(
      fakeClient({
        ...baseTables,
        document_chunks: [
          { chunk_content: '  Artículo 1. Aprobar.  ' },
          { chunk_content: 'Artículo 2. Encargar.' },
        ],
      }),
    );

    await expect(adapter.getOpeningText('v1')).resolves.toBe(
      'Artículo 1. Aprobar.\n\nArtículo 2. Encargar.',
    );
    await expect(
      new SupabaseChatCatalogGatewayAdapter(
        fakeClient(baseTables, 'document_chunks'),
      ).getOpeningText('v1'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      new SupabaseChatCatalogGatewayAdapter(
        fakeClient({ ...baseTables, document_chunks: null as never }),
      ).getOpeningText('v1'),
    ).resolves.toBe('');
  });

  it('sin documentos no consulta el resto', async () => {
    const adapter = new SupabaseChatCatalogGatewayAdapter(
      fakeClient({ ...baseTables, documents: [] }),
    );

    await expect(adapter.listAvailableDocuments()).resolves.toEqual([]);
  });

  it('sin documentos citables no busca secciones', async () => {
    const adapter = new SupabaseChatCatalogGatewayAdapter(
      fakeClient({ ...baseTables, document_versions: [] }, 'document_chunks'),
    );

    await expect(adapter.listAvailableDocuments()).resolves.toEqual([]);
  });

  it('informa de forma controlada si la base no responde o no está configurada', async () => {
    await expect(
      new SupabaseChatCatalogGatewayAdapter(
        fakeClient(baseTables, 'document_versions'),
      ).listAvailableDocuments(),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      new SupabaseChatCatalogGatewayAdapter(
        fakeClient(baseTables, 'document_chunks'),
      ).listAvailableDocuments(),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      new SupabaseChatCatalogGatewayAdapter(null).listAvailableDocuments(),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
