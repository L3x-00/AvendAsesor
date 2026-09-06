import { z } from "zod";

const timestampSchema = z
  .string()
  .refine(
    (value) => !Number.isNaN(Date.parse(value)),
    "Expected an ISO timestamp.",
  );
const uuid = z.string().uuid();
const rankingSchema = z.object({
  count: z.number().int().nonnegative(),
  id: uuid,
  moduleId: uuid.optional(),
  moduleName: z.string().optional(),
  name: z.string(),
});

export const consultationCaseStatusSchema = z.enum([
  "pending",
  "in_review",
  "resolved",
  "discarded",
]);
export type ConsultationCaseStatus = z.infer<
  typeof consultationCaseStatusSchema
>;

export const consultationCaseKindSchema = z.enum([
  "automatic_alert",
  "teacher_report",
  "teacher_suggestion",
]);
export type ConsultationCaseKind = z.infer<typeof consultationCaseKindSchema>;

export const consultationCaseIssueSchema = z.enum([
  "support_insufficient",
  "support_partial",
  "stale_document",
  "citation_insufficient",
  "possible_contradiction",
  "low_confidence",
  "technical_error",
  "ambiguous_request",
  "teacher_report",
  "teacher_suggestion",
]);
export type ConsultationCaseIssue = z.infer<typeof consultationCaseIssueSchema>;

export const consultationPeriodSchema = z.enum(["today", "week", "month"]);
export type ConsultationPeriod = z.infer<typeof consultationPeriodSchema>;

export const consultationTopicSchema = z.object({
  count: z.number().int().nonnegative(),
  id: uuid,
  moduleId: uuid,
  moduleName: z.string(),
  name: z.string(),
  topicKind: z.enum(["module", "submodule"]),
});
export type ConsultationTopic = z.infer<typeof consultationTopicSchema>;

export const consultationReviewPrioritySchema = z.object({
  answerMessageId: uuid,
  answerSnapshot: z.string().max(20000).nullable(),
  caseId: uuid,
  createdAt: timestampSchema,
  detectedModuleName: z.string().nullable(),
  detectedSubmoduleName: z.string().nullable(),
  issueTypes: z.array(consultationCaseIssueSchema).min(1),
  openCaseCount: z.number().int().positive(),
  priority: z.enum(["critical", "high", "medium"]),
  questionSnapshot: z.string().max(8000).nullable(),
  reviewExcerpt: z.string().max(2000).nullable(),
});
export type ConsultationReviewPriority = z.infer<
  typeof consultationReviewPrioritySchema
>;

export const consultationReportsDashboardSchema = z.object({
  answersWithIncidents: z.number().int().nonnegative(),
  consultationModules: z.array(rankingSchema),
  consultationSubmodules: z.array(rankingSchema),
  documentsSuggested: z.number().int().nonnegative(),
  incidentModules: z.array(rankingSchema),
  incidentSubmodules: z.array(rankingSchema),
  noSupport: z.number().int().nonnegative(),
  period: consultationPeriodSchema,
  periodEnd: timestampSchema,
  periodStart: timestampSchema,
  teacherReports: z.number().int().nonnegative(),
  teacherSuggestions: z.number().int().nonnegative(),
  topConsultedModule: rankingSchema.nullable(),
  topConsultedSubmodule: rankingSchema.nullable(),
  topIncidentModule: rankingSchema.nullable(),
  topIncidentSubmodule: rankingSchema.nullable(),
  totalQuestions: z.number().int().nonnegative(),
});
export type ConsultationReportsDashboard = z.infer<
  typeof consultationReportsDashboardSchema
>;

export const consultationCaseSummarySchema = z.object({
  answerSnapshot: z.string().max(20000).nullable(),
  attachmentCount: z.number().int().nonnegative(),
  conversationId: uuid.nullable(),
  createdAt: timestampSchema,
  detectedModuleId: uuid.nullable(),
  detectedModuleName: z.string().nullable(),
  detectedSubmoduleId: uuid.nullable(),
  detectedSubmoduleName: z.string().nullable(),
  id: uuid,
  issueType: consultationCaseIssueSchema,
  kind: consultationCaseKindSchema,
  linkedDocumentCount: z.number().int().nonnegative(),
  questionSnapshot: z.string().max(8000).nullable(),
  reportReason: z
    .enum([
      "answer_not_relevant",
      "information_outdated",
      "citation_does_not_support",
      "missing_information",
      "answer_unclear",
      "other",
    ])
    .nullable(),
  reporterComment: z.string().max(2000).nullable(),
  requestedModuleId: uuid.nullable(),
  requestedModuleName: z.string().nullable(),
  reviewExcerpt: z.string().max(2000).nullable(),
  sourceCount: z.number().int().nonnegative(),
  status: consultationCaseStatusSchema,
  topRelevanceScore: z.number().min(0).max(1).nullable(),
  totalCount: z.number().int().nonnegative(),
  updatedAt: timestampSchema,
});
export type ConsultationCaseSummary = z.infer<
  typeof consultationCaseSummarySchema
>;

const consultationCaseCoreSchema = consultationCaseSummarySchema
  .omit({
    attachmentCount: true,
    linkedDocumentCount: true,
    sourceCount: true,
    totalCount: true,
  })
  .extend({
    consultationTurnId: uuid.nullable(),
    retrievalScope: z
      .enum(["archived_explicit", "current", "historical"])
      .nullable(),
    snapshotComplete: z.boolean(),
  });

export const consultationCaseDetailSchema = z.object({
  attachments: z.array(
    z.object({
      attachmentKind: z.enum(["report_image", "suggestion_file"]),
      createdAt: timestampSchema,
      disposition: z.enum([
        "pending_review",
        "incorporated",
        "not_incorporated",
      ]),
      fileSizeBytes: z.number().int().positive(),
      id: uuid,
      incorporatedDocumentId: uuid.nullable(),
      mimeType: z.string(),
      originalFileName: z.string().min(1),
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
    }),
  ),
  case: consultationCaseCoreSchema,
  events: z.array(
    z.object({
      actorId: uuid.nullable(),
      actorName: z.string().nullable(),
      createdAt: timestampSchema,
      eventType: z.string(),
      id: uuid,
      metadata: z.record(z.string(), z.unknown()),
      note: z.string().nullable(),
    }),
  ),
  linkedDocuments: z.array(
    z.object({
      id: uuid,
      linkedAt: timestampSchema,
      linkedBy: uuid,
      publicationStatus: z.enum(["active", "inactive"]),
      situation: z.enum(["archived", "current", "replaced"]),
      title: z.string(),
    }),
  ),
  sources: z.array(
    z.object({
      articleReference: z.string().nullable(),
      documentId: uuid.nullable(),
      documentSituation: z.enum(["archived", "current", "replaced"]),
      documentTitle: z.string(),
      documentVersionId: uuid.nullable(),
      evidenceExcerpt: z.string().nullable(),
      id: uuid,
      numeralReference: z.string().nullable(),
      pageEnd: z.number().int().positive(),
      pageStart: z.number().int().positive(),
      relevanceScore: z.number().min(0).max(1),
      rootModuleId: uuid.nullable(),
      sectionTitle: z.string().nullable(),
      sourceRank: z.number().int().positive(),
      submoduleId: uuid.nullable(),
      versionNumber: z.number().int().positive(),
    }),
  ),
});
export type ConsultationCaseDetail = z.infer<
  typeof consultationCaseDetailSchema
>;

export const consultationAttachmentDownloadSchema = z.object({
  expiresAt: timestampSchema,
  url: z.string().url(),
});
