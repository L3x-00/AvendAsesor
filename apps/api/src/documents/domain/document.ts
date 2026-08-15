import { z } from 'zod';

export type DocumentMetadata = Record<string, unknown>;
export type DocumentPublicationFilter = 'active' | 'all' | 'inactive';
export type DocumentPublicationStatus = 'active' | 'inactive';

export interface ManagedDocument {
  articleReference: string | null;
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
  id: string;
  isDeleted: boolean;
  issuanceYear: number | null;
  issuingEntity: string | null;
  metadata: DocumentMetadata;
  publicationStatus: DocumentPublicationStatus;
  resolutionNumber: string | null;
  title: string;
  updatedAt: string;
  updatedBy: string | null;
}

export interface ManagedDocumentVersion {
  fileSizeBytes: number;
  id: string;
  originalFileName: string;
  pageCount: number;
  uploadedAt: string;
  uploadedBy: string | null;
  versionNumber: number;
}

export interface StoredDocumentVersion extends ManagedDocumentVersion {
  mimeType: 'application/pdf';
  sha256: string;
  storageBucket: 'normative-documents';
  storagePath: string;
}

export interface ManagedDocumentDetails extends ManagedDocument {
  moduleIds: string[];
  versions: ManagedDocumentVersion[];
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

const documentRowSchema = z.object({
  article_reference: z.string().nullable(),
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
  resolution_number: z.string().nullable(),
  title: z.string(),
  updated_at: timestampSchema,
  updated_by: z.string().uuid().nullable(),
});

const storedDocumentVersionRowSchema = z.object({
  document_id: z.string().uuid(),
  file_size_bytes: z.number().int().positive(),
  id: z.string().uuid(),
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
    articleReference: result.data.article_reference,
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
    id: result.data.id,
    isDeleted: result.data.is_deleted,
    issuanceYear: result.data.issuance_year,
    issuingEntity: result.data.issuing_entity,
    metadata: result.data.metadata,
    publicationStatus: result.data.publication_status,
    resolutionNumber: result.data.resolution_number,
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
): ManagedDocumentVersion {
  return {
    fileSizeBytes: version.fileSizeBytes,
    id: version.id,
    originalFileName: version.originalFileName,
    pageCount: version.pageCount,
    uploadedAt: version.uploadedAt,
    uploadedBy: version.uploadedBy,
    versionNumber: version.versionNumber,
  };
}
