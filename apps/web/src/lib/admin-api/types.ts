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

export const managedModuleSummarySchema = managedModuleSchema.extend({
  documentCount: z.number().int().nonnegative(),
  submoduleCount: z.number().int().nonnegative(),
});

export type ManagedModuleSummary = z.infer<typeof managedModuleSummarySchema>;

export const adminModulePermissionSchema = z.object({
  canAccess: z.boolean(),
  fullName: z.string(),
  role: z.enum(["admin", "superadmin"]),
  updatedAt: timestampSchema.nullable(),
  updatedBy: z.string().uuid().nullable(),
  userId: z.string().uuid(),
});

export type AdminModulePermission = z.infer<typeof adminModulePermissionSchema>;

export const managedDocumentSchema = z.object({
  additionalDetail: z.string().nullable(),
  approvalStatus: z.enum(["pending_approval", "ready"]),
  approvalUpdatedAt: timestampSchema,
  approvalUpdatedBy: z.string().uuid().nullable(),
  approvedVersionId: z.string().uuid().nullable(),
  articleReference: z.string().nullable(),
  archiveObservation: z.string().nullable(),
  archiveReasonCode: z
    .enum([
      "NOT_APPLICABLE",
      "DEROGATED_OR_EXPIRED",
      "DUPLICATE",
      "UPLOADED_BY_ERROR",
      "INCOMPLETE_INFORMATION",
      "PENDING_VALIDATION",
      "HISTORICAL_ANTECEDENT",
      "REPLACED_BY_NEWER",
      "OTHER",
    ])
    .nullable(),
  archiveReasonDetail: z.string().nullable(),
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
  documentTypeOther: z.string().nullable(),
  id: z.string().uuid(),
  isDeleted: z.boolean(),
  issuanceYear: z.number().int().nullable(),
  issuingEntity: z.string().nullable(),
  issuingEntityOther: z.string().nullable(),
  metadata: jsonObjectSchema,
  publicationStatus: z.enum(["active", "inactive"]),
  replacementDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  replacementDocumentId: z.string().uuid().nullable(),
  replacementObservation: z.string().nullable(),
  replacementReason: z.string().nullable(),
  replacementYear: z.number().int().nullable(),
  resolutionNumber: z.string().nullable(),
  situation: z.enum(["archived", "current", "replaced"]),
  specificDependency: z.string().nullable(),
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
  uploadedByName: z.string().nullable(),
  versionNumber: z.number().int().positive(),
});

export type ManagedDocumentVersion = z.infer<
  typeof managedDocumentVersionSchema
>;

export const documentAuditEventSchema = z.object({
  action: z.string(),
  actorName: z.string().nullable(),
  details: jsonObjectSchema,
  id: z.string().uuid(),
  occurredAt: timestampSchema,
  versionId: z.string().uuid().nullable(),
});

export type DocumentAuditEvent = z.infer<typeof documentAuditEventSchema>;

export const managedDocumentDetailsSchema = managedDocumentSchema.extend({
  auditEvents: z.array(documentAuditEventSchema),
  createdByName: z.string().nullable(),
  moduleIds: z.array(z.string().uuid()),
  versions: z.array(managedDocumentVersionSchema),
});

export type ManagedDocumentDetails = z.infer<
  typeof managedDocumentDetailsSchema
>;

export const documentModuleAssociationSchema = z.object({
  linkedModuleId: z.string().uuid(),
  linkedModuleName: z.string(),
  moduleId: z.string().uuid(),
  moduleName: z.string(),
  submoduleId: z.string().uuid().nullable(),
  submoduleName: z.string().nullable(),
});
export type DocumentModuleAssociation = z.infer<
  typeof documentModuleAssociationSchema
>;

export const documentLibraryItemSchema = z.object({
  additionalDetail: z.string().nullable(),
  articleReference: z.string().nullable(),
  createdAt: timestampSchema,
  createdBy: z.string().uuid().nullable(),
  createdByName: z.string().nullable(),
  currentVersionId: z.string().uuid().nullable(),
  currentVersionUploadedAt: timestampSchema.nullable(),
  documentType: z.string(),
  documentTypeOther: z.string().nullable(),
  id: z.string().uuid(),
  issuanceYear: z.number().int().nullable(),
  issuingEntity: z.string().nullable(),
  issuingEntityOther: z.string().nullable(),
  metadata: jsonObjectSchema,
  moduleAssociations: z.array(documentModuleAssociationSchema),
  publicationStatus: z.enum(["active", "inactive"]),
  replacementDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  replacementDocumentId: z.string().uuid().nullable(),
  replacementObservation: z.string().nullable(),
  replacementReason: z.string().nullable(),
  replacementYear: z.number().int().nullable(),
  resolutionNumber: z.string().nullable(),
  situation: z.enum(["archived", "current", "replaced"]),
  specificDependency: z.string().nullable(),
  technicalStatus: z.enum(["error", "pending_approval", "ready"]),
  title: z.string(),
  updatedAt: timestampSchema,
  updatedBy: z.string().uuid().nullable(),
});

export const documentLibraryPageSchema = z.object({
  items: z.array(documentLibraryItemSchema),
  limit: z.number().int().min(1).max(100),
  offset: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export type DocumentLibraryItem = z.infer<typeof documentLibraryItemSchema>;
export type DocumentLibraryPage = z.infer<typeof documentLibraryPageSchema>;
export type DocumentSituation = ManagedDocument["situation"];
export type DocumentTechnicalStatus = DocumentLibraryItem["technicalStatus"];

export interface DocumentLibraryQuery {
  documentType?: string;
  issuanceYear?: number;
  issuingEntity?: string;
  limit?: number;
  moduleId?: string;
  offset?: number;
  q?: string;
  situation?: DocumentSituation;
  sort?:
    | "document_type"
    | "issuing_entity"
    | "module"
    | "newest"
    | "oldest"
    | "situation"
    | "technical_status"
    | "title"
    | "upload_date"
    | "year";
  submoduleId?: string;
  technicalStatus?: DocumentTechnicalStatus;
}

export const documentSuggestionsSchema = z.object({
  additionalDetails: z.array(z.string()),
  specificDependencies: z.array(z.string()),
});

export type DocumentSuggestions = z.infer<typeof documentSuggestionsSchema>;

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

export const adminHomeModuleNames = [
  "Contratación y desplazamientos",
  "Evaluación docente",
  "Situaciones administrativas",
  "Auxiliar de educación",
  "Ley y reglamento",
  "Cargos y plazas",
  "Remuneraciones",
] as const;

export const adminHomeModuleSummarySchema = z.object({
  documentCount: z.number().int().nonnegative(),
  id: z.uuid(),
  name: z.enum(adminHomeModuleNames),
  submoduleCount: z.number().int().nonnegative(),
});

export const adminHomeDashboardSchema = z
  .object({
    activeModules: z.number().int().nonnegative(),
    activeSubmodules: z.number().int().nonnegative(),
    activeUsers: z.number().int().nonnegative(),
    aiQueriesProcessed: z.number().int().nonnegative(),
    expiredUsers: z.number().int().nonnegative(),
    expiringSoonUsers: z.number().int().nonnegative(),
    expiryWindowDays: z.literal(7),
    moduleSummaries: z.array(adminHomeModuleSummarySchema).length(7),
    totalDocuments: z.number().int().nonnegative(),
    totalQueries: z.number().int().nonnegative(),
    totalUsers: z.number().int().nonnegative(),
  })
  .superRefine((dashboard, context) => {
    dashboard.moduleSummaries.forEach((module, index) => {
      if (module.name !== adminHomeModuleNames[index]) {
        context.addIssue({
          code: "custom",
          message: "Administrative home modules are not in canonical order.",
          path: ["moduleSummaries", index, "name"],
        });
      }
    });

    if (dashboard.activeUsers > dashboard.totalUsers) {
      context.addIssue({
        code: "custom",
        message: "Active users cannot exceed registered users.",
        path: ["activeUsers"],
      });
    }

    if (dashboard.expiringSoonUsers > dashboard.activeUsers) {
      context.addIssue({
        code: "custom",
        message: "Expiring users must be a subset of active users.",
        path: ["expiringSoonUsers"],
      });
    }
  });

export type AdminHomeDashboard = z.infer<typeof adminHomeDashboardSchema>;
export type AdminHomeModuleSummary = z.infer<
  typeof adminHomeModuleSummarySchema
>;

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

export const administrativeUserPageSchema = z.object({
  items: administrativeUserSchema.array(),
  limit: z.number().int().min(1).max(100),
  offset: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export type AdministrativeUserPage = z.infer<
  typeof administrativeUserPageSchema
>;

export interface AdministrativeUserQuery {
  group?: "docente" | "staff";
  limit?: number;
  offset?: number;
  search?: string;
  status?: AdministrativeUser["accountStatus"];
}

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
