export type ConsultationPeriod = 'today' | 'week' | 'month';
export type ConsultationCaseKind =
  'automatic_alert' | 'teacher_report' | 'teacher_suggestion';
export type ConsultationCaseStatus =
  'pending' | 'in_review' | 'resolved' | 'discarded';
export type ConsultationCaseIssue =
  | 'support_insufficient'
  | 'support_partial'
  | 'stale_document'
  | 'citation_insufficient'
  | 'possible_contradiction'
  | 'low_confidence'
  | 'technical_error'
  | 'ambiguous_request'
  | 'teacher_report'
  | 'teacher_suggestion';
export type ConsultationReportReason =
  | 'answer_not_relevant'
  | 'information_outdated'
  | 'citation_does_not_support'
  | 'missing_information'
  | 'answer_unclear'
  | 'other';
export type ConsultationAttachmentDisposition =
  'pending_review' | 'incorporated' | 'not_incorporated';

export interface ConsultationRanking {
  count: number;
  id: string;
  moduleId?: string;
  moduleName?: string;
  name: string;
}

export interface ConsultationReportsDashboard {
  answersWithIncidents: number;
  consultationModules: ConsultationRanking[];
  consultationSubmodules: ConsultationRanking[];
  documentsSuggested: number;
  incidentModules: ConsultationRanking[];
  incidentSubmodules: ConsultationRanking[];
  noSupport: number;
  period: ConsultationPeriod;
  periodEnd: string;
  periodStart: string;
  teacherReports: number;
  teacherSuggestions: number;
  topConsultedModule: ConsultationRanking | null;
  topConsultedSubmodule: ConsultationRanking | null;
  topIncidentModule: ConsultationRanking | null;
  topIncidentSubmodule: ConsultationRanking | null;
  totalQuestions: number;
}

export interface ConsultationTopic {
  count: number;
  id: string;
  moduleId: string;
  moduleName: string;
  name: string;
  topicKind: 'module' | 'submodule';
}

export interface ConsultationReviewPriority {
  answerSnapshot: string | null;
  answerMessageId: string;
  caseId: string;
  createdAt: string;
  detectedModuleName: string | null;
  detectedSubmoduleName: string | null;
  issueTypes: ConsultationCaseIssue[];
  openCaseCount: number;
  priority: 'critical' | 'high' | 'medium';
  questionSnapshot: string | null;
  reviewExcerpt: string | null;
}

export interface ConsultationCaseSummary {
  answerSnapshot: string | null;
  attachmentCount: number;
  conversationId: string | null;
  createdAt: string;
  detectedModuleId: string | null;
  detectedModuleName: string | null;
  detectedSubmoduleId: string | null;
  detectedSubmoduleName: string | null;
  id: string;
  issueType: ConsultationCaseIssue;
  kind: ConsultationCaseKind;
  linkedDocumentCount: number;
  questionSnapshot: string | null;
  reportReason: ConsultationReportReason | null;
  reporterComment: string | null;
  requestedModuleId: string | null;
  requestedModuleName: string | null;
  reviewExcerpt: string | null;
  sourceCount: number;
  status: ConsultationCaseStatus;
  topRelevanceScore: number | null;
  totalCount: number;
  updatedAt: string;
}

export interface ConsultationCaseDetail {
  attachments: Array<{
    attachmentKind: 'report_image' | 'suggestion_file';
    createdAt: string;
    disposition: ConsultationAttachmentDisposition;
    fileSizeBytes: number;
    id: string;
    incorporatedDocumentId: string | null;
    mimeType: string;
    originalFileName: string;
    sha256: string;
  }>;
  case: Omit<
    ConsultationCaseSummary,
    'attachmentCount' | 'linkedDocumentCount' | 'sourceCount' | 'totalCount'
  > & {
    consultationTurnId: string | null;
    retrievalScope: 'archived_explicit' | 'current' | 'historical' | null;
    snapshotComplete: boolean;
  };
  events: Array<{
    actorId: string | null;
    actorName: string | null;
    createdAt: string;
    eventType: string;
    id: string;
    metadata: Record<string, unknown>;
    note: string | null;
  }>;
  linkedDocuments: Array<{
    id: string;
    linkedAt: string;
    linkedBy: string;
    publicationStatus: 'active' | 'inactive';
    situation: 'archived' | 'current' | 'replaced';
    title: string;
  }>;
  sources: Array<{
    articleReference: string | null;
    documentId: string | null;
    documentSituation: 'archived' | 'current' | 'replaced';
    documentTitle: string;
    documentVersionId: string | null;
    evidenceExcerpt: string | null;
    id: string;
    numeralReference: string | null;
    pageEnd: number;
    pageStart: number;
    relevanceScore: number;
    rootModuleId: string | null;
    sectionTitle: string | null;
    sourceRank: number;
    submoduleId: string | null;
    versionNumber: number;
  }>;
}

export interface ConsultationCasesGateway {
  authorizeTeacherAttachment(input: {
    attachmentKind: 'report_image' | 'suggestion_file';
    caseId: string;
    userId: string;
  }): Promise<void>;
  createAttachmentDownloadUrl(input: {
    attachmentId: string;
    caseId: string;
    download: boolean;
    reviewerId: string;
    ttlSeconds: number;
  }): Promise<{ expiresAt: string; url: string }>;
  createTeacherCase(input: {
    answerMessageId: string | null;
    comment: string | null;
    conversationId: string | null;
    kind: 'teacher_report' | 'teacher_suggestion';
    reportReason: ConsultationReportReason | null;
    submissionId: string;
    userId: string;
  }): Promise<{ caseId: string }>;
  decideAttachment(input: {
    attachmentId: string;
    caseId: string;
    disposition: 'incorporated' | 'not_incorporated';
    documentId: string | null;
    note: string | null;
    reviewerId: string;
  }): Promise<void>;
  getCaseDetail(input: {
    caseId: string;
    reviewerId: string;
  }): Promise<ConsultationCaseDetail>;
  getDashboard(input: {
    period: ConsultationPeriod;
    reviewerId: string;
  }): Promise<ConsultationReportsDashboard>;
  getReviewPriorities(input: {
    limit: number;
    period: ConsultationPeriod;
    reviewerId: string;
  }): Promise<ConsultationReviewPriority[]>;
  getTopics(input: {
    limit: number;
    period: ConsultationPeriod;
    reviewerId: string;
  }): Promise<ConsultationTopic[]>;
  linkDocument(input: {
    caseId: string;
    documentId: string;
    reviewerId: string;
  }): Promise<void>;
  listCases(input: {
    issueType?: ConsultationCaseIssue;
    kind?: ConsultationCaseKind;
    limit: number;
    moduleId?: string;
    offset: number;
    period: ConsultationPeriod;
    query?: string;
    reviewerId: string;
    status?: ConsultationCaseStatus;
    submoduleId?: string;
  }): Promise<ConsultationCaseSummary[]>;
  registerTeacherAttachment(input: {
    attachmentKind: 'report_image' | 'suggestion_file';
    caseId: string;
    fileSizeBytes: number;
    mimeType: string;
    originalFileName: string;
    sha256: string;
    storagePath: string;
    userId: string;
  }): Promise<{ attachmentId: string }>;
  removeAttachment(storagePath: string): Promise<void>;
  unlinkDocument(input: {
    caseId: string;
    documentId: string;
    reviewerId: string;
  }): Promise<void>;
  updateCase(input: {
    caseId: string;
    changeRouting: boolean;
    detectedModuleId: string | null;
    detectedSubmoduleId: string | null;
    note: string | null;
    reviewerId: string;
    status: ConsultationCaseStatus | null;
  }): Promise<void>;
  uploadAttachment(input: {
    content: Buffer;
    mimeType: string;
    storagePath: string;
  }): Promise<void>;
}
