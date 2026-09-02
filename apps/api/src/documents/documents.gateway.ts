import type {
  DocumentMetadata,
  DocumentLibraryPage,
  DocumentLibrarySort,
  DocumentPublicationFilter,
  DocumentSituation,
  DocumentTechnicalStatus,
  ManagedDocument,
  StoredDocumentVersion,
} from './domain/document';

export interface DocumentLibraryQuery {
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

export interface CreateDocumentRecord {
  actorId: string;
  articleReference?: string | null;
  documentId: string;
  documentType: string;
  fileSizeBytes: number;
  issuanceYear?: number | null;
  issuingEntity?: string | null;
  metadata: DocumentMetadata;
  moduleIds: string[];
  originalFileName: string;
  pageCount: number;
  resolutionNumber?: string | null;
  sha256: string;
  storagePath: string;
  title: string;
  versionId: string;
}

export interface AddDocumentVersionRecord {
  actorId: string;
  documentId: string;
  fileSizeBytes: number;
  originalFileName: string;
  pageCount: number;
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
      observation?: string;
      reason?: string;
      replacementDate?: string;
      replacementDocumentId?: string;
      replacementYear?: number;
    },
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
  uploadPdf(storagePath: string, content: Buffer): Promise<void>;
}
