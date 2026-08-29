import { z } from "zod";

const timestampSchema = z
  .string()
  .refine(
    (value) => !Number.isNaN(Date.parse(value)),
    "Expected an ISO-compatible timestamp.",
  );

const jsonObjectSchema = z.record(z.string(), z.unknown());

const accountStatusSchema = z.enum(["active", "suspended"]);
const userRoleSchema = z.enum(["docente", "admin", "superadmin"]);

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
  publicationStatus: z.enum(["active", "inactive"]),
  resolutionNumber: z.string().nullable(),
  title: z.string(),
  updatedAt: timestampSchema,
  updatedBy: z.string().uuid().nullable(),
});

export type ManagedDocument = z.infer<typeof managedDocumentSchema>;

export const managedDocumentVersionSchema = z.object({
  fileSizeBytes: z.number().int().positive(),
  id: z.string().uuid(),
  ingestionStatus: z.enum(["failed", "indexed", "pending", "processing"]),
  ingestionUpdatedAt: timestampSchema,
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

export const operationalMetricsSchema = z.object({
  activeDocuments: z.number().int().nonnegative(),
  activeModules: z.number().int().nonnegative(),
  dismissedUnansweredQuestions: z.number().int().nonnegative(),
  pendingIngestionJobs: z.number().int().nonnegative(),
  pendingUnansweredQuestions: z.number().int().nonnegative(),
  providerCostStatus: z.literal("not_configured"),
  resolvedUnansweredQuestions: z.number().int().nonnegative(),
  totalConversations: z.number().int().nonnegative(),
  totalUsers: z.number().int().nonnegative(),
});

export type OperationalMetrics = z.infer<typeof operationalMetricsSchema>;

export const unansweredQuestionSchema = z.object({
  category: z
    .enum([
      "documentation_gap",
      "module_configuration",
      "outside_scope",
      "duplicate",
      "other",
    ])
    .nullable(),
  conversationId: z.string().uuid().nullable(),
  createdAt: timestampSchema,
  id: z.string().uuid(),
  messageId: z.string().uuid().nullable(),
  question: z.string().min(1).max(8_000),
  reason: z.enum(["ambiguous_request", "insufficient_evidence"]),
  reviewedAt: timestampSchema.nullable(),
  reviewedBy: z.string().uuid().nullable(),
  reviewNote: z.string().nullable(),
  selectedModuleId: z.string().uuid().nullable(),
  status: z.enum(["pending_review", "resolved", "dismissed"]),
  topRelevanceScore: z.number().min(0).max(1).nullable(),
});

export type UnansweredQuestion = z.infer<typeof unansweredQuestionSchema>;

export const administrativeUserSchema = z.object({
  accountStatus: accountStatusSchema,
  fullName: z.string().min(1).max(255),
  id: z.string().uuid(),
  lastAccessAt: timestampSchema.nullable(),
  role: userRoleSchema,
});

export type AdministrativeUser = z.infer<typeof administrativeUserSchema>;

export const operationalAuditEventSchema = z.object({
  action: z.enum([
    "chat_history_deleted",
    "unanswered_question_reviewed",
    "user_role_changed",
    "user_status_changed",
  ]),
  actorId: z.string().uuid(),
  actorRole: userRoleSchema,
  id: z.string().uuid(),
  metadata: jsonObjectSchema,
  occurredAt: timestampSchema,
  resourceId: z.string().uuid(),
  resourceType: z.enum(["chat_conversation", "unanswered_question", "profile"]),
});

export type OperationalAuditEvent = z.infer<typeof operationalAuditEventSchema>;
