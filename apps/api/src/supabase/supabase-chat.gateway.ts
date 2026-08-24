import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { PostgrestError } from '@supabase/supabase-js';
import type {
  ActiveChatModule,
  ChatConversationSummary,
  ChatHistoryGateway,
  DeletedChatConversation,
  ChatTurnCompletion,
  ChatTurnStart,
} from '../chat/chat-history.gateway';
import type { SupabaseServerClient } from './supabase.server-client';

const CHAT_MODULE_COLUMNS = 'id,name,code,parent_module_id,sort_order';

function databaseError(error: PostgrestError): never {
  if (error.code === 'P0002') {
    throw new NotFoundException('The requested chat resource was not found.');
  }

  if (error.code === '22023' || error.code === '22P02') {
    throw new BadRequestException('The chat request is invalid.');
  }

  if (
    error.code === '23503' ||
    error.code === '23505' ||
    error.code === 'P0001'
  ) {
    throw new ConflictException(
      'The chat request conflicts with current data.',
    );
  }

  throw new ServiceUnavailableException(
    'The chat store is temporarily unavailable.',
  );
}

function requireSingle<T>(data: T[] | null, message: string): T {
  const result = data?.[0];

  if (!result) {
    throw new ServiceUnavailableException(message);
  }

  return result;
}

@Injectable()
export class SupabaseChatGatewayAdapter implements ChatHistoryGateway {
  constructor(private readonly client: SupabaseServerClient | null) {}

  async beginTurn(
    input: Parameters<ChatHistoryGateway['beginTurn']>[0],
  ): Promise<ChatTurnStart> {
    const { data, error } = await this.requireClient().rpc('begin_chat_turn', {
      p_conversation_id: input.conversationId,
      p_question: input.question,
      p_selected_module_id: input.selectedModuleId,
      p_user_id: input.userId,
    });

    if (error) databaseError(error);

    const result = requireSingle(data, 'The chat turn could not be started.');
    return {
      conversationId: result.conversation_id,
      userMessageId: result.user_message_id,
    };
  }

  async completeTurn(
    input: Parameters<ChatHistoryGateway['completeTurn']>[0],
  ): Promise<ChatTurnCompletion> {
    const { data, error } = await this.requireClient().rpc(
      'complete_chat_turn_with_learning_v2',
      {
        p_answer: input.answer,
        p_answer_role: input.replyRole,
        p_conversation_id: input.conversationId,
        p_faq_question_fingerprint:
          input.faqMemory?.questionFingerprint ?? null,
        p_sources: input.sources.map((source) => ({
          chunkId: source.chunkId,
          moduleId: source.moduleId ?? '',
          relevanceScore: source.relevanceScore,
        })),
        p_top_relevance_score: input.topRelevanceScore,
        p_unanswered_reason: input.unansweredReason,
        p_user_id: input.userId,
        p_user_message_id: input.userMessageId,
      },
    );

    if (error) databaseError(error);

    return {
      answerMessageId: requireSingle(
        data,
        'The chat reply could not be completed.',
      ).answer_message_id,
    };
  }

  async getConversation(
    input: Parameters<ChatHistoryGateway['getConversation']>[0],
  ): Promise<unknown> {
    const { data, error } = await this.requireClient().rpc(
      'get_chat_conversation',
      {
        p_conversation_id: input.conversationId,
        p_limit: input.limit,
        p_user_id: input.userId,
      },
    );

    if (error) databaseError(error);
    return data;
  }

  async deleteConversation(
    input: Parameters<ChatHistoryGateway['deleteConversation']>[0],
  ): Promise<DeletedChatConversation> {
    const { data, error } = await this.requireClient().rpc(
      'delete_chat_conversation',
      {
        p_conversation_id: input.conversationId,
        p_user_id: input.userId,
      },
    );

    if (error) databaseError(error);

    const result = requireSingle(
      data,
      'The chat conversation could not be deleted.',
    );
    return { deletedAt: result.deleted_at, id: result.id };
  }

  async listActiveModules(): Promise<ActiveChatModule[]> {
    const { data, error } = await this.requireClient()
      .from('modules')
      .select(CHAT_MODULE_COLUMNS)
      .eq('is_active', true)
      .eq('is_deleted', false)
      .order('parent_module_id', { ascending: true, nullsFirst: true })
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) databaseError(error);

    return (data ?? []).map((module) => ({
      code: module.code,
      id: module.id,
      name: module.name,
      parentModuleId: module.parent_module_id,
      sortOrder: module.sort_order,
    }));
  }

  async listConversations(
    input: Parameters<ChatHistoryGateway['listConversations']>[0],
  ): Promise<ChatConversationSummary[]> {
    const { data, error } = await this.requireClient().rpc(
      'list_chat_conversations_page',
      {
        p_cursor_id: input.cursor?.id ?? null,
        p_cursor_updated_at: input.cursor?.updatedAt ?? null,
        p_limit: input.limit,
        p_user_id: input.userId,
      },
    );

    if (error) databaseError(error);

    return (data ?? []).map((conversation) => ({
      createdAt: conversation.created_at,
      id: conversation.id,
      selectedModuleId: conversation.selected_module_id,
      title: conversation.title,
      updatedAt: conversation.updated_at,
    }));
  }

  private requireClient(): SupabaseServerClient {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'The chat store is not configured.',
      );
    }

    return this.client;
  }
}
