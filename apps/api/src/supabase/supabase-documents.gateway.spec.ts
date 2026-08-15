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
  resolution_number: null,
  title: 'Documento de prueba',
  updated_at: '2026-08-09T00:00:00+00:00',
  updated_by: '4814398e-8d0a-49a0-ac18-4fa3cffb063f',
};

const versionRow = {
  document_id: documentRow.id,
  file_size_bytes: 512,
  id: documentRow.current_version_id,
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
    maybeSingle: jest.fn(),
    order: jest.fn(),
    range: jest.fn(),
    select: jest.fn(),
  };

  builder.eq.mockReturnValue(builder);
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
          'create_document_with_initial_version',
          expect.objectContaining({
            p_document_id: documentRow.id,
            p_metadata: { scope: 'local' },
            p_version_id: versionRow.id,
          }),
        ],
        [
          'add_document_version',
          expect.objectContaining({ p_document_id: documentRow.id }),
        ],
      ]),
    );
  });

  it.each([
    ['P0002', NotFoundException],
    ['22023', BadRequestException],
    ['23503', ConflictException],
    ['23505', ConflictException],
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

    builder.data = versionRow;
    await expect(
      gateway.findVersion(documentRow.id, versionRow.id),
    ).resolves.toMatchObject({ storagePath: versionRow.storage_path });
    builder.data = [versionRow];
    await expect(gateway.listVersions(documentRow.id)).resolves.toHaveLength(1);

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
});
