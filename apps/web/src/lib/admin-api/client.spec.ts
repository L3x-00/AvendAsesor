import { describe, expect, it, vi } from 'vitest';
import { AdminApiClient, AdminApiError } from './client';

const moduleRecord = {
  code: 'NORMATIVA',
  createdAt: '2026-08-09T00:00:00.000Z',
  createdBy: null,
  deactivatedAt: null,
  deactivatedBy: null,
  deactivationReason: null,
  deletedAt: null,
  deletedBy: null,
  deletionReason: null,
  description: null,
  id: '2bd75b4c-6a27-460a-a16c-ebf0c3cdeac3',
  isActive: true,
  isDeleted: false,
  metadata: {},
  name: 'Normativa',
  parentModuleId: null,
  sortOrder: 0,
  updatedAt: '2026-08-09T00:00:00.000Z',
  updatedBy: null,
};

const documentRecord = {
  articleReference: null,
  createdAt: '2026-08-09T00:00:00.000Z',
  createdBy: null,
  currentVersionId: 'f84e1198-6c7d-4fa2-998e-2dced81389d8',
  deactivatedAt: null,
  deactivatedBy: null,
  deactivationReason: null,
  deletedAt: null,
  deletedBy: null,
  deletionReason: null,
  documentType: 'NORMATIVE',
  id: '680a1b3e-9a76-46b9-9130-7284e03aa123',
  isDeleted: false,
  issuanceYear: 2026,
  issuingEntity: 'AVEND',
  metadata: {},
  publicationStatus: 'active' as const,
  resolutionNumber: null,
  title: 'Norma de prueba',
  updatedAt: '2026-08-09T00:00:00.000Z',
  updatedBy: null,
};

const documentDetails = {
  ...documentRecord,
  moduleIds: [moduleRecord.id],
  versions: [
    {
      fileSizeBytes: 128,
      id: documentRecord.currentVersionId,
      originalFileName: 'norma.pdf',
      pageCount: 1,
      uploadedAt: '2026-08-09T00:00:00.000Z',
      uploadedBy: null,
      versionNumber: 1,
    },
  ],
};

function successfulJson(payload: unknown): Response {
  return {
    json: vi.fn(async () => payload),
    ok: true,
    status: 200,
  } as unknown as Response;
}

describe('AdminApiClient', () => {
  it('uses the server-only bearer token and a bounded module request without retrying', async () => {
    const request = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => successfulJson([moduleRecord]));
    const client = new AdminApiClient(
      'server-session-token',
      'http://localhost:3001',
      request,
    );

    await expect(client.listModules()).resolves.toEqual([moduleRecord]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      'http://localhost:3001/admin/modules?status=all',
      expect.objectContaining({
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer server-session-token',
        },
        method: 'GET',
      }),
    );
  });

  it('keeps multipart boundaries intact for an upload and never adds JSON content type', async () => {
    const request = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => successfulJson(moduleRecord));
    const client = new AdminApiClient(
      'server-session-token',
      'http://localhost:3001',
      request,
    );
    const payload = new FormData();
    payload.set('file', new File(['%PDF-1.7'], 'norma.pdf', { type: 'application/pdf' }));

    await expect(
      client.createDocument(payload),
    ).rejects.toThrow('Administrative API returned an invalid response.');
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[1]).toMatchObject({
      body: payload,
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer server-session-token',
      },
      method: 'POST',
    });
  });

  it('maps HTTP failures without consuming or relaying backend response text', async () => {
    const request = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => ({ ok: false, status: 503 }) as Response);
    const client = new AdminApiClient(
      'server-session-token',
      'http://localhost:3001',
      request,
    );

    await expect(client.listDocuments()).rejects.toEqual(
      new AdminApiError(503),
    );
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('maps each administrative resource operation to the protected backend contract', async () => {
    const request = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async (input) => {
      const url = String(input);

      if (url.endsWith('/download-url')) {
        return successfulJson({
          expiresAt: '2026-08-09T00:01:00.000Z',
          url: 'http://localhost:55321/storage/v1/object/sign/normative-documents/test',
          versionId: documentRecord.currentVersionId,
        });
      }

      if (url.includes('/documents/') && !url.endsWith('/versions')) {
        return successfulJson(documentDetails);
      }

      if (url.includes('/documents')) {
        return successfulJson(documentRecord);
      }

      return successfulJson(moduleRecord);
    });
    const client = new AdminApiClient(
      'server-session-token',
      'http://localhost:3001',
      request,
    );
    const pdf = new FormData();
    pdf.set('file', new File(['%PDF-1.7'], 'norma.pdf'));

    await client.addDocumentVersion(documentRecord.id, pdf);
    await client.createModule({ code: moduleRecord.code, name: moduleRecord.name });
    await client.deleteDocument(documentRecord.id, 'Retirado');
    await client.deleteModule(moduleRecord.id, 'Retirado');
    await expect(client.getDocument(documentRecord.id)).resolves.toEqual(
      documentDetails,
    );
    await expect(client.getDownloadUrl(documentRecord.id)).resolves.toMatchObject({
      versionId: documentRecord.currentVersionId,
    });
    await client.linkDocumentModule(documentRecord.id, moduleRecord.id);
    await client.setDocumentStatus(documentRecord.id, false, 'Revisión');
    await client.setModuleStatus(moduleRecord.id, false, 'Revisión');
    await client.unlinkDocumentModule(documentRecord.id, moduleRecord.id);
    await client.updateDocument(documentRecord.id, { title: 'Actualizado' });
    await client.updateModule(moduleRecord.id, { name: 'Actualizado' });

    expect(request).toHaveBeenCalledTimes(12);
    expect(request.mock.calls.map(([url]) => String(url))).toEqual(
      expect.arrayContaining([
        `http://localhost:3001/admin/documents/${documentRecord.id}/versions`,
        'http://localhost:3001/admin/modules',
        `http://localhost:3001/admin/documents/${documentRecord.id}`,
        `http://localhost:3001/admin/modules/${moduleRecord.id}`,
        `http://localhost:3001/admin/documents/${documentRecord.id}/download-url`,
      ]),
    );
  });

  it('fails closed when a successful response does not match the web contract', async () => {
    const request = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => successfulJson({ id: 'not-a-uuid' }));
    const client = new AdminApiClient(
      'server-session-token',
      'http://localhost:3001',
      request,
    );

    await expect(client.listModules()).rejects.toThrow(
      'Administrative API returned an invalid response.',
    );
  });
});
