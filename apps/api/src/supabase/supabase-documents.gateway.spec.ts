import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SupabaseDocumentsGatewayAdapter } from './supabase-documents.gateway';
import type { SupabaseServerClient } from './supabase.server-client';

const documentRow = {
  article_reference: null,
  created_at: '2026-08-09T00:00:00+00:00',
  created_by: '4814398e-8d0a-49a0-ac18-4fa3cffb063f',
  current_version_id: '6db238dd-384d-4205-8d15-913f6b60b90f',
  deactivated_at: null,
  deactivated_by: null,
  deactivation_reason: null,
  deleted_at: null,
  deleted_by: null,
  deletion_reason: null,
  document_type: 'NORMATIVE',
  id: 'fe8f5b8f-7ec8-4f88-8d3e-0b8fbc5551f1',
  is_deleted: false,
  issuance_year: 2026,
  issuing_entity: 'AVEND',
  metadata: { scope: 'local' },
  publication_status: 'active' as const,
  replacement_date: null,
  replacement_document_id: null,
  replacement_observation: null,
  replacement_reason: null,
  replacement_year: null,
  resolution_number: null,
  situation: 'current' as const,
  title: 'Documento de prueba',
  updated_at: '2026-08-09T00:00:00+00:00',
  updated_by: '4814398e-8d0a-49a0-ac18-4fa3cffb063f',
};

const versionRow = {
  document_id: documentRow.id,
  file_size_bytes: 512,
  id: documentRow.current_version_id,
  ingestion_status: 'indexed' as const,
  ingestion_updated_at: '2026-08-10T00:00:00+00:00',
  mime_type: 'application/pdf' as const,
  original_file_name: 'documento.pdf',
  page_count: 1,
  sha256: 'a'.repeat(64),
  storage_bucket: 'normative-documents' as const,
  storage_path: `documents/${documentRow.id}/versions/${documentRow.current_version_id}.pdf`,
  uploaded_at: '2026-08-09T00:00:00+00:00',
  uploaded_by: documentRow.created_by,
  version_number: 1,
};

function postgrestError(code: string) {
  return { code, details: '', hint: '', message: 'database error' };
}

function createBuilder(result: { data?: unknown; error?: unknown }) {
  const builder = {
    data: result.data ?? null,
    error: result.error ?? null,
    eq: jest.fn(),
    in: jest.fn(),
    maybeSingle: jest.fn(),
    order: jest.fn(),
    range: jest.fn(),
    select: jest.fn(),
  };

  builder.eq.mockReturnValue(builder);
  builder.in.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.range.mockImplementation(() =>
    Promise.resolve({ data: builder.data, error: builder.error }),
  );
  builder.select.mockReturnValue(builder);
  builder.maybeSingle.mockImplementation(() =>
    Promise.resolve({ data: builder.data, error: builder.error }),
  );

  return builder;
}

function createClient(options: {
  data?: unknown;
  error?: unknown;
  rpcData?: unknown;
  rpcError?: unknown;
  signedUrl?: string | null;
  storageError?: { message?: string } | null;
}) {
  const builder = createBuilder({ data: options.data, error: options.error });
  const rpc = jest.fn().mockResolvedValue({
    data: options.rpcData ?? documentRow,
    error: options.rpcError ?? null,
  });
  const storageBucket = {
    createSignedUrl: jest.fn().mockResolvedValue({
      data:
        options.signedUrl === undefined
          ? { signedUrl: 'http://signed.local/test' }
          : { signedUrl: options.signedUrl },
      error: options.storageError ?? null,
    }),
    remove: jest
      .fn()
      .mockResolvedValue({ error: options.storageError ?? null }),
    upload: jest
      .fn()
      .mockResolvedValue({ error: options.storageError ?? null }),
  };
  const storage = {
    from: jest.fn().mockReturnValue(storageBucket),
  };
  const from = jest.fn().mockReturnValue(builder);

  return {
    builder,
    client: { from, rpc, storage } as unknown as SupabaseServerClient,
    from,
    rpc,
    storage,
    storageBucket,
  };
}

describe('SupabaseDocumentsGatewayAdapter', () => {
  it('fails closed when its server-only client is unavailable', async () => {
    const gateway = new SupabaseDocumentsGatewayAdapter(null);

    await expect(gateway.findById(documentRow.id)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('creates and versions documents through typed server-only RPC calls', async () => {
    const { client, rpc } = createClient({ rpcData: documentRow });
    const gateway = new SupabaseDocumentsGatewayAdapter(client);

    await expect(
      gateway.create({
        actorId: documentRow.created_by,
        documentId: documentRow.id,
        documentType: documentRow.document_type,
        fileSizeBytes: 512,
        metadata: { scope: 'local' },
        moduleIds: [],
        originalFileName: 'documento.pdf',
        pageCount: 1,
        sha256: 'a'.repeat(64),
        situation: 'current',
        storagePath: versionRow.storage_path,
        title: documentRow.title,
        versionId: versionRow.id,
      }),
    ).resolves.toMatchObject({ id: documentRow.id });
    await expect(
      gateway.addVersion({
        actorId: documentRow.created_by,
        documentId: documentRow.id,
        fileSizeBytes: 512,
        originalFileName: 'documento-v2.pdf',
        pageCount: 1,
        sha256: 'b'.repeat(64),
        storagePath: 'documents/test/v2.pdf',
        versionId: '16de7cb1-00df-41f3-b22a-f63e98488169',
      }),
    ).resolves.toMatchObject({ id: documentRow.id });

    expect(rpc.mock.calls).toEqual(
      expect.arrayContaining([
        [
          'create_governed_document_with_initial_version',
          expect.objectContaining({
            p_document_id: documentRow.id,
            p_metadata: { scope: 'local' },
            p_version_id: versionRow.id,
          }),
        ],
        [
          'add_governed_document_version',
          expect.objectContaining({ p_document_id: documentRow.id }),
        ],
      ]),
    );
  });

  it.each([
    ['P0002', NotFoundException],
    ['PGRST116', NotFoundException],
    ['22023', BadRequestException],
    ['23514', BadRequestException],
    ['23503', ConflictException],
    ['23505', ConflictException],
    ['P0001', ConflictException],
    ['XX000', ServiceUnavailableException],
  ])('maps document database error %s safely', async (code, errorType) => {
    const { client } = createClient({ rpcError: postgrestError(code) });
    const gateway = new SupabaseDocumentsGatewayAdapter(client);

    await expect(
      gateway.logicalDelete(
        documentRow.id,
        'Documento retirado',
        documentRow.created_by,
      ),
    ).rejects.toBeInstanceOf(errorType);
  });

  it('maps live document, version and module relation reads without exposing storage in document rows', async () => {
    const { builder, client, from } = createClient({ data: documentRow });
    const gateway = new SupabaseDocumentsGatewayAdapter(client);

    await expect(gateway.findById(documentRow.id)).resolves.toMatchObject({
      id: documentRow.id,
    });
    builder.data = [documentRow];
    await expect(
      gateway.list({ limit: 25, offset: 0, status: 'active' }),
    ).resolves.toHaveLength(1);
    expect(builder.order.mock.calls.slice(0, 3)).toEqual([
      ['updated_at', { ascending: false }],
      ['title', { ascending: true }],
      ['id', { ascending: true }],
    ]);

    builder.data = versionRow;
    await expect(
      gateway.findVersion(documentRow.id, versionRow.id),
    ).resolves.toMatchObject({
      ingestionStatus: versionRow.ingestion_status,
      ingestionUpdatedAt: versionRow.ingestion_updated_at,
      storagePath: versionRow.storage_path,
    });
    builder.data = [versionRow];
    await expect(gateway.listVersions(documentRow.id)).resolves.toEqual([
      expect.objectContaining({
        ingestionStatus: versionRow.ingestion_status,
        ingestionUpdatedAt: versionRow.ingestion_updated_at,
      }),
    ]);
    expect(builder.select).toHaveBeenCalledWith(
      expect.stringContaining('ingestion_status,ingestion_updated_at'),
    );

    builder.data = [{ module_id: 'f3fbec69-2b7f-4c9e-bddd-8c72c7a9cc51' }];
    await expect(gateway.listModuleIds(documentRow.id)).resolves.toEqual([
      'f3fbec69-2b7f-4c9e-bddd-8c72c7a9cc51',
    ]);

    expect(from.mock.calls).toEqual(
      expect.arrayContaining([
        ['documents'],
        ['document_versions'],
        ['document_modules'],
      ]),
    );
  });

  it('returns null for absent direct reads and rejects malformed stored records', async () => {
    const { builder, client } = createClient({ data: null });
    const gateway = new SupabaseDocumentsGatewayAdapter(client);

    await expect(gateway.findById(documentRow.id)).resolves.toBeNull();
    await expect(
      gateway.findVersion(documentRow.id, versionRow.id),
    ).resolves.toBeNull();

    builder.data = { ...documentRow, document_type: 'invalid type' };
    await expect(gateway.findById(documentRow.id)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );

    builder.data = { ...versionRow, ingestion_status: 'unknown' };
    await expect(
      gateway.findVersion(documentRow.id, versionRow.id),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('runs metadata, status, module link and download-audit operations only through restricted RPCs', async () => {
    const { client, rpc } = createClient({ rpcData: documentRow });
    const gateway = new SupabaseDocumentsGatewayAdapter(client);

    await expect(
      gateway.updateMetadata(
        documentRow.id,
        { title: 'Documento actualizado' },
        documentRow.created_by,
      ),
    ).resolves.toMatchObject({ title: documentRow.title });
    await expect(
      gateway.setStatus(
        documentRow.id,
        false,
        'Revisión normativa',
        documentRow.created_by,
      ),
    ).resolves.toMatchObject({ id: documentRow.id });
    await expect(
      gateway.setSituation(documentRow.id, 'replaced', documentRow.created_by, {
        reason: 'Nueva norma aplicable',
        replacementYear: 2026,
      }),
    ).resolves.toMatchObject({ id: documentRow.id });
    await gateway.linkModule(
      documentRow.id,
      'f3fbec69-2b7f-4c9e-bddd-8c72c7a9cc51',
      documentRow.created_by,
    );
    await gateway.unlinkModule(
      documentRow.id,
      'f3fbec69-2b7f-4c9e-bddd-8c72c7a9cc51',
      documentRow.created_by,
    );
    await gateway.recordDownloadUrl(
      documentRow.id,
      versionRow.id,
      documentRow.created_by,
    );

    expect(rpc).toHaveBeenCalledWith(
      'update_document_metadata',
      expect.objectContaining({ p_document_id: documentRow.id }),
    );
    expect(rpc).toHaveBeenCalledWith(
      'set_document_publication_status',
      expect.objectContaining({ p_document_id: documentRow.id }),
    );
    expect(rpc).toHaveBeenCalledWith(
      'set_governed_document_situation',
      expect.objectContaining({
        p_document_id: documentRow.id,
        p_replacement_year: 2026,
        p_situation: 'replaced',
      }),
    );
    expect(rpc).toHaveBeenCalledWith(
      'link_document_module',
      expect.objectContaining({ p_document_id: documentRow.id }),
    );
    expect(rpc).toHaveBeenCalledWith(
      'unlink_document_module',
      expect.objectContaining({ p_document_id: documentRow.id }),
    );
    expect(rpc).toHaveBeenCalledWith(
      'record_document_download_url',
      expect.objectContaining({ p_document_version_id: versionRow.id }),
    );
  });

  it('uses private Storage with non-overwrite upload, short-lived signing and removable compensation', async () => {
    const { client, storage, storageBucket } = createClient({});
    const gateway = new SupabaseDocumentsGatewayAdapter(client);

    await gateway.uploadPdf(versionRow.storage_path, Buffer.from('%PDF-1.7'));
    await expect(
      gateway.createDownloadUrl(versionRow.storage_path, 60),
    ).resolves.toBe('http://signed.local/test');
    await expect(gateway.removePdf(versionRow.storage_path)).resolves.toBe(
      true,
    );

    expect(storage.from).toHaveBeenCalledWith('normative-documents');
    expect(storageBucket.upload).toHaveBeenCalledWith(
      versionRow.storage_path,
      expect.any(Buffer),
      expect.objectContaining({
        contentType: 'application/pdf',
        upsert: false,
      }),
    );
    expect(storageBucket.createSignedUrl).toHaveBeenCalledWith(
      versionRow.storage_path,
      60,
      {
        download: true,
      },
    );
    expect(storageBucket.remove).toHaveBeenCalledWith([
      versionRow.storage_path,
    ]);

    await gateway.createDownloadUrl(versionRow.storage_path, 60, 'inline');
    expect(storageBucket.createSignedUrl).toHaveBeenLastCalledWith(
      versionRow.storage_path,
      60,
    );
  });

  it('maps the enriched document library and resolves only requested actor names', async () => {
    const associationId = 'f3fbec69-2b7f-4c9e-bddd-8c72c7a9cc51';
    const libraryRow = {
      article_reference: null,
      created_at: documentRow.created_at,
      created_by: documentRow.created_by,
      created_by_name: 'Administrador de prueba',
      current_version_id: documentRow.current_version_id,
      current_version_ingestion_status: 'indexed',
      current_version_uploaded_at: versionRow.uploaded_at,
      document_type: documentRow.document_type,
      id: documentRow.id,
      issuance_year: documentRow.issuance_year,
      issuing_entity: documentRow.issuing_entity,
      metadata: documentRow.metadata,
      module_associations: [
        {
          linked_module_id: associationId,
          linked_module_name: 'Nombramiento docente',
          module_id: associationId,
          module_name: 'Evaluación docente',
          submodule_id: null,
          submodule_name: null,
        },
      ],
      publication_status: documentRow.publication_status,
      replacement_date: null,
      replacement_document_id: null,
      replacement_observation: null,
      replacement_reason: null,
      replacement_year: null,
      resolution_number: null,
      situation: 'current',
      title: documentRow.title,
      total_count: 3,
      updated_at: documentRow.updated_at,
      updated_by: documentRow.updated_by,
    };
    const { builder, client, rpc } = createClient({
      data: [
        { full_name: 'Administrador de prueba', id: documentRow.created_by },
      ],
      rpcData: [libraryRow],
    });
    const gateway = new SupabaseDocumentsGatewayAdapter(client);

    await expect(
      gateway.listLibrary({ limit: 25, offset: 0, sort: 'newest' }),
    ).resolves.toMatchObject({
      items: [
        expect.objectContaining({
          technicalStatus: 'ready',
          title: documentRow.title,
        }),
      ],
      total: 3,
    });
    await expect(
      gateway.listActorNames([documentRow.created_by]),
    ).resolves.toEqual({
      [documentRow.created_by]: 'Administrador de prueba',
    });

    expect(rpc).toHaveBeenCalledWith(
      'list_document_library',
      expect.objectContaining({ p_limit: 25, p_sort: 'newest' }),
    );
    expect(builder.in).toHaveBeenCalledWith('id', [documentRow.created_by]);
  });

  it('fails safely on Storage errors and failed signed URL generation', async () => {
    const { client } = createClient({
      signedUrl: null,
      storageError: { message: 'storage unavailable' },
    });
    const gateway = new SupabaseDocumentsGatewayAdapter(client);

    await expect(
      gateway.uploadPdf(versionRow.storage_path, Buffer.from('%PDF-1.7')),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      gateway.createDownloadUrl(versionRow.storage_path, 60),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(gateway.removePdf(versionRow.storage_path)).resolves.toBe(
      false,
    );
  });

  it('preserves ranked frequent values and rejects invalid suggestion responses', async () => {
    const values = {
      additionalDetails: ['Oficina recurrente', 'Oficina menos frecuente'],
      specificDependencies: ['DIGEDD', 'UGEL 05'],
    };
    const { client, rpc } = createClient({ rpcData: values });
    const gateway = new SupabaseDocumentsGatewayAdapter(client);
    await expect(gateway.listSuggestions()).resolves.toEqual(values);
    expect(rpc).toHaveBeenCalledWith('list_document_value_suggestions');

    for (const data of [
      null,
      [],
      'invalid',
      {},
      { additionalDetails: [42], specificDependencies: [] },
      { additionalDetails: [], specificDependencies: null },
      { additionalDetails: [], specificDependencies: [false] },
    ]) {
      rpc.mockResolvedValueOnce({ data, error: null });
      await expect(gateway.listSuggestions()).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    }
    rpc.mockResolvedValueOnce({ data: null, error: postgrestError('XX000') });
    await expect(gateway.listSuggestions()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('returns only the requested document audit trail in reverse chronological order', async () => {
    const event = {
      id: '2e1460a0-e290-4c6e-9a0b-f122996ab006',
      document_id: documentRow.id,
      document_version_id: versionRow.id,
      action: 'document_archived',
      details: { archiveReasonCode: 'DUPLICATE' },
      occurred_at: documentRow.updated_at,
      actor_id: documentRow.created_by,
    };
    const { builder, client, from } = createClient({ data: [event] });
    const gateway = new SupabaseDocumentsGatewayAdapter(client);
    await expect(gateway.listAuditEvents(documentRow.id)).resolves.toEqual([
      {
        id: event.id,
        versionId: versionRow.id,
        action: event.action,
        details: event.details,
        occurredAt: event.occurred_at,
        actorId: event.actor_id,
      },
    ]);
    expect(from).toHaveBeenCalledWith('document_audit_events');
    expect(builder.eq).toHaveBeenCalledWith('document_id', documentRow.id);
    expect(builder.order.mock.calls).toEqual([
      ['occurred_at', { ascending: false }],
      ['id', { ascending: false }],
    ]);
    builder.data = null;
    await expect(gateway.listAuditEvents(documentRow.id)).resolves.toEqual([]);
    builder.data = [{ ...event, action: '' }];
    await expect(
      gateway.listAuditEvents(documentRow.id),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('forwards every library filter and handles an empty or invalid page safely', async () => {
    const { client, rpc } = createClient({});
    rpc.mockResolvedValue({ data: null, error: null });
    const gateway = new SupabaseDocumentsGatewayAdapter(client);
    const options = {
      limit: 10,
      offset: 20,
      sort: 'year' as const,
      q: 'nombramiento',
      documentType: 'LEY',
      issuanceYear: 2009,
      issuingEntity: 'MINEDU',
      situation: 'archived' as const,
      technicalStatus: 'pending_approval' as const,
      moduleId: documentRow.id,
      submoduleId: versionRow.id,
    };
    await expect(gateway.listLibrary(options)).resolves.toEqual({
      items: [],
      limit: 10,
      offset: 20,
      total: 0,
    });
    expect(rpc).toHaveBeenCalledWith('list_document_library', {
      p_limit: 10,
      p_offset: 20,
      p_sort: 'year',
      p_query: 'nombramiento',
      p_document_type: 'LEY',
      p_issuance_year: 2009,
      p_issuing_entity: 'MINEDU',
      p_situation: 'archived',
      p_technical_status: 'pending_approval',
      p_module_id: documentRow.id,
      p_submodule_id: versionRow.id,
    });
    rpc.mockResolvedValue({ data: [{ id: 'invalid' }], error: null });
    await expect(gateway.listLibrary(options)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it('keeps empty reads empty and avoids a profile query when no actors are requested', async () => {
    const { client, builder, from } = createClient({ data: null });
    const gateway = new SupabaseDocumentsGatewayAdapter(client);
    await expect(gateway.listActorNames([])).resolves.toEqual({});
    expect(from).not.toHaveBeenCalled();
    await expect(
      gateway.listActorNames([documentRow.created_by]),
    ).resolves.toEqual({});
    await expect(
      gateway.list({ limit: 25, offset: 0, status: 'all' }),
    ).resolves.toEqual([]);
    expect(builder.eq).not.toHaveBeenCalledWith(
      'publication_status',
      expect.anything(),
    );
    await expect(gateway.listVersions(documentRow.id)).resolves.toEqual([]);
    await expect(gateway.listModuleIds(documentRow.id)).resolves.toEqual([]);
  });

  it('persists explicit approval and archive reasons without requiring a replacement for duplicate documents', async () => {
    const { client, rpc } = createClient({});
    const gateway = new SupabaseDocumentsGatewayAdapter(client);
    await expect(
      gateway.setTechnicalStatus(
        documentRow.id,
        'ready',
        documentRow.created_by,
      ),
    ).resolves.toMatchObject({ id: documentRow.id });
    expect(rpc).toHaveBeenLastCalledWith('set_document_technical_status', {
      p_actor_id: documentRow.created_by,
      p_document_id: documentRow.id,
      p_technical_status: 'ready',
    });
    await gateway.setSituation(
      documentRow.id,
      'archived',
      documentRow.created_by,
      {
        archiveReasonCode: 'DUPLICATE',
        archiveReasonDetail: 'Duplicado verificado',
        observation: 'Conservar historial',
      },
    );
    expect(rpc).toHaveBeenLastCalledWith('set_governed_document_situation', {
      p_actor_id: documentRow.created_by,
      p_document_id: documentRow.id,
      p_situation: 'archived',
      p_archive_reason_code: 'DUPLICATE',
      p_archive_reason_detail: 'Duplicado verificado',
      p_observation: 'Conservar historial',
      p_reason: null,
      p_replacement_date: null,
      p_replacement_document_id: null,
      p_replacement_year: null,
    });
    await gateway.setSituation(
      documentRow.id,
      'replaced',
      documentRow.created_by,
      {
        reason: 'Sustituido por norma nueva',
        replacementDate: '2026-09-05',
        replacementDocumentId: versionRow.id,
        replacementYear: 2026,
      },
    );
    expect(rpc).toHaveBeenLastCalledWith(
      'set_governed_document_situation',
      expect.objectContaining({
        p_replacement_date: '2026-09-05',
        p_replacement_document_id: versionRow.id,
        p_replacement_year: 2026,
      }),
    );
    await gateway.setStatus(
      documentRow.id,
      true,
      undefined,
      documentRow.created_by,
    );
    expect(rpc).toHaveBeenLastCalledWith(
      'set_document_publication_status',
      expect.objectContaining({ p_reason: null }),
    );
  });

  it('does not claim lifecycle, relation, read or approval success after a database failure', async () => {
    const { client } = createClient({
      error: postgrestError('XX000'),
      rpcError: postgrestError('XX000'),
    });
    const gateway = new SupabaseDocumentsGatewayAdapter(client);
    const operations: Array<() => Promise<unknown>> = [
      () => gateway.findById(documentRow.id),
      () => gateway.findVersion(documentRow.id, versionRow.id),
      () => gateway.list({ limit: 25, offset: 0, status: 'all' }),
      () => gateway.listVersions(documentRow.id),
      () => gateway.listModuleIds(documentRow.id),
      () => gateway.listActorNames([documentRow.created_by]),
      () => gateway.listAuditEvents(documentRow.id),
      () => gateway.listLibrary({ limit: 25, offset: 0, sort: 'newest' }),
      () =>
        gateway.linkModule(
          documentRow.id,
          versionRow.id,
          documentRow.created_by,
        ),
      () =>
        gateway.unlinkModule(
          documentRow.id,
          versionRow.id,
          documentRow.created_by,
        ),
      () =>
        gateway.recordDownloadUrl(
          documentRow.id,
          versionRow.id,
          documentRow.created_by,
        ),
      () =>
        gateway.updateMetadata(
          documentRow.id,
          { title: 'No debe guardarse' },
          documentRow.created_by,
        ),
      () =>
        gateway.setStatus(
          documentRow.id,
          true,
          undefined,
          documentRow.created_by,
        ),
      () =>
        gateway.setSituation(
          documentRow.id,
          'archived',
          documentRow.created_by,
          { archiveReasonCode: 'DUPLICATE' },
        ),
      () =>
        gateway.setTechnicalStatus(
          documentRow.id,
          'ready',
          documentRow.created_by,
        ),
    ];
    for (const operation of operations) {
      await expect(operation()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    }
  });

  it('distinguishes duplicate immutable files from a missing signed URL', async () => {
    const { client, storageBucket } = createClient({
      storageError: { message: 'The resource already exists' },
    });
    const gateway = new SupabaseDocumentsGatewayAdapter(client);
    await expect(
      gateway.uploadPdf(versionRow.storage_path, Buffer.from('%PDF-1.7')),
    ).rejects.toBeInstanceOf(ConflictException);
    storageBucket.createSignedUrl.mockResolvedValue({
      data: null,
      error: null,
    });
    await expect(
      gateway.createDownloadUrl(versionRow.storage_path, 60),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
