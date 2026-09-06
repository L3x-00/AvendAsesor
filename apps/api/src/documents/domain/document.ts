import { z } from 'zod';
import type {
  ArchiveReasonCode,
  DocumentApprovalStatus,
} from '../document-governance.constants';

export type DocumentMetadata = Record<string, unknown>;
export type DocumentPublicationFilter = 'active' | 'all' | 'inactive';
export type DocumentPublicationStatus = 'active' | 'inactive';
export type DocumentSituation = 'archived' | 'current' | 'replaced';
export type DocumentIngestionStatus =
  'failed' | 'indexed' | 'pending' | 'processing';
export type DocumentTechnicalStatus = 'error' | 'pending_approval' | 'ready';
export type DocumentLibrarySort =
  | 'document_type'
  | 'issuing_entity'
  | 'module'
  | 'newest'
  | 'oldest'
  | 'situation'
  | 'technical_status'
  | 'title'
  | 'upload_date'
  | 'year';

export interface ManagedDocument {
  additionalDetail: string | null;
  approvalStatus: DocumentApprovalStatus;
  approvalUpdatedAt: string;
  approvalUpdatedBy: string | null;
  approvedVersionId: string | null;
  articleReference: string | null;
  archiveObservation: string | null;
  archiveReasonCode: ArchiveReasonCode | null;
  archiveReasonDetail: string | null;
  createdAt: string;
  createdBy: string | null;
  currentVersionId: string | null;
  deactivatedAt: string | null;
  deactivatedBy: string | null;
  deactivationReason: string | null;
  deletedAt: string | null;
  deletedBy: string | null;
  deletionReason: string | null;
  documentType: string;
  documentTypeOther: string | null;
  id: string;
  isDeleted: boolean;
  issuanceYear: number | null;
  issuingEntity: string | null;
  issuingEntityOther: string | null;
  metadata: DocumentMetadata;
  publicationStatus: DocumentPublicationStatus;
  replacementDate: string | null;
  replacementDocumentId: string | null;
  replacementObservation: string | null;
  replacementReason: string | null;
  replacementYear: number | null;
  resolutionNumber: string | null;
  keywords: string | null;
  situation: DocumentSituation;
  specificDependency: string | null;
  title: string;
  updatedAt: string;
  updatedBy: string | null;
}

export interface ManagedDocumentVersion {
  fileSizeBytes: number;
  id: string;
  ingestionStatus: DocumentIngestionStatus;
  ingestionUpdatedAt: string;
  originalFileName: string;
  pageCount: number;
  uploadedAt: string;
  uploadedBy: string | null;
  uploadedByName: string | null;
  versionNumber: number;
}

export interface StoredDocumentVersion extends Omit<
  ManagedDocumentVersion,
  'uploadedByName'
> {
  mimeType: 'application/pdf';
  sha256: string;
  storageBucket: 'normative-documents';
  storagePath: string;
}

export interface ManagedDocumentDetails extends ManagedDocument {
  auditEvents: DocumentAuditEvent[];
  createdByName: string | null;
  moduleIds: string[];
  versions: ManagedDocumentVersion[];
}

export interface DocumentAuditEvent {
  action: string;
  actorName: string | null;
  details: DocumentMetadata;
  id: string;
  occurredAt: string;
  versionId: string | null;
}

export interface StoredDocumentAuditEvent extends Omit<
  DocumentAuditEvent,
  'actorName'
> {
  actorId: string | null;
}

export interface DocumentModuleAssociation {
  linkedModuleId: string;
  linkedModuleName: string;
  moduleId: string;
  moduleName: string;
  submoduleId: string | null;
  submoduleName: string | null;
}

export interface DocumentLibraryItem {
  additionalDetail: string | null;
  articleReference: string | null;
  createdAt: string;
  createdBy: string | null;
  createdByName: string | null;
  currentVersionId: string | null;
  currentVersionUploadedAt: string | null;
  documentType: string;
  documentTypeOther: string | null;
  id: string;
  issuanceYear: number | null;
  issuingEntity: string | null;
  issuingEntityOther: string | null;
  metadata: DocumentMetadata;
  moduleAssociations: DocumentModuleAssociation[];
  publicationStatus: DocumentPublicationStatus;
  replacementDate: string | null;
  replacementDocumentId: string | null;
  replacementObservation: string | null;
  replacementReason: string | null;
  replacementYear: number | null;
  resolutionNumber: string | null;
  keywords: string | null;
  situation: DocumentSituation;
  specificDependency: string | null;
  technicalStatus: DocumentTechnicalStatus;
  title: string;
  updatedAt: string;
  updatedBy: string | null;
}

export interface DocumentLibraryPage {
  items: DocumentLibraryItem[];
  limit: number;
  offset: number;
  total: number;
}

const metadataSchema = z
  .record(z.string(), z.unknown())
  .transform((metadata) => metadata as DocumentMetadata);

const timestampSchema = z
  .string()
  .refine(
    (value) => !Number.isNaN(Date.parse(value)),
    'Expected an ISO-compatible timestamp.',
  );

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const documentRowSchema = z.object({
  approval_status: z
    .enum(['pending_approval', 'ready'])
    .optional()
    .default('pending_approval'),
  approval_updated_at: timestampSchema.optional(),
  approval_updated_by: z.string().uuid().nullable().optional().default(null),
  approved_version_id: z.string().uuid().nullable().optional().default(null),
  article_reference: z.string().nullable(),
  archive_observation: z.string().nullable().optional().default(null),
  archive_reason_code: z
    .enum([
      'NOT_APPLICABLE',
      'DEROGATED_OR_EXPIRED',
      'DUPLICATE',
      'UPLOADED_BY_ERROR',
      'INCOMPLETE_INFORMATION',
      'PENDING_VALIDATION',
      'HISTORICAL_ANTECEDENT',
      'REPLACED_BY_NEWER',
      'OTHER',
    ])
    .nullable()
    .optional()
    .default(null),
  archive_reason_detail: z.string().nullable().optional().default(null),
  created_at: timestampSchema,
  created_by: z.string().uuid().nullable(),
  current_version_id: z.string().uuid().nullable(),
  deactivated_at: timestampSchema.nullable(),
  deactivated_by: z.string().uuid().nullable(),
  deactivation_reason: z.string().nullable(),
  deleted_at: timestampSchema.nullable(),
  deleted_by: z.string().uuid().nullable(),
  deletion_reason: z.string().nullable(),
  document_type: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/),
  id: z.string().uuid(),
  is_deleted: z.boolean(),
  issuance_year: z.number().int().nullable(),
  issuing_entity: z.string().nullable(),
  metadata: metadataSchema,
  publication_status: z.enum(['active', 'inactive']),
  replacement_date: dateSchema.nullable(),
  replacement_document_id: z.string().uuid().nullable(),
  replacement_observation: z.string().nullable(),
  replacement_reason: z.string().nullable(),
  replacement_year: z.number().int().nullable(),
  resolution_number: z.string().nullable(),
  situation: z.enum(['archived', 'current', 'replaced']),
  title: z.string(),
  updated_at: timestampSchema,
  updated_by: z.string().uuid().nullable(),
});

const storedDocumentVersionRowSchema = z.object({
  document_id: z.string().uuid(),
  file_size_bytes: z.number().int().positive(),
  id: z.string().uuid(),
  ingestion_status: z.enum(['failed', 'indexed', 'pending', 'processing']),
  ingestion_updated_at: timestampSchema,
  mime_type: z.literal('application/pdf'),
  original_file_name: z.string().min(1),
  page_count: z.number().int().min(1).max(300),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  storage_bucket: z.literal('normative-documents'),
  storage_path: z.string().min(1),
  uploaded_at: timestampSchema,
  uploaded_by: z.string().uuid().nullable(),
  version_number: z.number().int().positive(),
});

export function toManagedDocument(value: unknown): ManagedDocument {
  const result = documentRowSchema.safeParse(value);

  if (!result.success) {
    throw new Error('Document data returned by the store is invalid.');
  }

  return {
    additionalDetail: metadataText(result.data.metadata, 'additionalDetail'),
    approvalStatus: result.data.approval_status,
    approvalUpdatedAt:
      result.data.approval_updated_at ?? result.data.updated_at,
    approvalUpdatedBy: result.data.approval_updated_by,
    approvedVersionId: result.data.approved_version_id,
    articleReference: result.data.article_reference,
    archiveObservation: result.data.archive_observation,
    archiveReasonCode: result.data.archive_reason_code,
    archiveReasonDetail: result.data.archive_reason_detail,
    createdAt: result.data.created_at,
    createdBy: result.data.created_by,
    currentVersionId: result.data.current_version_id,
    deactivatedAt: result.data.deactivated_at,
    deactivatedBy: result.data.deactivated_by,
    deactivationReason: result.data.deactivation_reason,
    deletedAt: result.data.deleted_at,
    deletedBy: result.data.deleted_by,
    deletionReason: result.data.deletion_reason,
    documentType: result.data.document_type,
    documentTypeOther: metadataText(result.data.metadata, 'documentTypeOther'),
    id: result.data.id,
    isDeleted: result.data.is_deleted,
    issuanceYear: result.data.issuance_year,
    issuingEntity: result.data.issuing_entity,
    issuingEntityOther: metadataText(
      result.data.metadata,
      'issuingEntityOther',
    ),
    metadata: result.data.metadata,
    publicationStatus: result.data.publication_status,
    replacementDate: result.data.replacement_date,
    replacementDocumentId: result.data.replacement_document_id,
    replacementObservation: result.data.replacement_observation,
    replacementReason: result.data.replacement_reason,
    replacementYear: result.data.replacement_year,
    resolutionNumber: result.data.resolution_number,
    keywords: metadataText(result.data.metadata, 'keywords'),
    situation: result.data.situation,
    specificDependency: metadataText(
      result.data.metadata,
      'specificDependency',
    ),
    title: result.data.title,
    updatedAt: result.data.updated_at,
    updatedBy: result.data.updated_by,
  };
}

export function toStoredDocumentVersion(value: unknown): StoredDocumentVersion {
  const result = storedDocumentVersionRowSchema.safeParse(value);

  if (!result.success) {
    throw new Error('Document version data returned by the store is invalid.');
  }

  return {
    fileSizeBytes: result.data.file_size_bytes,
    id: result.data.id,
    ingestionStatus: result.data.ingestion_status,
    ingestionUpdatedAt: result.data.ingestion_updated_at,
    mimeType: result.data.mime_type,
    originalFileName: result.data.original_file_name,
    pageCount: result.data.page_count,
    sha256: result.data.sha256,
    storageBucket: result.data.storage_bucket,
    storagePath: result.data.storage_path,
    uploadedAt: result.data.uploaded_at,
    uploadedBy: result.data.uploaded_by,
    versionNumber: result.data.version_number,
  };
}

export function toManagedDocumentVersion(
  version: StoredDocumentVersion,
  uploadedByName: string | null = null,
): ManagedDocumentVersion {
  return {
    fileSizeBytes: version.fileSizeBytes,
    id: version.id,
    ingestionStatus: version.ingestionStatus,
    ingestionUpdatedAt: version.ingestionUpdatedAt,
    originalFileName: version.originalFileName,
    pageCount: version.pageCount,
    uploadedAt: version.uploadedAt,
    uploadedBy: version.uploadedBy,
    uploadedByName,
    versionNumber: version.versionNumber,
  };
}

const documentAuditEventRowSchema = z.object({
  action: z.string().min(1),
  actor_id: z.string().uuid().nullable(),
  details: metadataSchema,
  document_version_id: z.string().uuid().nullable(),
  id: z.string().uuid(),
  occurred_at: timestampSchema,
});

export function toDocumentAuditEvent(
  value: unknown,
  actorName: string | null,
): DocumentAuditEvent {
  const result = documentAuditEventRowSchema.safeParse(value);

  if (!result.success) {
    throw new Error(
      'Document audit event data returned by the store is invalid.',
    );
  }

  return {
    action: result.data.action,
    actorName,
    details: result.data.details,
    id: result.data.id,
    occurredAt: result.data.occurred_at,
    versionId: result.data.document_version_id,
  };
}

export function toStoredDocumentAuditEvent(
  value: unknown,
): StoredDocumentAuditEvent {
  const result = documentAuditEventRowSchema.safeParse(value);

  if (!result.success) {
    throw new Error(
      'Document audit event data returned by the store is invalid.',
    );
  }

  return {
    action: result.data.action,
    actorId: result.data.actor_id,
    details: result.data.details,
    id: result.data.id,
    occurredAt: result.data.occurred_at,
    versionId: result.data.document_version_id,
  };
}

const moduleAssociationRowSchema = z.object({
  linked_module_id: z.string().uuid(),
  linked_module_name: z.string().min(1),
  module_id: z.string().uuid(),
  module_name: z.string().min(1),
  submodule_id: z.string().uuid().nullable(),
  submodule_name: z.string().nullable(),
});

const libraryRowSchema = z.object({
  article_reference: z.string().nullable(),
  created_at: timestampSchema,
  created_by: z.string().uuid().nullable(),
  created_by_name: z.string().nullable(),
  current_version_id: z.string().uuid().nullable(),
  current_version_ingestion_status: z
    .enum(['failed', 'indexed', 'pending', 'processing'])
    .nullable(),
  current_version_uploaded_at: timestampSchema.nullable(),
  document_type: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/),
  id: z.string().uuid(),
  issuance_year: z.number().int().nullable(),
  issuing_entity: z.string().nullable(),
  metadata: metadataSchema,
  module_associations: z.array(moduleAssociationRowSchema),
  publication_status: z.enum(['active', 'inactive']),
  replacement_date: dateSchema.nullable(),
  replacement_document_id: z.string().uuid().nullable(),
  replacement_observation: z.string().nullable(),
  replacement_reason: z.string().nullable(),
  replacement_year: z.number().int().nullable(),
  resolution_number: z.string().nullable(),
  situation: z.enum(['archived', 'current', 'replaced']),
  title: z.string(),
  total_count: z.union([z.number().int(), z.string().regex(/^\d+$/)]),
  updated_at: timestampSchema,
  updated_by: z.string().uuid().nullable(),
});

export interface ParsedDocumentLibraryRow {
  item: DocumentLibraryItem;
  total: number;
}

export function toDocumentLibraryRow(value: unknown): ParsedDocumentLibraryRow {
  const result = libraryRowSchema.safeParse(value);

  if (!result.success) {
    throw new Error('Document library data returned by the store is invalid.');
  }

  const ingestionStatus = result.data.current_version_ingestion_status;
  const technicalStatus: DocumentTechnicalStatus =
    ingestionStatus === 'indexed'
      ? 'ready'
      : ingestionStatus === 'failed' || ingestionStatus === null
        ? 'error'
        : 'pending_approval';

  return {
    item: {
      additionalDetail: metadataText(result.data.metadata, 'additionalDetail'),
      articleReference: result.data.article_reference,
      createdAt: result.data.created_at,
      createdBy: result.data.created_by,
      createdByName: result.data.created_by_name,
      currentVersionId: result.data.current_version_id,
      currentVersionUploadedAt: result.data.current_version_uploaded_at,
      documentType: result.data.document_type,
      documentTypeOther: metadataText(
        result.data.metadata,
        'documentTypeOther',
      ),
      id: result.data.id,
      issuanceYear: result.data.issuance_year,
      issuingEntity: result.data.issuing_entity,
      issuingEntityOther: metadataText(
        result.data.metadata,
        'issuingEntityOther',
      ),
      metadata: result.data.metadata,
      moduleAssociations: result.data.module_associations.map(
        (association) => ({
          linkedModuleId: association.linked_module_id,
          linkedModuleName: association.linked_module_name,
          moduleId: association.module_id,
          moduleName: association.module_name,
          submoduleId: association.submodule_id,
          submoduleName: association.submodule_name,
        }),
      ),
      publicationStatus: result.data.publication_status,
      replacementDate: result.data.replacement_date,
      replacementDocumentId: result.data.replacement_document_id,
      replacementObservation: result.data.replacement_observation,
      replacementReason: result.data.replacement_reason,
      replacementYear: result.data.replacement_year,
      resolutionNumber: result.data.resolution_number,
      keywords: metadataText(result.data.metadata, 'keywords'),
      situation: result.data.situation,
      specificDependency: metadataText(
        result.data.metadata,
        'specificDependency',
      ),
      technicalStatus,
      title: result.data.title,
      updatedAt: result.data.updated_at,
      updatedBy: result.data.updated_by,
    },
    total: Number(result.data.total_count),
  };
}

function metadataText(metadata: DocumentMetadata, key: string): string | null {
  const value = metadata[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
