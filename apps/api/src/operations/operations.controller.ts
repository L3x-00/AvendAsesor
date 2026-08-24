import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  AuthorizationGuard,
  CurrentAuthorization,
  RequireRoles,
  RolesGuard,
  type AuthorizationContext,
} from '../authorization';
import { ListUnansweredQuestionsQueryDto } from './dto/list-unanswered-questions-query.dto';
import { ReviewUnansweredQuestionDto } from './dto/review-unanswered-question.dto';
import { OperationsService } from './operations.service';
import type {
  Hito4OperationalMetrics,
  UnansweredQuestion,
} from './unanswered-questions.gateway';

@Controller('admin/operations')
@UseGuards(ThrottlerGuard, AuthorizationGuard, RolesGuard)
@RequireRoles('admin', 'superadmin')
@Throttle({ default: { limit: 20, ttl: 60_000 } })
export class OperationsController {
  constructor(private readonly operationsService: OperationsService) {}

  @Get('metrics')
  getMetrics(
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<Hito4OperationalMetrics> {
    return this.operationsService.getMetrics(authorization);
  }

  @Get('unanswered-questions')
  listUnansweredQuestions(
    @Query() dto: ListUnansweredQuestionsQueryDto,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<UnansweredQuestion[]> {
    return this.operationsService.listUnansweredQuestions(dto, authorization);
  }

  @Patch('unanswered-questions/:id/review')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reviewUnansweredQuestion(
    @Param('id', new ParseUUIDPipe({ version: '4' })) questionId: string,
    @Body() dto: ReviewUnansweredQuestionDto,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<void> {
    await this.operationsService.reviewUnansweredQuestion(
      questionId,
      dto,
      authorization,
    );
  }
}
