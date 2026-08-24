import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { SUPABASE_FAQ_MEMORY_GATEWAY } from '../supabase/supabase.constants';
import type { AuthorizationContext } from '../authorization';
import type { ListFaqMemoryCandidatesQueryDto } from './dto/list-faq-memory-candidates-query.dto';
import type { ReviewFaqMemoryCandidateDto } from './dto/review-faq-memory-candidate.dto';
import type {
  FaqMemoryCandidate,
  FaqMemoryGateway,
  FaqMemoryQualitySummary,
} from './faq-memory.gateway';

@Injectable()
export class FaqMemoryAdminService {
  constructor(
    @Inject(SUPABASE_FAQ_MEMORY_GATEWAY)
    private readonly faqMemoryGateway: FaqMemoryGateway,
  ) {}

  listCandidates(
    dto: ListFaqMemoryCandidatesQueryDto,
    authorization: AuthorizationContext,
  ): Promise<FaqMemoryCandidate[]> {
    return this.faqMemoryGateway.listCandidates({
      limit: dto.limit ?? 50,
      reviewerId: authorization.userId,
      status: dto.status ?? 'pending_review',
    });
  }

  getQualitySummary(
    authorization: AuthorizationContext,
  ): Promise<FaqMemoryQualitySummary> {
    return this.faqMemoryGateway.getQualitySummary({
      reviewerId: authorization.userId,
    });
  }

  reviewCandidate(
    candidateId: string,
    dto: ReviewFaqMemoryCandidateDto,
    authorization: AuthorizationContext,
  ): Promise<void> {
    const reviewLabel = dto.reviewLabel?.trim() || null;
    const reviewNote = dto.reviewNote?.trim() || null;

    if (
      (reviewLabel !== null &&
        (reviewLabel.length < 4 || reviewLabel.length > 200)) ||
      (reviewNote !== null && reviewNote.length > 2_000) ||
      (dto.decision === 'approved' && !reviewLabel)
    ) {
      throw new BadRequestException(
        'An approved FAQ memory candidate requires an operational review label.',
      );
    }

    return this.faqMemoryGateway.reviewCandidate({
      candidateId,
      decision: dto.decision,
      reviewNote,
      reviewLabel,
      reviewerId: authorization.userId,
    });
  }
}
