/* eslint-disable @typescript-eslint/unbound-method */
import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AuthorizationContext } from '../authorization';
import type { CreateDocumentUploadDto } from './dto/create-document-upload.dto';
import type { UpdateDocumentMetadataDto } from './dto/update-document-metadata.dto';
import type { ManagedDocument, StoredDocumentVersion } from './domain/document';
import type { DocumentsGateway } from './documents.gateway';
import { DocumentsService } from './documents.service';
import { UnreadablePdfException } from './pdf-inspection.service';

const authorization: AuthorizationContext = {
  email: 'admin@example.com',
  emailConfirmedAt: '2026-08-09T00:00:00.000Z',
  role: 'admin',
  userId: 'f4ca2c55-9eb1-48ae-9e96-1e4a8397d37c',
};

const documentRecord: ManagedDocument = {
  additionalDetail: null,
  approvalStatus: 'ready',
  approvalUpdatedAt: '2026-08-10T00:00:00.000Z',
  approvalUpdatedBy: authorization.userId,
  approvedVersionId: '70fe3e8e-5a9d-4c7d-8a86-303b49e4c2d6',
  articleReference: null,
  archiveObservation: null,
  archiveReasonCode: null,
  archiveReasonDetail: null,
  createdAt: '2026-08-09T00:00:00.000Z',
  createdBy: authorization.userId,
  currentVersionId: '70fe3e8e-5a9d-4c7d-8a86-303b49e4c2d6',
  deactivatedAt: null,
  deactivatedBy: null,
  deactivationReason: null,
  deletedAt: null,
  deletedBy: null,
  deletionReason: null,
  documentType: 'LEY',
  documentTypeOther: null,
  id: '411a0188-bb7c-4ef9-847d-8abf506e67c1',
  isDeleted: false,
  issuanceYear: 2026,
  issuingEntity: 'MINEDU',
  issuingEntityOther: null,
  keywords: null,
  metadata: { scope: 'local', specificDependency: 'Secretaría General' },
  publicationStatus: 'active',
  replacementDate: null,
  replacementDocumentId: null,
  replacementObservation: null,
  replacementReason: null,
  replacementYear: null,
  resolutionNumber: null,
  situation: 'current',
  specificDependency: 'Secretaría General',
  title: 'Documento de prueba',
  updatedAt: '2026-08-09T00:00:00.000Z',
  updatedBy: authorization.userId,
};

const createDocumentDto: CreateDocumentUploadDto = {
  documentType: 'LEY',
  issuanceYear: 2026,
  issuingEntity: 'MINEDU',
  moduleIds: ['8d4b660b-9e94-4d34-a3d2-2548a83587e1'],
  situation: 'current',
  specificDependency: 'Secretaría General',
  title: 'Documento de prueba',
};

const versionRecord: StoredDocumentVersion = {
  fileSizeBytes: 512,
  id: documentRecord.currentVersionId!,
  ingestionStatus: 'indexed',
  ingestionUpdatedAt: '2026-08-10T00:00:00.000Z',
  mimeType: 'application/pdf',
  originalFileName: 'documento.pdf',
  pageCount: 1,
  sha256: 'a'.repeat(64),
  storageBucket: 'normative-documents',
  storagePath: `documents/${documentRecord.id}/versions/${documentRecord.currentVersionId}.pdf`,
  uploadedAt: '2026-08-09T00:00:00.000Z',
  uploadedBy: authorization.userId,
  uploadedByName: null,
  versionNumber: 1,
};

function createFile(): Express.Multer.File {
  return {
    buffer: Buffer.from('%PDF-1.7 test'),
    encoding: '7bit',
    destination: '',
    fieldname: 'file',
    filename: 'documento.pdf',
    mimetype: 'application/pdf',
    originalname: 'documento.pdf',
    path: '',
    size: 16,
    stream: undefined as never,
  };
}

function createGateway(): jest.Mocked<DocumentsGateway> {
  return {
    addVersion: jest.fn(),
    create: jest.fn(),
    createDownloadUrl: jest.fn(),
    findById: jest.fn(),
    findVersion: jest.fn(),
    listAuditEvents: jest.fn(),
    linkModule: jest.fn(),
    list: jest.fn(),
    listActorNames: jest.fn(),
    listLibrary: jest.fn(),
    listModuleIds: jest.fn(),
    listSuggestions: jest.fn(),
    listUploaders: jest.fn(),
    listVersions: jest.fn(),
    logicalDelete: jest.fn(),
    removePdf: jest.fn(),
    recordDownloadUrl: jest.fn(),
    setStatus: jest.fn(),
    setSituation: jest.fn(),
    setTechnicalStatus: jest.fn(),
    unlinkModule: jest.fn(),
    updateMetadata: jest.fn(),
    uploadPdf: jest.fn(),
  };
}

describe('DocumentsService', () => {
  let documentsGateway: jest.Mocked<DocumentsGateway>;
  let pdfInspectionService: {
    inspect: jest.Mock;
    inspectUnreadable: jest.Mock;
  };
  let service: DocumentsService;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    documentsGateway = createGateway();
    documentsGateway.listAuditEvents.mockResolvedValue([]);
    pdfInspectionService = {
      inspect: jest.fn().mockResolvedValue({
        extension: '.pdf',
        format: 'pdf',
        mimeType: 'application/pdf',
        originalFileName: 'documento.pdf',
        pageCount: 1,
        sha256: 'a'.repeat(64),
        sizeBytes: 512,
      }),
      inspectUnreadable: jest.fn().mockReturnValue({
        extension: '.pdf',
        format: 'pdf',
        mimeType: 'application/pdf',
        originalFileName: 'documento.pdf',
        pageCount: 1,
        sha256: 'a'.repeat(64),
        sizeBytes: 512,
      }),
    };
    service = new DocumentsService(
      documentsGateway,
      pdfInspectionService as never,
    );
  });

  it('validates, stores and persists a new PDF document without overwriting paths', async () => {
    documentsGateway.create.mockResolvedValue(documentRecord);
    const file = createFile();
    const dto: CreateDocumentUploadDto = {
      ...createDocumentDto,
      metadata: { scope: 'local' },
    };

    await expect(service.create(dto, file, authorization)).resolves.toEqual(
      documentRecord,
    );

    expect(documentsGateway.uploadPdf).toHaveBeenCalledWith(
      expect.stringMatching(
        /^documents\/[0-9a-f-]+\/versions\/[0-9a-f-]+\.pdf$/,
      ),
      file.buffer,
      'application/pdf',
    );
    expect(documentsGateway.create).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: authorization.userId,
        documentType: 'LEY',
        moduleIds: dto.moduleIds,
        originalFileName: 'documento.pdf',
        pageCount: 1,
      }),
    );
  });

  it('retains an unreadable PDF and delegates automatic Error classification', async () => {
    documentsGateway.create.mockResolvedValue(documentRecord);
    pdfInspectionService.inspect.mockRejectedValue(
      new UnreadablePdfException(),
    );
    const file = createFile();

    await expect(
      service.create(createDocumentDto, file, authorization),
    ).resolves.toEqual(documentRecord);

    expect(pdfInspectionService.inspectUnreadable).toHaveBeenCalledWith(file);
    expect(documentsGateway.uploadPdf).toHaveBeenCalledWith(
      expect.any(String),
      file.buffer,
      'application/pdf',
    );
    expect(documentsGateway.create).toHaveBeenCalledWith(
      expect.objectContaining({
        processingError:
          'El archivo tiene estructura PDF, pero la lectura o procesamiento automático falló.',
      }),
    );
  });

  it('compensates uploaded objects when creation persistence fails', async () => {
    documentsGateway.create.mockRejectedValue(new Error('database failure'));
    documentsGateway.removePdf.mockResolvedValue(true);

    await expect(
      service.create(createDocumentDto, createFile(), authorization),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(documentsGateway.removePdf).toHaveBeenCalledTimes(1);
  });

  it('preserves the object and recovers the document when persistence committed but its response failed', async () => {
    documentsGateway.create.mockRejectedValue(new Error('network timeout'));
    documentsGateway.findVersion.mockResolvedValue(versionRecord);
    documentsGateway.findById.mockResolvedValue(documentRecord);

    await expect(
      service.create(createDocumentDto, createFile(), authorization),
    ).resolves.toEqual(documentRecord);

    expect(documentsGateway.removePdf).not.toHaveBeenCalled();
  });

  it('does not delete an uploaded object when persistence cannot be confirmed', async () => {
    documentsGateway.create.mockRejectedValue(new Error('network timeout'));
    documentsGateway.findVersion.mockRejectedValue(
      new ServiceUnavailableException('database unavailable'),
    );

    await expect(
      service.create(createDocumentDto, createFile(), authorization),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(documentsGateway.removePdf).not.toHaveBeenCalled();
  });

  it('fails safely if failed persistence cannot compensate the uploaded object', async () => {
    documentsGateway.create.mockRejectedValue(new Error('database failure'));
    documentsGateway.removePdf.mockResolvedValue(false);

    await expect(
      service.create(createDocumentDto, createFile(), authorization),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('preserves the original safe persistence classification when object cleanup succeeds', async () => {
    documentsGateway.create.mockRejectedValue(
      new ConflictException('Module relation changed'),
    );
    documentsGateway.removePdf.mockResolvedValue(true);

    await expect(
      service.create(createDocumentDto, createFile(), authorization),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('fails safely when storage cleanup itself raises an unexpected error', async () => {
    documentsGateway.create.mockRejectedValue(new Error('database failure'));
    documentsGateway.removePdf.mockRejectedValue(new Error('storage failure'));

    await expect(
      service.create(createDocumentDto, createFile(), authorization),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('requires a live document before accepting a new version', async () => {
    documentsGateway.findById.mockResolvedValue(null);

    await expect(
      service.addVersion(documentRecord.id, createFile(), authorization),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(documentsGateway.uploadPdf).not.toHaveBeenCalled();
  });

  it('creates a new immutable version and compensates storage failures', async () => {
    documentsGateway.findById.mockResolvedValue(documentRecord);
    documentsGateway.addVersion.mockRejectedValue(new Error('rpc failure'));
    documentsGateway.removePdf.mockResolvedValue(true);

    await expect(
      service.addVersion(documentRecord.id, createFile(), authorization),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    const addVersionCall = documentsGateway.addVersion.mock.calls.at(0);
    expect(addVersionCall?.[0]?.documentId).toBe(documentRecord.id);
    expect(addVersionCall?.[0]?.versionId).toEqual(expect.any(String));
    expect(documentsGateway.removePdf).toHaveBeenCalledTimes(1);
  });

  it('returns details without exposing private storage paths', async () => {
    documentsGateway.findById.mockResolvedValue(documentRecord);
    documentsGateway.listVersions.mockResolvedValue([versionRecord]);
    documentsGateway.listModuleIds.mockResolvedValue([
      '8d4b660b-9e94-4d34-a3d2-2548a83587e1',
    ]);
    documentsGateway.listActorNames.mockResolvedValue({
      [authorization.userId]: 'Administrador de prueba',
    });

    await expect(service.findOne(documentRecord.id)).resolves.toEqual({
      ...documentRecord,
      auditEvents: [],
      createdByName: 'Administrador de prueba',
      moduleIds: ['8d4b660b-9e94-4d34-a3d2-2548a83587e1'],
      versions: [
        {
          fileSizeBytes: versionRecord.fileSizeBytes,
          id: versionRecord.id,
          ingestionStatus: versionRecord.ingestionStatus,
          ingestionUpdatedAt: versionRecord.ingestionUpdatedAt,
          originalFileName: versionRecord.originalFileName,
          pageCount: versionRecord.pageCount,
          uploadedAt: versionRecord.uploadedAt,
          uploadedBy: versionRecord.uploadedBy,
          uploadedByName: 'Administrador de prueba',
          versionNumber: versionRecord.versionNumber,
        },
      ],
    });
  });

  it('generates a short-lived URL only for a version belonging to a live document', async () => {
    documentsGateway.findById.mockResolvedValue(documentRecord);
    documentsGateway.findVersion.mockResolvedValue(versionRecord);
    documentsGateway.createDownloadUrl.mockResolvedValue(
      'http://localhost:55321/storage/v1/object/sign/normative-documents/test',
    );

    const result = await service.createDownloadUrl(
      documentRecord.id,
      {},
      authorization,
    );

    expect(result.url).toContain('/object/sign/');
    expect(result.versionId).toBe(versionRecord.id);
    expect(documentsGateway.createDownloadUrl).toHaveBeenCalledWith(
      versionRecord.storagePath,
      60,
      'attachment',
    );
    expect(documentsGateway.recordDownloadUrl).toHaveBeenCalledWith(
      documentRecord.id,
      versionRecord.id,
      authorization.userId,
    );
  });

  it('rejects missing or foreign document versions before signing', async () => {
    documentsGateway.findById.mockResolvedValue(documentRecord);
    documentsGateway.findVersion.mockResolvedValue(null);

    await expect(
      service.createDownloadUrl(
        documentRecord.id,
        { versionId: '6c9d66bf-4dbb-4e55-8199-5d0e4e3d8e59' },
        authorization,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('enforces document status reasons and rejects unchanged publication states', async () => {
    documentsGateway.findById.mockResolvedValue(documentRecord);

    await expect(
      service.setStatus(documentRecord.id, { isActive: false }, authorization),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.setStatus(documentRecord.id, { isActive: true }, authorization),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates document situations before delegating the atomic transition', async () => {
    documentsGateway.findById.mockResolvedValue(documentRecord);
    documentsGateway.setSituation.mockResolvedValue({
      ...documentRecord,
      publicationStatus: 'inactive',
      replacementReason: 'Nueva norma aplicable',
      replacementYear: 2027,
      situation: 'replaced',
    });

    await expect(
      service.setSituation(
        documentRecord.id,
        { situation: 'archived' },
        authorization,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.setSituation(
        documentRecord.id,
        { reason: 'Nueva norma aplicable', situation: 'replaced' },
        authorization,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.setSituation(
        documentRecord.id,
        { situation: 'current' },
        authorization,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.setSituation(
        documentRecord.id,
        {
          reason: 'Nueva norma aplicable',
          replacementYear: 2027,
          situation: 'replaced',
        },
        authorization,
      ),
    ).resolves.toMatchObject({ situation: 'replaced' });

    expect(documentsGateway.setSituation).toHaveBeenCalledWith(
      documentRecord.id,
      'replaced',
      authorization.userId,
      expect.objectContaining({
        reason: 'Nueva norma aplicable',
        replacementYear: 2027,
      }),
    );
  });

  it('enforces current and archived situation payload invariants', async () => {
    const archivedDocument: ManagedDocument = {
      ...documentRecord,
      deactivatedAt: '2027-01-01T00:00:00.000Z',
      deactivatedBy: authorization.userId,
      deactivationReason: 'Archivo administrativo',
      publicationStatus: 'inactive',
      situation: 'archived',
    };
    documentsGateway.findById.mockResolvedValue(archivedDocument);
    documentsGateway.setSituation.mockResolvedValue(documentRecord);

    await expect(
      service.setSituation(
        documentRecord.id,
        { reason: 'No corresponde', situation: 'current' },
        authorization,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.setSituation(
        documentRecord.id,
        { observation: 'No corresponde', situation: 'current' },
        authorization,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.setSituation(
        documentRecord.id,
        { situation: 'current' },
        authorization,
      ),
    ).resolves.toEqual(documentRecord);

    documentsGateway.findById.mockResolvedValue(documentRecord);
    documentsGateway.setSituation.mockResolvedValue({
      ...documentRecord,
      publicationStatus: 'inactive',
      situation: 'archived',
    });

    await expect(
      service.setSituation(
        documentRecord.id,
        {
          observation: 'Dato exclusivo de reemplazo',
          reason: 'Archivo administrativo',
          situation: 'archived',
        },
        authorization,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.setSituation(
        documentRecord.id,
        { archiveReasonCode: 'DUPLICATE', situation: 'archived' },
        authorization,
      ),
    ).resolves.toMatchObject({ situation: 'archived' });
  });

  it('rejects inconsistent replacement targets and dates before delegation', async () => {
    documentsGateway.findById.mockResolvedValue(documentRecord);
    documentsGateway.setSituation.mockResolvedValue({
      ...documentRecord,
      publicationStatus: 'inactive',
      replacementDate: '2027-03-15',
      replacementReason: 'Nueva norma aplicable',
      replacementYear: 2027,
      situation: 'replaced',
    });

    await expect(
      service.setSituation(
        documentRecord.id,
        { replacementYear: 2027, situation: 'replaced' },
        authorization,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.setSituation(
        documentRecord.id,
        {
          reason: 'Nueva norma aplicable',
          replacementDocumentId: documentRecord.id,
          replacementYear: 2027,
          situation: 'replaced',
        },
        authorization,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.setSituation(
        documentRecord.id,
        {
          reason: 'Nueva norma aplicable',
          replacementDate: 'invalid',
          situation: 'replaced',
        },
        authorization,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.setSituation(
        documentRecord.id,
        {
          reason: 'Nueva norma aplicable',
          replacementDate: '2027-02-30',
          situation: 'replaced',
        },
        authorization,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.setSituation(
        documentRecord.id,
        {
          reason: 'Nueva norma aplicable',
          replacementDate: '2027-03-15',
          replacementYear: 2026,
          situation: 'replaced',
        },
        authorization,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.setSituation(
        documentRecord.id,
        {
          reason: 'Nueva norma aplicable',
          replacementDate: '2027-03-15',
          replacementYear: 2027,
          situation: 'replaced',
        },
        authorization,
      ),
    ).resolves.toMatchObject({ situation: 'replaced' });
  });

  it('delegates normalized server-side library filters and real pagination', async () => {
    documentsGateway.listLibrary.mockResolvedValue({
      items: [],
      limit: 25,
      offset: 25,
      total: 0,
    });

    await expect(
      service.listLibrary({
        moduleId: '8d4b660b-9e94-4d34-a3d2-2548a83587e1',
        offset: 25,
        q: 'licencia docente',
        sort: 'title',
      }),
    ).resolves.toMatchObject({ limit: 25, offset: 25 });

    expect(documentsGateway.listLibrary).toHaveBeenCalledWith({
      createdBy: undefined,
      createdFrom: undefined,
      createdTo: undefined,
      documentType: undefined,
      issuanceYear: undefined,
      issuingEntity: undefined,
      limit: 25,
      moduleId: '8d4b660b-9e94-4d34-a3d2-2548a83587e1',
      offset: 25,
      q: 'licencia docente',
      situation: undefined,
      sort: 'title',
      submoduleId: undefined,
      technicalStatus: undefined,
    });
  });

  it('forwards the upload-date and uploader filters the client asked for', async () => {
    documentsGateway.listLibrary.mockResolvedValue({
      items: [],
      limit: 25,
      offset: 0,
      total: 0,
    });

    await service.listLibrary({
      createdBy: '8d4b660b-9e94-4d34-a3d2-2548a83587e1',
      createdFrom: '2026-01-01',
      createdTo: '2026-12-31',
    });

    expect(documentsGateway.listLibrary).toHaveBeenCalledWith(
      expect.objectContaining({
        createdBy: '8d4b660b-9e94-4d34-a3d2-2548a83587e1',
        createdFrom: '2026-01-01',
        createdTo: '2026-12-31',
      }),
    );
  });

  it('rejects an inverted upload-date range instead of returning an empty library', () => {
    // La validación es síncrona: rechaza antes de construir la promesa.
    expect(() =>
      service.listLibrary({
        createdFrom: '2026-12-31',
        createdTo: '2026-01-01',
      }),
    ).toThrow(BadRequestException);

    expect(documentsGateway.listLibrary).not.toHaveBeenCalled();
  });

  it('exposes the administrators that uploaded documents for the filter', async () => {
    documentsGateway.listUploaders.mockResolvedValue([
      {
        documentCount: 3,
        fullName: 'Ana Auditora',
        id: '8d4b660b-9e94-4d34-a3d2-2548a83587e1',
      },
    ]);

    await expect(service.listUploaders()).resolves.toEqual([
      {
        documentCount: 3,
        fullName: 'Ana Auditora',
        id: '8d4b660b-9e94-4d34-a3d2-2548a83587e1',
      },
    ]);
  });

  it('stores administrator keywords so the library search can find the document', async () => {
    documentsGateway.create.mockResolvedValue(documentRecord);

    await service.create(
      { ...createDocumentDto, keywords: '  licencia, salud  ' },
      createFile(),
      authorization,
    );

    expect(documentsGateway.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          keywords: 'licencia, salud',
          specificDependency: 'Secretaría General',
        },
      }),
    );
  });

  it('clears the keywords when the administrator empties the field', async () => {
    documentsGateway.findById.mockResolvedValue({
      ...documentRecord,
      keywords: 'licencia',
      metadata: {
        keywords: 'licencia',
        specificDependency: 'Secretaría General',
      },
    });
    documentsGateway.updateMetadata.mockResolvedValue(documentRecord);

    await service.updateMetadata(
      documentRecord.id,
      { keywords: '   ' },
      authorization,
    );

    expect(documentsGateway.updateMetadata).toHaveBeenCalledWith(
      documentRecord.id,
      expect.objectContaining({
        metadata: { specificDependency: 'Secretaría General' },
      }),
      authorization.userId,
    );
  });

  it('keeps keywords written as raw JSON when the dedicated field is absent', async () => {
    documentsGateway.findById.mockResolvedValue(documentRecord);
    documentsGateway.updateMetadata.mockResolvedValue(documentRecord);

    await service.updateMetadata(
      documentRecord.id,
      { metadata: { keywords: ['vigente'] }, title: 'Documento actualizado' },
      authorization,
    );

    expect(documentsGateway.updateMetadata).toHaveBeenCalledWith(
      documentRecord.id,
      expect.objectContaining({
        metadata: {
          keywords: ['vigente'],
          specificDependency: 'Secretaría General',
        },
      }),
      authorization.userId,
    );
  });

  it('updates only defined metadata values and rejects empty or oversized patches', async () => {
    documentsGateway.findById.mockResolvedValue(documentRecord);
    documentsGateway.updateMetadata.mockResolvedValue(documentRecord);

    await expect(
      service.updateMetadata(documentRecord.id, {}, authorization),
    ).rejects.toBeInstanceOf(BadRequestException);

    const oversized: UpdateDocumentMetadataDto = {
      metadata: { payload: 'a'.repeat(8 * 1024) },
    };
    await expect(
      service.updateMetadata(documentRecord.id, oversized, authorization),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.updateMetadata(
        documentRecord.id,
        { metadata: { scope: 'updated' }, title: 'Documento actualizado' },
        authorization,
      ),
    ).resolves.toEqual(documentRecord);

    expect(documentsGateway.updateMetadata).toHaveBeenCalledWith(
      documentRecord.id,
      {
        metadata: {
          scope: 'updated',
          specificDependency: 'Secretaría General',
        },
        title: 'Documento actualizado',
      },
      authorization.userId,
    );
  });

  it('replaces editable metadata and clears stale dynamic and optional values', async () => {
    const customDocument: ManagedDocument = {
      ...documentRecord,
      additionalDetail: 'Detalle anterior',
      articleReference: 'Artículo anterior',
      documentType: 'OTRO',
      documentTypeOther: 'Circular interna',
      issuingEntity: 'OTRA_INSTITUCION',
      issuingEntityOther: 'Entidad anterior',
      metadata: {
        additionalDetail: 'Detalle anterior',
        documentTypeOther: 'Circular interna',
        issuingEntityOther: 'Entidad anterior',
        obsoleteKeyword: 'retirar',
        specificDependency: 'Oficina anterior',
      },
      resolutionNumber: 'ANTERIOR-001',
      specificDependency: 'Oficina anterior',
    };
    documentsGateway.findById.mockResolvedValue(customDocument);
    documentsGateway.updateMetadata.mockResolvedValue(documentRecord);

    await service.updateMetadata(
      customDocument.id,
      {
        additionalDetail: null,
        articleReference: null,
        documentType: 'LEY',
        issuanceYear: 2026,
        issuingEntity: 'MINEDU',
        metadata: { keywords: ['vigente'] },
        resolutionNumber: null,
        specificDependency: 'DIGEDD',
        title: 'Documento actualizado',
      },
      authorization,
    );

    expect(documentsGateway.updateMetadata).toHaveBeenCalledWith(
      customDocument.id,
      expect.objectContaining({
        articleReference: null,
        documentType: 'LEY',
        issuingEntity: 'MINEDU',
        metadata: {
          keywords: ['vigente'],
          specificDependency: 'DIGEDD',
        },
        resolutionNumber: null,
      }),
      authorization.userId,
    );
  });

  it('requires a fresh dependency when the issuing entity changes', async () => {
    documentsGateway.findById.mockResolvedValue(documentRecord);

    await expect(
      service.updateMetadata(
        documentRecord.id,
        { issuingEntity: 'UGEL' },
        authorization,
      ),
    ).rejects.toThrow(
      'A new specific dependency is required when the issuing entity changes.',
    );

    expect(documentsGateway.updateMetadata).not.toHaveBeenCalled();
  });

  it('delegates links, unlinking, listing and logical deletion through the protected gateway', async () => {
    documentsGateway.findById.mockResolvedValue(documentRecord);
    documentsGateway.list.mockResolvedValue([documentRecord]);

    await expect(service.list({})).resolves.toEqual([documentRecord]);
    await service.linkModule(
      documentRecord.id,
      { moduleId: '8d4b660b-9e94-4d34-a3d2-2548a83587e1' },
      authorization,
    );
    await service.unlinkModule(
      documentRecord.id,
      '8d4b660b-9e94-4d34-a3d2-2548a83587e1',
      authorization,
    );
    await service.logicalDelete(
      documentRecord.id,
      { reason: 'Documento retirado' },
      authorization,
    );

    expect(documentsGateway.list).toHaveBeenCalledWith({
      limit: 25,
      offset: 0,
      status: 'all',
    });
    expect(documentsGateway.linkModule).toHaveBeenCalledWith(
      documentRecord.id,
      '8d4b660b-9e94-4d34-a3d2-2548a83587e1',
      authorization.userId,
    );
    expect(documentsGateway.unlinkModule).toHaveBeenCalledWith(
      documentRecord.id,
      '8d4b660b-9e94-4d34-a3d2-2548a83587e1',
      authorization.userId,
    );
    expect(documentsGateway.logicalDelete).toHaveBeenCalledWith(
      documentRecord.id,
      'Documento retirado',
      authorization.userId,
    );
  });
});
