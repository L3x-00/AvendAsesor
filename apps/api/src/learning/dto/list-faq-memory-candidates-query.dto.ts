import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { FaqMemoryReviewStatus } from '../faq-memory.gateway';

export class ListFaqMemoryCandidatesQueryDto {
  @IsOptional()
  @IsIn(['pending_review', 'approved', 'rejected', 'suppressed'])
  status?: FaqMemoryReviewStatus;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
