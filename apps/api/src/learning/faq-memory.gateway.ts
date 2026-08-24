export type FaqMemoryReviewStatus =
  'pending_review' | 'approved' | 'rejected' | 'suppressed';

export interface FaqMemoryCandidate {
  ambiguousCount: number;
  evidenceCount: number;
  firstSeenAt: string;
  id: string;
  lastSeenAt: string;
  noEvidenceCount: number;
  occurrenceCount: number;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewLabel: string | null;
  selectedModuleId: string | null;
  status: FaqMemoryReviewStatus;
}

export interface FaqMemoryQualitySummary {
  ambiguousObservations: number;
  approvedCandidates: number;
  evidenceObservations: number;
  noEvidenceObservations: number;
  pendingReviewCandidates: number;
  rejectedCandidates: number;
  suppressedCandidates: number;
  totalCandidates: number;
  totalObservations: number;
}

export interface FaqMemoryGateway {
  getQualitySummary(input: {
    reviewerId: string;
  }): Promise<FaqMemoryQualitySummary>;
  listCandidates(input: {
    limit: number;
    reviewerId: string;
    status: FaqMemoryReviewStatus;
  }): Promise<FaqMemoryCandidate[]>;
  reviewCandidate(input: {
    candidateId: string;
    decision: Exclude<FaqMemoryReviewStatus, 'pending_review'>;
    reviewNote: string | null;
    reviewLabel: string | null;
    reviewerId: string;
  }): Promise<void>;
}
