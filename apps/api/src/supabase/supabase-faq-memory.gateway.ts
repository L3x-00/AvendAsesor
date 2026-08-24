import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { PostgrestError } from '@supabase/supabase-js';
import type {
  FaqMemoryCandidate,
  FaqMemoryGateway,
  FaqMemoryQualitySummary,
} from '../learning/faq-memory.gateway';
import type { SupabaseServerClient } from './supabase.server-client';

function databaseError(error: PostgrestError): never {
  if (error.code === '42501') {
    throw new ForbiddenException('FAQ memory review access is denied.');
  }
  if (error.code === 'P0002') {
    throw new NotFoundException('FAQ memory candidate was not found.');
  }
  if (error.code === '22023' || error.code === '22P02') {
    throw new BadRequestException('The FAQ memory request is invalid.');
  }
  if (error.code === '23514') {
    throw new ConflictException('The FAQ memory candidate cannot be approved.');
  }
  throw new ServiceUnavailableException(
    'FAQ memory is temporarily unavailable.',
  );
}

function requireSingle<T>(data: T[] | null, message: string): T {
  const result = data?.[0];
  if (!result) throw new ServiceUnavailableException(message);
  return result;
}

@Injectable()
export class SupabaseFaqMemoryGatewayAdapter implements FaqMemoryGateway {
  constructor(private readonly client: SupabaseServerClient | null) {}

  async getQualitySummary(
    input: Parameters<FaqMemoryGateway['getQualitySummary']>[0],
  ): Promise<FaqMemoryQualitySummary> {
    const { data, error } = await this.requireClient().rpc(
      'get_faq_memory_quality_summary',
      { p_reviewer_id: input.reviewerId },
    );
    if (error) databaseError(error);

    const result = requireSingle(data, 'FAQ memory metrics are unavailable.');
    return {
      ambiguousObservations: result.ambiguous_observations,
      approvedCandidates: result.approved_candidates,
      evidenceObservations: result.evidence_observations,
      noEvidenceObservations: result.no_evidence_observations,
      pendingReviewCandidates: result.pending_review_candidates,
      rejectedCandidates: result.rejected_candidates,
      suppressedCandidates: result.suppressed_candidates,
      totalCandidates: result.total_candidates,
      totalObservations: result.total_observations,
    };
  }

  async listCandidates(
    input: Parameters<FaqMemoryGateway['listCandidates']>[0],
  ): Promise<FaqMemoryCandidate[]> {
    const { data, error } = await this.requireClient().rpc(
      'list_faq_memory_candidates_v2',
      {
        p_limit: input.limit,
        p_reviewer_id: input.reviewerId,
        p_status: input.status,
      },
    );
    if (error) databaseError(error);

    return (data ?? []).map((candidate) => ({
      ambiguousCount: candidate.ambiguous_count,
      evidenceCount: candidate.evidence_count,
      firstSeenAt: candidate.first_seen_at,
      id: candidate.id,
      lastSeenAt: candidate.last_seen_at,
      noEvidenceCount: candidate.no_evidence_count,
      occurrenceCount: candidate.occurrence_count,
      reviewedAt: candidate.reviewed_at,
      reviewedBy: candidate.reviewed_by,
      reviewLabel: candidate.review_label,
      selectedModuleId: candidate.selected_module_id,
      status: candidate.status,
    }));
  }

  async reviewCandidate(
    input: Parameters<FaqMemoryGateway['reviewCandidate']>[0],
  ): Promise<void> {
    const { error } = await this.requireClient().rpc(
      'review_faq_memory_candidate_v2',
      {
        p_candidate_id: input.candidateId,
        p_decision: input.decision,
        p_review_note: input.reviewNote,
        p_review_label: input.reviewLabel,
        p_reviewer_id: input.reviewerId,
      },
    );
    if (error) databaseError(error);
  }

  private requireClient(): SupabaseServerClient {
    if (!this.client) {
      throw new ServiceUnavailableException('FAQ memory is not configured.');
    }
    return this.client;
  }
}
