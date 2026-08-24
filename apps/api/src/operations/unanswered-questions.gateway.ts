export type UnansweredQuestionStatus =
  'pending_review' | 'resolved' | 'dismissed';

export type UnansweredQuestionCategory =
  | 'documentation_gap'
  | 'module_configuration'
  | 'outside_scope'
  | 'duplicate'
  | 'other';

export interface UnansweredQuestion {
  category: UnansweredQuestionCategory | null;
  conversationId: string | null;
  createdAt: string;
  id: string;
  messageId: string | null;
  question: string;
  reason: 'ambiguous_request' | 'insufficient_evidence';
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
  selectedModuleId: string | null;
  status: UnansweredQuestionStatus;
  topRelevanceScore: number | null;
}

export interface Hito4OperationalMetrics {
  activeDocuments: number;
  activeModules: number;
  dismissedUnansweredQuestions: number;
  pendingIngestionJobs: number;
  pendingUnansweredQuestions: number;
  providerCostStatus: 'not_configured';
  resolvedUnansweredQuestions: number;
  totalConversations: number;
  totalUsers: number;
}

export interface OperationsGateway {
  getMetrics(input: { reviewerId: string }): Promise<Hito4OperationalMetrics>;
  listUnansweredQuestions(input: {
    limit: number;
    reviewerId: string;
    status: UnansweredQuestionStatus;
  }): Promise<UnansweredQuestion[]>;
  reviewUnansweredQuestion(input: {
    category: UnansweredQuestionCategory;
    decision: Exclude<UnansweredQuestionStatus, 'pending_review'>;
    questionId: string;
    reviewNote: string;
    reviewerId: string;
  }): Promise<void>;
}
