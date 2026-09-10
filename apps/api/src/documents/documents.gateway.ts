import type {
  DocumentMetadata,
  DocumentLibraryPage,
  DocumentLibrarySort,
  DocumentPublicationFilter,
  DocumentSituation,
  DocumentTechnicalStatus,
  ManagedDocument,
  StoredDocumentAuditEvent,
  StoredDocumentVersion,
} from './domain/document';
import type {
  ArchiveReasonCode,
  DocumentApprovalStatus,
} from './document-governance.constants';

export interface DocumentLibraryQuery {
  createdBy?: string;
  createdFrom?: string;
  createdTo?: string;
  documentType?: string;
  issuanceYear?: number;
  issuingEntity?: string;
  limit: number;
  moduleId?: string;
  offset: number;
  q?: string;
  situation?: DocumentSituation;
  sort: DocumentLibrarySort;
  submoduleId?: string;
  technicalStatus?: DocumentTechnicalStatus;
}

/** Feeds the "Administrador que lo cargó" filter without exposing profiles. */
export interface DocumentUploader {
  documentCount: number;
  fullName: string;
  id: string;
}

export interface CreateDocumentRecord {
  actorId: string;
  archiveReasonCode?: ArchiveReasonCode;
  archiveReasonDetail?: string;
  articleReference?: string | null;
  documentId: string;
  documentType: string;
  fileSizeBytes: number;
  issuanceYear?: number | null;
  issuingEntity?: string | null;
  metadata: DocumentMetadata;
  moduleIds: string[];
  observation?: string;
  originalFileName: string;
  pageCount: number;
  processingError?: string;
  resolutionNumber?: string | null;
  reason?: string;
  replacementDate?: string;
  replacementDocumentId?: string;
  replacementYear?: number;
  sha256: string;
  storagePath: string;
  situation: DocumentSituation;
  title: string;
  versionId: string;
}

export interface AddDocumentVersionRecord {
  actorId: string;
  documentId: string;
  fileSizeBytes: number;
  originalFileName: string;
  pageCount: number;
  processingError?: string;
  sha256: string;
  storagePath: string;
  versionId: string;
}

export interface DocumentMetadataPatch {
  articleReference?: string | null;
  documentType?: string;
  issuanceYear?: number | null;
  issuingEntity?: string | null;
  metadata?: DocumentMetadata;
  resolutionNumber?: string | null;
  title?: string;
}

export interface DocumentsGateway {
  addVersion(input: AddDocumentVersionRecord): Promise<ManagedDocument>;
  create(input: CreateDocumentRecord): Promise<ManagedDocument>;
  createDownloadUrl(
    storagePath: string,
    expiresInSeconds: number,
    disposition?: 'attachment' | 'inline',
  ): Promise<string>;
  findById(documentId: string): Promise<ManagedDocument | null>;
  findVersion(
    documentId: string,
    versionId: string,
  ): Promise<StoredDocumentVersion | null>;
  listAuditEvents(documentId: string): Promise<StoredDocumentAuditEvent[]>;
  linkModule(
    documentId: string,
    moduleId: string,
    actorId: string,
  ): Promise<void>;
  list(options: {
    limit: number;
    offset: number;
    status: DocumentPublicationFilter;
  }): Promise<ManagedDocument[]>;
  listActorNames(actorIds: string[]): Promise<Record<string, string>>;
  listLibrary(options: DocumentLibraryQuery): Promise<DocumentLibraryPage>;
  listModuleIds(documentId: string): Promise<string[]>;
  listVersions(documentId: string): Promise<StoredDocumentVersion[]>;
  listSuggestions(): Promise<{
    additionalDetails: string[];
    specificDependencies: string[];
  }>;
  listUploaders(): Promise<DocumentUploader[]>;
  logicalDelete(
    documentId: string,
    reason: string,
    actorId: string,
  ): Promise<void>;
  removePdf(storagePath: string): Promise<boolean>;
  recordDownloadUrl(
    documentId: string,
    versionId: string,
    actorId: string,
  ): Promise<void>;
  setStatus(
    documentId: string,
    isActive: boolean,
    reason: string | undefined,
    actorId: string,
  ): Promise<ManagedDocument>;
  setSituation(
    documentId: string,
    situation: DocumentSituation,
    actorId: string,
    options: {
      archiveReasonCode?: ArchiveReasonCode;
      archiveReasonDetail?: string;
      observation?: string;
      reason?: string;
      replacementDate?: string;
      replacementDocumentId?: string;
      replacementYear?: number;
    },
  ): Promise<ManagedDocument>;
  setTechnicalStatus(
    documentId: string,
    technicalStatus: DocumentApprovalStatus,
    actorId: string,
  ): Promise<ManagedDocument>;
  unlinkModule(
    documentId: string,
    moduleId: string,
    actorId: string,
  ): Promise<void>;
  updateMetadata(
    documentId: string,
    patch: DocumentMetadataPatch,
    actorId: string,
  ): Promise<ManagedDocument>;
  uploadPdf(
    storagePath: string,
    content: Buffer,
    contentType?: string,
  ): Promise<void>;
}
