import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthorizationContext } from '../authorization';
import { SUPABASE_DOCUMENTS_GATEWAY } from '../supabase/supabase.constants';
import { CreateDocumentUploadDto } from './dto/create-document-upload.dto';
import { type DocumentDownloadUrlDto } from './dto/document-download-url.dto';
import { type DocumentModuleDto } from './dto/document-module.dto';
import { type ListDocumentLibraryQueryDto } from './dto/list-document-library-query.dto';
import { type ListDocumentsQueryDto } from './dto/list-documents-query.dto';
import { type LogicalDeleteDocumentDto } from './dto/logical-delete-document.dto';
import { type SetDocumentStatusDto } from './dto/set-document-status.dto';
import { type SetDocumentSituationDto } from './dto/set-document-situation.dto';
import { type SetDocumentTechnicalStatusDto } from './dto/set-document-technical-status.dto';
import { type UpdateDocumentMetadataDto } from './dto/update-document-metadata.dto';
import {
  currentDocumentYear,
  type ArchiveReasonCode,
} from './document-governance.constants';
import {
  toManagedDocumentVersion,
  toDocumentAuditEvent,
  type DocumentMetadata,
  type DocumentLibraryPage,
  type ManagedDocument,
  type ManagedDocumentDetails,
} from './domain/document';
import type {
  DocumentMetadataPatch,
  DocumentsGateway,
  DocumentUploader,
} from './documents.gateway';
import {
  PdfInspectionService,
  UnreadablePdfException,
  type InspectedPdf,
} from './pdf-inspection.service';

const DOWNLOAD_URL_TTL_SECONDS = 60;
const MAX_METADATA_BYTES = 8 * 1024;

function metadataOrEmpty(
  value: DocumentMetadata | undefined,
): DocumentMetadata {
  return value ?? {};
}

function ensureMetadataSize(metadata: DocumentMetadata): void {
  const serialized = JSON.stringify(metadata);

  if (Buffer.byteLength(serialized, 'utf8') > MAX_METADATA_BYTES) {
    throw new BadRequestException('Document metadata cannot exceed 8 KiB.');
  }
}

function hasMetadataUpdate(dto: UpdateDocumentMetadataDto): boolean {
  return (
    dto.additionalDetail !== undefined ||
    dto.articleReference !== undefined ||
    dto.documentType !== undefined ||
    dto.documentTypeOther !== undefined ||
    dto.issuanceYear !== undefined ||
    dto.issuingEntity !== undefined ||
    dto.issuingEntityOther !== undefined ||
    dto.keywords !== undefined ||
    dto.metadata !== undefined ||
    dto.resolutionNumber !== undefined ||
    dto.specificDependency !== undefined ||
    dto.title !== undefined
  );
}

const RESERVED_METADATA_KEYS = [
  'additionalDetail',
  'documentTypeOther',
  'issuingEntityOther',
  'specificDependency',
] as const;

/**
 * Las palabras clave tienen campo propio en el formulario, pero el panel
 * también admite escribirlas como JSON crudo (y ahí pueden ser una lista). No
 * se tratan como clave gobernada para no descartar en silencio ese formato:
 * el campo dedicado solo las sobrescribe cuando el administrador lo envía.
 */
function applyKeywords(
  metadata: DocumentMetadata,
  keywords: string | null | undefined,
): DocumentMetadata {
  if (keywords === undefined) return metadata;

  const trimmed = typeof keywords === 'string' ? keywords.trim() : '';
  const result: DocumentMetadata = { ...metadata };
  if (trimmed) result.keywords = trimmed;
  else delete result.keywords;
  return result;
}

function optionalMetadataText(
  metadata: DocumentMetadata,
  key: (typeof RESERVED_METADATA_KEYS)[number],
): string | undefined {
  const value = metadata[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function governedMetadata(
  base: DocumentMetadata,
  values: {
    additionalDetail?: string | null;
    documentTypeOther?: string | null;
    issuingEntityOther?: string | null;
    specificDependency?: string | null;
  },
): DocumentMetadata {
  const result: DocumentMetadata = { ...base };

  for (const key of RESERVED_METADATA_KEYS) delete result[key];
  for (const key of RESERVED_METADATA_KEYS) {
    const value = values[key];
    if (typeof value === 'string' && value.trim()) result[key] = value.trim();
  }

  return result;
}

function validateGovernedMetadata(input: {
  documentType: string;
  issuanceYear: number | null | undefined;
  issuingEntity: string | null | undefined;
  metadata: DocumentMetadata;
}): void {
  const documentTypeOther = optionalMetadataText(
    input.metadata,
    'documentTypeOther',
  );
  const issuingEntityOther = optionalMetadataText(
    input.metadata,
    'issuingEntityOther',
  );
  const specificDependency = optionalMetadataText(
    input.metadata,
    'specificDependency',
  );

  if ((input.documentType === 'OTRO') !== Boolean(documentTypeOther)) {
    throw new BadRequestException(
      'A custom document type is required only when document type is OTRO.',
    );
  }
  if (
    (input.issuingEntity === 'OTRA_INSTITUCION') !==
    Boolean(issuingEntityOther)
  ) {
    throw new BadRequestException(
      'A custom issuing entity is required only for OTRA_INSTITUCION.',
    );
  }
  if (!specificDependency) {
    throw new BadRequestException('A specific dependency is required.');
  }
  if (
    input.issuanceYear === null ||
    input.issuanceYear === undefined ||
    input.issuanceYear < 1800 ||
    input.issuanceYear > currentDocumentYear()
  ) {
    throw new BadRequestException('Document year is invalid.');
  }
}

function effectiveSituation(dto: {
  archiveReasonCode?: ArchiveReasonCode;
  situation: 'archived' | 'current' | 'replaced';
}): 'archived' | 'current' | 'replaced' {
  return dto.situation === 'archived' &&
    dto.archiveReasonCode === 'REPLACED_BY_NEWER'
    ? 'replaced'
    : dto.situation;
}

function validateSituationInput(dto: {
  archiveReasonCode?: ArchiveReasonCode;
  archiveReasonDetail?: string;
  observation?: string;
  reason?: string;
  replacementDate?: string;
  replacementDocumentId?: string;
  replacementYear?: number;
  situation: 'archived' | 'current' | 'replaced';
}): 'archived' | 'current' | 'replaced' {
  const situation = effectiveSituation(dto);
  const hasReplacement = Boolean(
    dto.replacementDate || dto.replacementDocumentId || dto.replacementYear,
  );

  if (situation === 'current') {
    if (
      dto.archiveReasonCode ||
      dto.archiveReasonDetail ||
      dto.observation ||
      dto.reason ||
      hasReplacement
    ) {
      throw new BadRequestException(
        'A current document cannot contain archival or replacement data.',
      );
    }
    return situation;
  }

  if (situation === 'archived') {
    if (!dto.archiveReasonCode) {
      throw new BadRequestException('An archive reason is required.');
    }
    if (
      (dto.archiveReasonCode === 'OTHER') !==
      Boolean(dto.archiveReasonDetail)
    ) {
      throw new BadRequestException(
        'A custom archive reason is required only for OTHER.',
      );
    }
    if (dto.reason || hasReplacement) {
      throw new BadRequestException(
        'Only replacement archival may contain replacement data.',
      );
    }
    return situation;
  }

  if (!dto.reason || (!dto.replacementDate && !dto.replacementYear)) {
    throw new BadRequestException(
      'A replaced document requires a reason and a replacement date or year.',
    );
  }
  if (dto.archiveReasonCode && dto.archiveReasonCode !== 'REPLACED_BY_NEWER') {
    throw new BadRequestException('Replacement archive reason is invalid.');
  }
  if (dto.archiveReasonDetail) {
    throw new BadRequestException(
      'A replaced document cannot contain a custom archive reason.',
    );
  }
  return situation;
}

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @Inject(SUPABASE_DOCUMENTS_GATEWAY)
    private readonly documentsGateway: DocumentsGateway,
    private readonly pdfInspectionService: PdfInspectionService,
  ) {}

  async addVersion(
    documentId: string,
    file: Express.Multer.File | undefined,
    authorization: AuthorizationContext,
  ): Promise<ManagedDocument> {
    await this.requireLiveDocument(documentId);
    const { inspectedPdf, processingError } =
      await this.inspectPdfForPersistence(file);
    const content = file?.buffer;

    if (!content) {
      throw new BadRequestException('A document file is required.');
    }

    const versionId = randomUUID();
    const storagePath = this.buildStoragePath(
      documentId,
      versionId,
      inspectedPdf.extension,
    );

    await this.documentsGateway.uploadPdf(
      storagePath,
      content,
      inspectedPdf.mimeType,
    );

    try {
      return await this.documentsGateway.addVersion({
        actorId: authorization.userId,
        documentId,
        fileSizeBytes: inspectedPdf.sizeBytes,
        originalFileName: inspectedPdf.originalFileName,
        pageCount: inspectedPdf.pageCount,
        processingError,
        sha256: inspectedPdf.sha256,
        storagePath,
        versionId,
      });
    } catch (error) {
      return this.resolvePersistenceOrCompensate(
        documentId,
        versionId,
        storagePath,
        error,
      );
    }
  }

  async create(
    dto: CreateDocumentUploadDto,
    file: Express.Multer.File | undefined,
    authorization: AuthorizationContext,
  ): Promise<ManagedDocument> {
    const metadata = applyKeywords(
      governedMetadata(metadataOrEmpty(dto.metadata), {
        additionalDetail: dto.additionalDetail,
        documentTypeOther: dto.documentTypeOther,
        issuingEntityOther: dto.issuingEntityOther,
        specificDependency: dto.specificDependency,
      }),
      dto.keywords,
    );
    ensureMetadataSize(metadata);
    validateGovernedMetadata({
      documentType: dto.documentType,
      issuanceYear: dto.issuanceYear,
      issuingEntity: dto.issuingEntity,
      metadata,
    });
    const situation = validateSituationInput(dto);
    const { inspectedPdf, processingError } =
      await this.inspectPdfForPersistence(file);
    const content = file?.buffer;

    if (!content) {
      throw new BadRequestException('A document file is required.');
    }

    const documentId = randomUUID();
    const versionId = randomUUID();
    const storagePath = this.buildStoragePath(
      documentId,
      versionId,
      inspectedPdf.extension,
    );

    await this.documentsGateway.uploadPdf(
      storagePath,
      content,
      inspectedPdf.mimeType,
    );

    try {
      return await this.documentsGateway.create({
        actorId: authorization.userId,
        archiveReasonCode: dto.archiveReasonCode,
        archiveReasonDetail: dto.archiveReasonDetail,
        articleReference: dto.articleReference,
        documentId,
        documentType: dto.documentType,
        fileSizeBytes: inspectedPdf.sizeBytes,
        issuanceYear: dto.issuanceYear,
        issuingEntity: dto.issuingEntity,
        metadata,
        moduleIds: dto.moduleIds,
        observation: dto.observation,
        originalFileName: inspectedPdf.originalFileName,
        pageCount: inspectedPdf.pageCount,
        processingError,
        resolutionNumber: dto.resolutionNumber,
        reason: dto.reason,
        replacementDate: dto.replacementDate,
        replacementDocumentId: dto.replacementDocumentId,
        replacementYear: dto.replacementYear,
        sha256: inspectedPdf.sha256,
        storagePath,
        situation,
        title: dto.title,
        versionId,
      });
    } catch (error) {
      return this.resolvePersistenceOrCompensate(
        documentId,
        versionId,
        storagePath,
        error,
      );
    }
  }

  async createDownloadUrl(
    documentId: string,
    dto: DocumentDownloadUrlDto,
    authorization: AuthorizationContext,
  ): Promise<{ expiresAt: string; url: string; versionId: string }> {
    const document = await this.requireLiveDocument(documentId);
    const versionId = dto.versionId ?? document.currentVersionId;

    if (!versionId) {
      throw new ServiceUnavailableException(
        'Document version state is unavailable.',
      );
    }

    const version = await this.documentsGateway.findVersion(
      documentId,
      versionId,
    );

    if (!version) {
      throw new NotFoundException('Document version was not found.');
    }

    const expiresAt = new Date(
      Date.now() + DOWNLOAD_URL_TTL_SECONDS * 1_000,
    ).toISOString();
    const url = await this.documentsGateway.createDownloadUrl(
      version.storagePath,
      DOWNLOAD_URL_TTL_SECONDS,
      dto.disposition ?? 'attachment',
    );

    await this.documentsGateway.recordDownloadUrl(
      documentId,
      version.id,
      authorization.userId,
    );

    return {
      expiresAt,
      url,
      versionId: version.id,
    };
  }

  async findOne(documentId: string): Promise<ManagedDocumentDetails> {
    const document = await this.requireLiveDocument(documentId);
    const [versions, moduleIds, auditEvents] = await Promise.all([
      this.documentsGateway.listVersions(documentId),
      this.documentsGateway.listModuleIds(documentId),
      this.documentsGateway.listAuditEvents(documentId),
    ]);
    const actorIds = [
      document.createdBy,
      ...versions.map((version) => version.uploadedBy),
      ...auditEvents.map((event) => event.actorId),
    ].filter((actorId): actorId is string => actorId !== null);
    const actorNames = await this.documentsGateway.listActorNames([
      ...new Set(actorIds),
    ]);

    return {
      ...document,
      auditEvents: auditEvents.map((event) =>
        toDocumentAuditEvent(
          {
            action: event.action,
            actor_id: event.actorId,
            details: event.details,
            document_version_id: event.versionId,
            id: event.id,
            occurred_at: event.occurredAt,
          },
          event.actorId ? (actorNames[event.actorId] ?? null) : null,
        ),
      ),
      createdByName: document.createdBy
        ? (actorNames[document.createdBy] ?? null)
        : null,
      moduleIds,
      versions: versions.map((version) =>
        toManagedDocumentVersion(
          version,
          // El nombre guardado con la versión manda: sobrevive al borrado del
          // perfil. El join solo cubre las versiones anteriores al respaldo.
          version.uploadedByName ??
            (version.uploadedBy
              ? (actorNames[version.uploadedBy] ?? null)
              : null),
        ),
      ),
    };
  }

  async linkModule(
    documentId: string,
    dto: DocumentModuleDto,
    authorization: AuthorizationContext,
  ): Promise<void> {
    await this.requireLiveDocument(documentId);
    await this.documentsGateway.linkModule(
      documentId,
      dto.moduleId,
      authorization.userId,
    );
  }

  list(dto: ListDocumentsQueryDto): Promise<ManagedDocument[]> {
    return this.documentsGateway.list({
      limit: dto.limit ?? 25,
      offset: dto.offset ?? 0,
      status: dto.status ?? 'all',
    });
  }

  listLibrary(dto: ListDocumentLibraryQueryDto): Promise<DocumentLibraryPage> {
    if (dto.createdFrom && dto.createdTo && dto.createdFrom > dto.createdTo) {
      throw new BadRequestException(
        'The upload date range must start before it ends.',
      );
    }

    return this.documentsGateway.listLibrary({
      createdBy: dto.createdBy,
      createdFrom: dto.createdFrom,
      createdTo: dto.createdTo,
      documentType: dto.documentType,
      issuanceYear: dto.issuanceYear,
      issuingEntity: dto.issuingEntity,
      limit: dto.limit ?? 25,
      moduleId: dto.moduleId,
      offset: dto.offset ?? 0,
      q: dto.q,
      situation: dto.situation,
      sort: dto.sort ?? 'newest',
      submoduleId: dto.submoduleId,
      technicalStatus: dto.technicalStatus,
    });
  }

  listSuggestions(): Promise<{
    additionalDetails: string[];
    specificDependencies: string[];
  }> {
    return this.documentsGateway.listSuggestions();
  }

  listUploaders(): Promise<DocumentUploader[]> {
    return this.documentsGateway.listUploaders();
  }

  async logicalDelete(
    documentId: string,
    dto: LogicalDeleteDocumentDto,
    authorization: AuthorizationContext,
  ): Promise<void> {
    await this.requireLiveDocument(documentId);
    await this.documentsGateway.logicalDelete(
      documentId,
      dto.reason,
      authorization.userId,
    );
  }

  async setStatus(
    documentId: string,
    dto: SetDocumentStatusDto,
    authorization: AuthorizationContext,
  ): Promise<ManagedDocument> {
    const document = await this.requireLiveDocument(documentId);

    if (!dto.isActive && !dto.reason) {
      throw new BadRequestException(
        'A deactivation reason is required for an inactive document.',
      );
    }

    if (
      (dto.isActive && document.publicationStatus === 'active') ||
      (!dto.isActive && document.publicationStatus === 'inactive')
    ) {
      throw new BadRequestException(
        'Document publication status is unchanged.',
      );
    }

    return this.documentsGateway.setStatus(
      documentId,
      dto.isActive,
      dto.reason,
      authorization.userId,
    );
  }

  async setSituation(
    documentId: string,
    dto: SetDocumentSituationDto,
    authorization: AuthorizationContext,
  ): Promise<ManagedDocument> {
    const document = await this.requireLiveDocument(documentId);

    const situation = validateSituationInput(dto);

    if (document.situation === situation) {
      throw new BadRequestException('Document situation is unchanged.');
    }

    if (situation === 'replaced') {
      if (dto.replacementDocumentId === documentId) {
        throw new BadRequestException('A document cannot replace itself.');
      }

      if (dto.replacementDate) {
        const parsedDate = new Date(`${dto.replacementDate}T00:00:00.000Z`);

        if (
          Number.isNaN(parsedDate.getTime()) ||
          parsedDate.toISOString().slice(0, 10) !== dto.replacementDate
        ) {
          throw new BadRequestException('Replacement date is invalid.');
        }

        if (
          dto.replacementYear !== undefined &&
          parsedDate.getUTCFullYear() !== dto.replacementYear
        ) {
          throw new BadRequestException(
            'Replacement date and year must match.',
          );
        }
      }
    }

    return this.documentsGateway.setSituation(
      documentId,
      situation,
      authorization.userId,
      {
        archiveReasonCode:
          situation === 'replaced'
            ? 'REPLACED_BY_NEWER'
            : dto.archiveReasonCode,
        archiveReasonDetail: dto.archiveReasonDetail,
        observation: dto.observation,
        reason: dto.reason,
        replacementDate: dto.replacementDate,
        replacementDocumentId: dto.replacementDocumentId,
        replacementYear: dto.replacementYear,
      },
    );
  }

  async setTechnicalStatus(
    documentId: string,
    dto: SetDocumentTechnicalStatusDto,
    authorization: AuthorizationContext,
  ): Promise<ManagedDocument> {
    await this.requireLiveDocument(documentId);
    return this.documentsGateway.setTechnicalStatus(
      documentId,
      dto.technicalStatus,
      authorization.userId,
    );
  }

  async unlinkModule(
    documentId: string,
    moduleId: string,
    authorization: AuthorizationContext,
  ): Promise<void> {
    await this.requireLiveDocument(documentId);
    await this.documentsGateway.unlinkModule(
      documentId,
      moduleId,
      authorization.userId,
    );
  }

  async updateMetadata(
    documentId: string,
    dto: UpdateDocumentMetadataDto,
    authorization: AuthorizationContext,
  ): Promise<ManagedDocument> {
    if (!hasMetadataUpdate(dto)) {
      throw new BadRequestException('At least one document field is required.');
    }

    const document = await this.requireLiveDocument(documentId);
    const documentType = dto.documentType ?? document.documentType;
    const issuingEntity = dto.issuingEntity ?? document.issuingEntity;

    if (
      dto.issuingEntity !== undefined &&
      dto.issuingEntity !== document.issuingEntity &&
      dto.specificDependency === undefined
    ) {
      throw new BadRequestException(
        'A new specific dependency is required when the issuing entity changes.',
      );
    }

    const baseMetadata = governedMetadata(
      dto.metadata === undefined ? document.metadata : dto.metadata,
      {
        additionalDetail:
          dto.additionalDetail === undefined
            ? optionalMetadataText(document.metadata, 'additionalDetail')
            : dto.additionalDetail,
        documentTypeOther:
          dto.documentType !== undefined && dto.documentType !== 'OTRO'
            ? null
            : dto.documentTypeOther === undefined
              ? optionalMetadataText(document.metadata, 'documentTypeOther')
              : dto.documentTypeOther,
        issuingEntityOther:
          dto.issuingEntity !== undefined &&
          dto.issuingEntity !== 'OTRA_INSTITUCION'
            ? null
            : dto.issuingEntityOther === undefined
              ? optionalMetadataText(document.metadata, 'issuingEntityOther')
              : dto.issuingEntityOther,
        specificDependency:
          dto.specificDependency === undefined
            ? optionalMetadataText(document.metadata, 'specificDependency')
            : dto.specificDependency,
      },
    );
    const metadata = applyKeywords(baseMetadata, dto.keywords);
    ensureMetadataSize(metadata);
    validateGovernedMetadata({
      documentType,
      issuanceYear:
        dto.issuanceYear === undefined
          ? document.issuanceYear
          : dto.issuanceYear,
      issuingEntity,
      metadata,
    });
    const patch: DocumentMetadataPatch = {
      articleReference: dto.articleReference,
      documentType: dto.documentType,
      issuanceYear: dto.issuanceYear,
      issuingEntity: dto.issuingEntity,
      metadata,
      resolutionNumber: dto.resolutionNumber,
      title: dto.title,
    };

    return this.documentsGateway.updateMetadata(
      documentId,
      Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== undefined),
      ),
      authorization.userId,
    );
  }

  private buildStoragePath(
    documentId: string,
    versionId: string,
    extension: string,
  ): string {
    return `documents/${documentId}/versions/${versionId}${extension}`;
  }

  private async inspectPdfForPersistence(
    file: Express.Multer.File | undefined,
  ): Promise<{ inspectedPdf: InspectedPdf; processingError?: string }> {
    try {
      return { inspectedPdf: await this.pdfInspectionService.inspect(file) };
    } catch (error) {
      if (!(error instanceof UnreadablePdfException)) throw error;

      return {
        inspectedPdf: this.pdfInspectionService.inspectUnreadable(file),
        processingError:
          'El archivo tiene estructura PDF, pero la lectura o procesamiento automático falló.',
      };
    }
  }

  private async resolvePersistenceOrCompensate(
    documentId: string,
    versionId: string,
    storagePath: string,
    originalError: unknown,
  ): Promise<ManagedDocument> {
    try {
      const persistedVersion = await this.documentsGateway.findVersion(
        documentId,
        versionId,
      );

      if (persistedVersion) {
        const persistedDocument =
          await this.documentsGateway.findById(documentId);

        if (persistedDocument && !persistedDocument.isDeleted) {
          return persistedDocument;
        }

        this.logger.error(
          `Document persistence was confirmed but could not be recovered: ${documentId}.`,
        );
        throw new ServiceUnavailableException(
          'The document operation outcome could not be confirmed safely.',
        );
      }
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      this.logger.error(
        `Could not determine whether document persistence succeeded before compensation: ${documentId}.`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException(
        'The document operation outcome could not be confirmed safely.',
      );
    }

    let wasRemoved = false;

    try {
      wasRemoved = await this.documentsGateway.removePdf(storagePath);
    } catch (error) {
      this.logger.error(
        `Document object compensation failed for ${storagePath}.`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException(
        'The document operation could not be completed safely.',
      );
    }

    if (!wasRemoved) {
      this.logger.error(
        `Document object compensation was not acknowledged for ${storagePath}.`,
      );
      throw new ServiceUnavailableException(
        'The document operation could not be completed safely.',
      );
    }

    if (originalError instanceof HttpException) {
      throw originalError;
    }

    this.logger.error(
      'Document persistence failed after upload.',
      originalError instanceof Error ? originalError.stack : undefined,
    );
    throw new ServiceUnavailableException(
      'The document operation could not be completed.',
    );
  }

  private async requireLiveDocument(
    documentId: string,
  ): Promise<ManagedDocument> {
    const document = await this.documentsGateway.findById(documentId);

    if (!document || document.isDeleted) {
      throw new NotFoundException('Document was not found.');
    }

    return document;
  }
}
