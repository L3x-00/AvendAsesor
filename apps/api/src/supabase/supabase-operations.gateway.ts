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
  Hito4OperationalMetrics,
  OperationsGateway,
  UnansweredQuestion,
} from '../operations/unanswered-questions.gateway';
import type { SupabaseServerClient } from './supabase.server-client';

function databaseError(error: PostgrestError): never {
  if (error.code === '42501') {
    throw new ForbiddenException('Operations access is denied.');
  }
  if (error.code === 'P0002') {
    throw new NotFoundException('The unanswered question was not found.');
  }
  if (error.code === '22023' || error.code === '22P02') {
    throw new BadRequestException('The operations request is invalid.');
  }
  if (
    error.code === '23514' ||
    error.code === '23505' ||
    error.code === 'P0001'
  ) {
    throw new ConflictException('The unanswered question cannot be reviewed.');
  }
  throw new ServiceUnavailableException(
    'Operations data is temporarily unavailable.',
  );
}

function requireSingle<T>(data: T[] | null, message: string): T {
  const result = data?.[0];
  if (!result) throw new ServiceUnavailableException(message);
  return result;
}

@Injectable()
export class SupabaseOperationsGatewayAdapter implements OperationsGateway {
  constructor(private readonly client: SupabaseServerClient | null) {}

  async getMetrics(
    input: Parameters<OperationsGateway['getMetrics']>[0],
  ): Promise<Hito4OperationalMetrics> {
    const { data, error } = await this.requireClient().rpc(
      'get_hito4_operational_metrics',
      { p_reviewer_id: input.reviewerId },
    );
    if (error) databaseError(error);

    const result = requireSingle(data, 'Operational metrics are unavailable.');
    return {
      activeDocuments: result.active_documents,
      activeModules: result.active_modules,
      dismissedUnansweredQuestions: result.dismissed_unanswered_questions,
      pendingIngestionJobs: result.pending_ingestion_jobs,
      pendingUnansweredQuestions: result.pending_unanswered_questions,
      providerCostStatus: result.provider_cost_status,
      resolvedUnansweredQuestions: result.resolved_unanswered_questions,
      totalConversations: result.total_conversations,
      totalUsers: result.total_users,
    };
  }

  async listUnansweredQuestions(
    input: Parameters<OperationsGateway['listUnansweredQuestions']>[0],
  ): Promise<UnansweredQuestion[]> {
    const { data, error } = await this.requireClient().rpc(
      'list_unanswered_questions',
      {
        p_limit: input.limit,
        p_reviewer_id: input.reviewerId,
        p_status: input.status,
      },
    );
    if (error) databaseError(error);

    return (data ?? []).map((question) => ({
      category: question.category,
      conversationId: question.conversation_id,
      createdAt: question.created_at,
      id: question.id,
      messageId: question.message_id,
      question: question.question,
      reason: question.reason,
      reviewedAt: question.reviewed_at,
      reviewedBy: question.reviewed_by,
      reviewNote: question.review_note,
      selectedModuleId: question.selected_module_id,
      status: question.status,
      topRelevanceScore: question.top_relevance_score,
    }));
  }

  async reviewUnansweredQuestion(
    input: Parameters<OperationsGateway['reviewUnansweredQuestion']>[0],
  ): Promise<void> {
    const { error } = await this.requireClient().rpc(
      'review_unanswered_question',
      {
        p_category: input.category,
        p_decision: input.decision,
        p_review_note: input.reviewNote,
        p_reviewer_id: input.reviewerId,
        p_unanswered_question_id: input.questionId,
      },
    );
    if (error) databaseError(error);
  }

  private requireClient(): SupabaseServerClient {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Operations data is not configured.',
      );
    }
    return this.client;
  }
}
