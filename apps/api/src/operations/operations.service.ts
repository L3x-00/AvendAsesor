import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { AuthorizationContext } from '../authorization';
import { SUPABASE_OPERATIONS_GATEWAY } from '../supabase/supabase.constants';
import type { ListUnansweredQuestionsQueryDto } from './dto/list-unanswered-questions-query.dto';
import type { ReviewUnansweredQuestionDto } from './dto/review-unanswered-question.dto';
import type {
  Hito4OperationalMetrics,
  OperationsGateway,
  UnansweredQuestion,
} from './unanswered-questions.gateway';

@Injectable()
export class OperationsService {
  constructor(
    @Inject(SUPABASE_OPERATIONS_GATEWAY)
    private readonly operationsGateway: OperationsGateway,
  ) {}

  getMetrics(
    authorization: AuthorizationContext,
  ): Promise<Hito4OperationalMetrics> {
    return this.operationsGateway.getMetrics({
      reviewerId: authorization.userId,
    });
  }

  listUnansweredQuestions(
    dto: ListUnansweredQuestionsQueryDto,
    authorization: AuthorizationContext,
  ): Promise<UnansweredQuestion[]> {
    return this.operationsGateway.listUnansweredQuestions({
      limit: dto.limit ?? 50,
      reviewerId: authorization.userId,
      status: dto.status ?? 'pending_review',
    });
  }

  reviewUnansweredQuestion(
    questionId: string,
    dto: ReviewUnansweredQuestionDto,
    authorization: AuthorizationContext,
  ): Promise<void> {
    const reviewNote = dto.reviewNote.trim();
    if (reviewNote.length < 4 || reviewNote.length > 2_000) {
      throw new BadRequestException(
        'A classified unanswered question requires a review note.',
      );
    }

    return this.operationsGateway.reviewUnansweredQuestion({
      category: dto.category,
      decision: dto.decision,
      questionId,
      reviewNote,
      reviewerId: authorization.userId,
    });
  }
}
