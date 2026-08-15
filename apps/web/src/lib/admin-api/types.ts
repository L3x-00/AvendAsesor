import { z } from 'zod';

const timestampSchema = z.string().refine(
  (value) => !Number.isNaN(Date.parse(value)),
  'Expected an ISO-compatible timestamp.',
);

const jsonObjectSchema = z.record(z.string(), z.unknown());

export const managedModuleSchema = z.object({
  code: z.string(),
  createdAt: timestampSchema,
  createdBy: z.string().uuid().nullable(),
  deactivatedAt: timestampSchema.nullable(),
  deactivatedBy: z.string().uuid().nullable(),
  deactivationReason: z.string().nullable(),
  deletedAt: timestampSchema.nullable(),
  deletedBy: z.string().uuid().nullable(),
  deletionReason: z.string().nullable(),
  description: z.string().nullable(),
  id: z.string().uuid(),
  isActive: z.boolean(),
  isDeleted: z.boolean(),
  metadata: jsonObjectSchema,
  name: z.string(),
  parentModuleId: z.string().uuid().nullable(),
  sortOrder: z.number().int().nonnegative(),
  updatedAt: timestampSchema,
  updatedBy: z.string().uuid().nullable(),
});

export type ManagedModule = z.infer<typeof managedModuleSchema>;

export const managedDocumentSchema = z.object({
  articleReference: z.string().nullable(),
  createdAt: timestampSchema,
  createdBy: z.string().uuid().nullable(),
  currentVersionId: z.string().uuid().nullable(),
  deactivatedAt: timestampSchema.nullable(),
  deactivatedBy: z.string().uuid().nullable(),
  deactivationReason: z.string().nullable(),
  deletedAt: timestampSchema.nullable(),
  deletedBy: z.string().uuid().nullable(),
  deletionReason: z.string().nullable(),
  documentType: z.string(),
  id: z.string().uuid(),
  isDeleted: z.boolean(),
  issuanceYear: z.number().int().nullable(),
  issuingEntity: z.string().nullable(),
  metadata: jsonObjectSchema,
  publicationStatus: z.enum(['active', 'inactive']),
  resolutionNumber: z.string().nullable(),
  title: z.string(),
  updatedAt: timestampSchema,
  updatedBy: z.string().uuid().nullable(),
});

export type ManagedDocument = z.infer<typeof managedDocumentSchema>;

export const managedDocumentVersionSchema = z.object({
  fileSizeBytes: z.number().int().positive(),
  id: z.string().uuid(),
  originalFileName: z.string(),
  pageCount: z.number().int().min(1).max(300),
  uploadedAt: timestampSchema,
  uploadedBy: z.string().uuid().nullable(),
  versionNumber: z.number().int().positive(),
});

export type ManagedDocumentVersion = z.infer<
  typeof managedDocumentVersionSchema
>;

export const managedDocumentDetailsSchema = managedDocumentSchema.extend({
  moduleIds: z.array(z.string().uuid()),
  versions: z.array(managedDocumentVersionSchema),
});

export type ManagedDocumentDetails = z.infer<
  typeof managedDocumentDetailsSchema
>;

export const downloadUrlSchema = z.object({
  expiresAt: timestampSchema,
  url: z.string().url(),
  versionId: z.string().uuid(),
});

export type DownloadUrl = z.infer<typeof downloadUrlSchema>;
