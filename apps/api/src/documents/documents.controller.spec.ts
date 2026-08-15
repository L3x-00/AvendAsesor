/* eslint-disable @typescript-eslint/unbound-method */
import type { AuthorizationContext } from '../authorization';
import type {
  ManagedDocument,
  ManagedDocumentDetails,
} from './domain/document';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

const authorization: AuthorizationContext = {
  email: 'admin@example.com',
  emailConfirmedAt: '2026-08-09T00:00:00.000Z',
  role: 'admin',
  userId: 'bd7d9a57-c8e3-46f6-8b8a-1ee4e7110946',
};

const documentRecord: ManagedDocument = {
  articleReference: null,
  createdAt: '2026-08-09T00:00:00.000Z',
  createdBy: authorization.userId,
  currentVersionId: 'c060c51d-b347-4d4e-8f3b-ddd5b92bd6fe',
  deactivatedAt: null,
  deactivatedBy: null,
  deactivationReason: null,
  deletedAt: null,
  deletedBy: null,
  deletionReason: null,
  documentType: 'NORMATIVE',
  id: 'f1053902-6af8-46bd-87b3-eb6a8bf6fc2e',
  isDeleted: false,
  issuanceYear: null,
  issuingEntity: null,
  metadata: {},
  publicationStatus: 'active',
  resolutionNumber: null,
  title: 'Documento de prueba',
  updatedAt: '2026-08-09T00:00:00.000Z',
  updatedBy: authorization.userId,
};

function createDocumentsService(): jest.Mocked<DocumentsService> {
  return {
    addVersion: jest.fn(),
    create: jest.fn(),
    createDownloadUrl: jest.fn(),
    findOne: jest.fn(),
    linkModule: jest.fn(),
    list: jest.fn(),
    logicalDelete: jest.fn(),
    setStatus: jest.fn(),
    unlinkModule: jest.fn(),
    updateMetadata: jest.fn(),
  } as unknown as jest.Mocked<DocumentsService>;
}

describe('DocumentsController', () => {
  it('delegates all protected document operations to the service', async () => {
    const documentsService = createDocumentsService();
    const controller = new DocumentsController(documentsService);
    const file = { originalname: 'documento.pdf' } as Express.Multer.File;
    const details: ManagedDocumentDetails = {
      ...documentRecord,
      moduleIds: [],
      versions: [],
    };
    documentsService.create.mockResolvedValue(documentRecord);
    documentsService.addVersion.mockResolvedValue(documentRecord);
    documentsService.createDownloadUrl.mockResolvedValue({
      expiresAt: '2026-08-09T00:01:00.000Z',
      url: 'http://signed.local/test',
      versionId: documentRecord.currentVersionId!,
    });
    documentsService.findOne.mockResolvedValue(details);
    documentsService.list.mockResolvedValue([documentRecord]);
    documentsService.setStatus.mockResolvedValue(documentRecord);
    documentsService.updateMetadata.mockResolvedValue(documentRecord);
    documentsService.linkModule.mockResolvedValue(undefined);
    documentsService.unlinkModule.mockResolvedValue(undefined);
    documentsService.logicalDelete.mockResolvedValue(undefined);

    await expect(
      controller.create(
        { documentType: 'NORMATIVE', title: documentRecord.title },
        file,
        authorization,
      ),
    ).resolves.toEqual(documentRecord);
    await expect(controller.list({ status: 'active' })).resolves.toEqual([
      documentRecord,
    ]);
    await expect(controller.findOne(documentRecord.id)).resolves.toEqual(
      details,
    );
    await expect(
      controller.addVersion(documentRecord.id, file, authorization),
    ).resolves.toEqual(documentRecord);
    await expect(
      controller.createDownloadUrl(documentRecord.id, {}, authorization),
    ).resolves.toEqual(
      expect.objectContaining({ versionId: documentRecord.currentVersionId }),
    );
    await controller.linkModule(
      documentRecord.id,
      { moduleId: 'da6105be-8676-46fe-b2d2-63e5ac83ee8d' },
      authorization,
    );
    await expect(
      controller.setStatus(
        documentRecord.id,
        { isActive: false, reason: 'Revisión normativa' },
        authorization,
      ),
    ).resolves.toEqual(documentRecord);
    await expect(
      controller.updateMetadata(
        documentRecord.id,
        { title: 'Documento actualizado' },
        authorization,
      ),
    ).resolves.toEqual(documentRecord);
    await controller.unlinkModule(
      documentRecord.id,
      'da6105be-8676-46fe-b2d2-63e5ac83ee8d',
      authorization,
    );
    await controller.logicalDelete(
      documentRecord.id,
      { reason: 'Documento retirado' },
      authorization,
    );

    expect(documentsService.create).toHaveBeenCalledWith(
      { documentType: 'NORMATIVE', title: documentRecord.title },
      file,
      authorization,
    );
    expect(documentsService.logicalDelete).toHaveBeenCalledWith(
      documentRecord.id,
      { reason: 'Documento retirado' },
      authorization,
    );
  });
});
