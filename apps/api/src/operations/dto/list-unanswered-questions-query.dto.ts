import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { UnansweredQuestionStatus } from '../unanswered-questions.gateway';

export class ListUnansweredQuestionsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsIn(['pending_review', 'resolved', 'dismissed'])
  status?: UnansweredQuestionStatus;
}
