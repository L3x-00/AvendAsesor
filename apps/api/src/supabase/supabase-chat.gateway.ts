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
  ActiveChatModule,
  ChatConversationContext,
  ChatConversationSummary,
  ChatHistoryGateway,
  DeletedChatConversation,
  ChatTurnCompletion,
  ChatTurnStart,
} from '../chat/chat-history.gateway';
import type { SupabaseServerClient } from './supabase.server-client';

/**
 * Kept local until generated Supabase types are refreshed by the database
 * integration. It exposes only the new server-only RPCs introduced here.
 */
interface ConsultationChatRpcClient {
  rpc(
    name: 'begin_chat_turn_with_consultation_routing',
    args: {
      p_conversation_id: string | null;
      p_question: string;
      p_selected_module_id: string | null;
      p_user_id: string;
    },
  ): Promise<{
    data: Array<{ conversation_id: string; user_message_id: string }> | null;
    error: PostgrestError | null;
  }>;
  rpc(
    name: 'complete_chat_turn_with_consultation_case',
    args: Record<string, unknown>,
  ): Promise<{
    data: Array<{ answer_message_id: string }> | null;
    error: PostgrestError | null;
  }>;
  rpc(
    name: 'record_consultation_technical_failure',
    args: {
      p_conversation_id: string;
      p_error_code: string;
      p_user_id: string;
      p_user_message_id: string;
    },
  ): Promise<{ data: null; error: PostgrestError | null }>;
}

const CHAT_MODULE_COLUMNS =
  'id,name,code,description,parent_module_id,sort_order';

function databaseError(error: PostgrestError): never {
  if (error.code === '42501') {
    throw new ForbiddenException('The chat request is not authorized.');
  }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseConversationContext(
  data: unknown,
  expectedConversationId: string,
): ChatConversationContext {
  if (
    !isRecord(data) ||
    data.conversationId !== expectedConversationId ||
    !Array.isArray(data.messages) ||
    (data.selectedModuleId !== null &&
      typeof data.selectedModuleId !== 'string')
  ) {
    throw new ServiceUnavailableException(
      'The chat context could not be loaded.',
    );
  }

  const messages = data.messages.map((message) => {
    if (
      !isRecord(message) ||
      typeof message.content !== 'string' ||
      !['assistant', 'clarification', 'no_evidence', 'user'].includes(
        String(message.role),
      )
    ) {
      throw new ServiceUnavailableException(
        'The chat context could not be loaded.',
      );
    }
    return {
      content: message.content,
      role: message.role as ChatConversationContext['messages'][number]['role'],
    };
  });

  return {
    conversationId: expectedConversationId,
    messages,
    selectedModuleId: data.selectedModuleId,
  };
}

@Injectable()
export class SupabaseChatGatewayAdapter implements ChatHistoryGateway {
  constructor(private readonly client: SupabaseServerClient | null) {}

  async beginTurn(
    input: Parameters<ChatHistoryGateway['beginTurn']>[0],
  ): Promise<ChatTurnStart> {
    const { data, error } = await this.consultationRpcClient().rpc(
      'begin_chat_turn_with_consultation_routing',
      {
        p_conversation_id: input.conversationId,
        p_question: input.question,
        p_selected_module_id: input.selectedModuleId,
        p_user_id: input.userId,
      },
    );

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
    const { data, error } = await this.consultationRpcClient().rpc(
      'complete_chat_turn_with_consultation_case',
      {
        p_answer: input.answer,
        p_answer_role: input.replyRole,
        p_conversation_id: input.conversationId,
        p_detected_module_id: input.detectedModuleId ?? null,
        p_detected_submodule_id: input.detectedSubmoduleId ?? null,
        p_faq_question_fingerprint:
          input.faqMemory?.questionFingerprint ?? null,
        p_quality_signals:
          input.qualityExcerpts && Object.keys(input.qualityExcerpts).length > 0
            ? {
                excerpts: input.qualityExcerpts,
                signals: input.qualitySignals ?? [],
              }
            : (input.qualitySignals ?? []),
        p_retrieval_scope: input.retrievalScope ?? 'current',
        p_sources: input.sources.map((source) => ({
          chunkId: source.chunkId,
          moduleId: source.moduleId ?? '',
          relevanceScore: source.relevanceScore,
          sourceId: source.sourceId,
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

  async recordTechnicalFailure(
    input: Parameters<ChatHistoryGateway['recordTechnicalFailure']>[0],
  ): Promise<void> {
    const { error } = await this.consultationRpcClient().rpc(
      'record_consultation_technical_failure',
      {
        p_conversation_id: input.conversationId,
        p_error_code: input.errorCode,
        p_user_id: input.userId,
        p_user_message_id: input.userMessageId,
      },
    );
    if (error) databaseError(error);
  }

  async getConversationContext(
    input: Parameters<ChatHistoryGateway['getConversationContext']>[0],
  ): Promise<ChatConversationContext> {
    const { data, error } = await this.requireClient().rpc(
      'get_chat_conversation_context',
      {
        p_character_limit: input.characterLimit,
        p_conversation_id: input.conversationId,
        p_message_limit: input.messageLimit,
        p_user_id: input.userId,
      },
    );

    if (error) databaseError(error);
    return parseConversationContext(data, input.conversationId);
  }

  async createSourceDownloadUrl(
    input: Parameters<ChatHistoryGateway['createSourceDownloadUrl']>[0],
  ) {
    const client = this.requireClient();
    const { data, error } = await client.rpc('authorize_chat_source_download', {
      p_source_id: input.sourceId,
      p_user_id: input.userId,
    });
    if (error) databaseError(error);

    const source = requireSingle(
      data,
      'The requested chat source was not found.',
    );
    const expiresAt = new Date(
      Date.now() + input.ttlSeconds * 1_000,
    ).toISOString();
    const signed = await client.storage
      .from(source.storage_bucket)
      .createSignedUrl(source.storage_path, input.ttlSeconds, {
        download: true,
      });
    if (signed.error || !signed.data?.signedUrl) {
      throw new ServiceUnavailableException(
        'The source download is temporarily unavailable.',
      );
    }

    return {
      expiresAt,
      sourceId: input.sourceId,
      url: signed.data.signedUrl,
    };
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

    const activeModules = (data ?? []).map((module) => ({
      code: module.code,
      description: module.description ?? null,
      id: module.id,
      name: module.name,
      parentModuleId: module.parent_module_id,
      sortOrder: module.sort_order,
    }));
    const activeIds = new Set(activeModules.map((module) => module.id));

    return activeModules.filter(
      (module) =>
        module.parentModuleId === null || activeIds.has(module.parentModuleId),
    );
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

  private consultationRpcClient(): ConsultationChatRpcClient {
    return this.requireClient() as unknown as ConsultationChatRpcClient;
  }
}
