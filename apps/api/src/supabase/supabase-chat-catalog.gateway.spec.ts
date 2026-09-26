import { ServiceUnavailableException } from '@nestjs/common';
import { SupabaseChatCatalogGatewayAdapter } from './supabase-chat-catalog.gateway';
import type { SupabaseServerClient } from './supabase.server-client';

type Rows = Record<string, unknown>[];

/** Cliente mínimo: cada tabla responde sus filas sin importar los filtros. */
function fakeClient(tables: Record<string, Rows>, failing?: string) {
  return {
    from(table: string) {
      const result =
        failing === table
          ? { data: null, error: { message: 'down' } }
          : { data: tables[table] ?? [], error: null };
      const chain: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'not', 'order', 'limit', 'in']) {
        chain[method] = () => chain;
      }
      chain.then = (resolve: (value: unknown) => unknown) => resolve(result);
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
  document_versions: [{ id: 'v1' }, { id: 'v2' }],
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
        moduleNames: ['Cargos y plazas'],
        resolutionNumber: null,
        sectionTitles: ['Funciones', 'Perfil del cargo'],
        title: 'Ley A',
      },
    ]);
  });

  it('sin documentos no consulta el resto', async () => {
    const adapter = new SupabaseChatCatalogGatewayAdapter(
      fakeClient({ ...baseTables, documents: [] }),
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
      new SupabaseChatCatalogGatewayAdapter(null).listAvailableDocuments(),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
