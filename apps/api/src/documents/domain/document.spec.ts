import type { StoredDocumentVersion } from './document';
import { toDocumentLibraryRow, toManagedDocumentVersion } from './document';

const documentId = '411a0188-bb7c-4ef9-847d-8abf506e67c1';
const actorId = 'f4ca2c55-9eb1-48ae-9e96-1e4a8397d37c';
const versionId = '70fe3e8e-5a9d-4c7d-8a86-303b49e4c2d6';

const libraryRow = {
  article_reference: 'Art. 12',
  created_at: '2026-08-09T00:00:00.000Z',
  created_by: actorId,
  created_by_name: 'Administrador de prueba',
  current_version_id: versionId,
  current_version_ingestion_status: 'indexed',
  current_version_uploaded_at: '2026-08-09T00:00:00.000Z',
  document_type: 'LEY',
  id: documentId,
  issuance_year: 2026,
  issuing_entity: 'Minedu',
  metadata: { keywords: ['licencia', 'docente'] },
  module_associations: [
    {
      linked_module_id: 'f3fbec69-2b7f-4c9e-bddd-8c72c7a9cc51',
      linked_module_name: 'Nombramiento docente',
      module_id: '8d4b660b-9e94-4d34-a3d2-2548a83587e1',
      module_name: 'Evaluacion docente',
      submodule_id: 'f3fbec69-2b7f-4c9e-bddd-8c72c7a9cc51',
      submodule_name: 'Nombramiento docente',
    },
  ],
  publication_status: 'active',
  replacement_date: null,
  replacement_document_id: null,
  replacement_observation: null,
  replacement_reason: null,
  replacement_year: null,
  resolution_number: '29944',
  situation: 'current',
  title: 'Ley de Reforma Magisterial',
  total_count: '3',
  updated_at: '2026-08-10T00:00:00.000Z',
  updated_by: actorId,
};

describe('document library domain mapping', () => {
  it.each([
    ['indexed', 'ready'],
    ['pending', 'pending_approval'],
    ['processing', 'pending_approval'],
    ['failed', 'error'],
    [null, 'error'],
  ] as const)(
    'derives %s ingestion as %s without trusting client labels',
    (ingestionStatus, technicalStatus) => {
      const parsed = toDocumentLibraryRow({
        ...libraryRow,
        current_version_ingestion_status: ingestionStatus,
      });

      expect(parsed.total).toBe(3);
      expect(parsed.item).toMatchObject({
        moduleAssociations: [
          {
            linkedModuleName: 'Nombramiento docente',
            moduleName: 'Evaluacion docente',
            submoduleName: 'Nombramiento docente',
          },
        ],
        technicalStatus,
      });
    },
  );

  it('rejects malformed store rows instead of leaking partial library data', () => {
    expect(() =>
      toDocumentLibraryRow({ ...libraryRow, document_type: 'ley' }),
    ).toThrow('Document library data returned by the store is invalid.');
  });

  it('defaults a version actor name to null and accepts a resolved name', () => {
    const version: StoredDocumentVersion = {
      fileSizeBytes: 512,
      id: versionId,
      ingestionStatus: 'indexed',
      ingestionUpdatedAt: '2026-08-10T00:00:00.000Z',
      mimeType: 'application/pdf',
      originalFileName: 'ley.pdf',
      pageCount: 1,
      sha256: 'a'.repeat(64),
      storageBucket: 'normative-documents',
      storagePath: `documents/${documentId}/versions/${versionId}.pdf`,
      uploadedAt: '2026-08-09T00:00:00.000Z',
      uploadedBy: actorId,
      uploadedByName: null,
      versionNumber: 1,
    };

    expect(toManagedDocumentVersion(version).uploadedByName).toBeNull();
    expect(
      toManagedDocumentVersion(version, 'Administrador de prueba')
        .uploadedByName,
    ).toBe('Administrador de prueba');
  });
});
