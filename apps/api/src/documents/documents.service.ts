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
import { type ListDocumentsQueryDto } from './dto/list-documents-query.dto';
import { type LogicalDeleteDocumentDto } from './dto/logical-delete-document.dto';
import { type SetDocumentStatusDto } from './dto/set-document-status.dto';
import { type UpdateDocumentMetadataDto } from './dto/update-document-metadata.dto';
import {
  toManagedDocumentVersion,
  type DocumentMetadata,
  type ManagedDocument,
  type ManagedDocumentDetails,
} from './domain/document';
import type {
  DocumentMetadataPatch,
  DocumentsGateway,
} from './documents.gateway';
import { PdfInspectionService } from './pdf-inspection.service';

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
    dto.articleReference !== undefined ||
    dto.documentType !== undefined ||
    dto.issuanceYear !== undefined ||
    dto.issuingEntity !== undefined ||
    dto.metadata !== undefined ||
    dto.resolutionNumber !== undefined ||
    dto.title !== undefined
  );
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
    const inspectedPdf = await this.pdfInspectionService.inspect(file);
    const content = file?.buffer;

    if (!content) {
      throw new BadRequestException('A PDF file is required.');
    }

    const versionId = randomUUID();
    const storagePath = this.buildStoragePath(documentId, versionId);

    await this.documentsGateway.uploadPdf(storagePath, content);

    try {
      return await this.documentsGateway.addVersion({
        actorId: authorization.userId,
        documentId,
        fileSizeBytes: inspectedPdf.sizeBytes,
        originalFileName: inspectedPdf.originalFileName,
        pageCount: inspectedPdf.pageCount,
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
    const metadata = metadataOrEmpty(dto.metadata);
    ensureMetadataSize(metadata);
    const inspectedPdf = await this.pdfInspectionService.inspect(file);
    const content = file?.buffer;

    if (!content) {
      throw new BadRequestException('A PDF file is required.');
    }

    const documentId = randomUUID();
    const versionId = randomUUID();
    const storagePath = this.buildStoragePath(documentId, versionId);

    await this.documentsGateway.uploadPdf(storagePath, content);

    try {
      return await this.documentsGateway.create({
        actorId: authorization.userId,
        articleReference: dto.articleReference,
        documentId,
        documentType: dto.documentType,
        fileSizeBytes: inspectedPdf.sizeBytes,
        issuanceYear: dto.issuanceYear,
        issuingEntity: dto.issuingEntity,
        metadata,
        moduleIds: dto.moduleIds ?? [],
        originalFileName: inspectedPdf.originalFileName,
        pageCount: inspectedPdf.pageCount,
        resolutionNumber: dto.resolutionNumber,
        sha256: inspectedPdf.sha256,
        storagePath,
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
    const [versions, moduleIds] = await Promise.all([
      this.documentsGateway.listVersions(documentId),
      this.documentsGateway.listModuleIds(documentId),
    ]);

    return {
      ...document,
      moduleIds,
      versions: versions.map(toManagedDocumentVersion),
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

    if (dto.metadata) {
      ensureMetadataSize(dto.metadata);
    }

    await this.requireLiveDocument(documentId);
    const patch: DocumentMetadataPatch = {
      articleReference: dto.articleReference,
      documentType: dto.documentType,
      issuanceYear: dto.issuanceYear,
      issuingEntity: dto.issuingEntity,
      metadata: dto.metadata,
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

  private buildStoragePath(documentId: string, versionId: string): string {
    return `documents/${documentId}/versions/${versionId}.pdf`;
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
