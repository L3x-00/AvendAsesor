import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SupabaseChatGatewayAdapter } from './supabase-chat.gateway';
import type { SupabaseServerClient } from './supabase.server-client';

function postgrestError(code: string) {
  return { code, details: '', hint: '', message: 'database error' };
}

function moduleBuilder(result: { data?: unknown; error?: unknown }) {
  const builder = {
    data: result.data ?? null,
    eq: jest.fn(),
    error: result.error ?? null,
    order: jest.fn(),
    select: jest.fn(),
  };
  builder.eq.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.select.mockReturnValue(builder);
  return builder;
}

function createClient(
  options: {
    moduleData?: unknown;
    moduleError?: unknown;
    rpcData?: unknown;
    rpcError?: unknown;
  } = {},
) {
  const modules = moduleBuilder({
    data: options.moduleData,
    error: options.moduleError,
  });
  const from = jest.fn().mockReturnValue(modules);
  const rpc = jest.fn().mockResolvedValue({
    data: options.rpcData ?? null,
    error: options.rpcError ?? null,
  });

  return {
    client: { from, rpc } as unknown as SupabaseServerClient,
    from,
    modules,
    rpc,
  };
}

describe('SupabaseChatGatewayAdapter', () => {
  const userId = '4c8b56af-6d0c-4fef-881e-7c00907540dd';
  const conversationId = '5c8b56af-6d0c-4fef-881e-7c00907540dd';
  const messageId = '6c8b56af-6d0c-4fef-881e-7c00907540dd';

  it('fails closed when the server-only database client is unavailable', async () => {
    const gateway = new SupabaseChatGatewayAdapter(null);

    await expect(gateway.listActiveModules()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('begins and completes a turn through the controlled RPC contract', async () => {
    const { client, rpc } = createClient({
      rpcData: [
        { conversation_id: conversationId, user_message_id: messageId },
      ],
    });
    const gateway = new SupabaseChatGatewayAdapter(client);

    await expect(
      gateway.beginTurn({
        conversationId: null,
        question: 'Consulta',
        selectedModuleId: null,
        userId,
      }),
    ).resolves.toEqual({ conversationId, userMessageId: messageId });
    expect(rpc).toHaveBeenCalledWith('begin_chat_turn', {
      p_conversation_id: null,
      p_question: 'Consulta',
      p_selected_module_id: null,
      p_user_id: userId,
    });

    rpc.mockResolvedValueOnce({
      data: [{ answer_message_id: messageId }],
      error: null,
    });
    await expect(
      gateway.completeTurn({
        answer: 'Respuesta',
        conversationId,
        faqMemory: {
          questionFingerprint:
            'd7d93628135348b418dccf36bcffca1b5484813982f4d4ca8dc4570d65e78f4d',
        },
        replyRole: 'assistant',
        sources: [
          {
            chunkId: '7c8b56af-6d0c-4fef-881e-7c00907540dd',
            moduleId: null,
            relevanceScore: 0.9,
          },
        ],
        topRelevanceScore: 0.9,
        unansweredReason: null,
        userId,
        userMessageId: messageId,
      }),
    ).resolves.toEqual({ answerMessageId: messageId });
    expect(rpc).toHaveBeenLastCalledWith(
      'complete_chat_turn_with_learning_v2',
      expect.objectContaining({
        p_faq_question_fingerprint:
          'd7d93628135348b418dccf36bcffca1b5484813982f4d4ca8dc4570d65e78f4d',
        p_sources: [
          {
            chunkId: '7c8b56af-6d0c-4fef-881e-7c00907540dd',
            moduleId: '',
            relevanceScore: 0.9,
          },
        ],
      }),
    );
  });

  it('maps active modules and owned conversation reads to safe application shapes', async () => {
    const { client, from, modules, rpc } = createClient({
      moduleData: [
        {
          code: 'LICENSES',
          description: 'Consultas sobre licencias docentes.',
          id: conversationId,
          name: 'Licencias',
          parent_module_id: null,
          sort_order: 0,
        },
      ],
      rpcData: [
        {
          created_at: '2026-08-22T00:00:00.000Z',
          id: conversationId,
          selected_module_id: null,
          title: 'Consulta',
          updated_at: '2026-08-22T00:00:00.000Z',
        },
      ],
    });
    const gateway = new SupabaseChatGatewayAdapter(client);

    await expect(gateway.listActiveModules()).resolves.toEqual([
      {
        code: 'LICENSES',
        description: 'Consultas sobre licencias docentes.',
        id: conversationId,
        name: 'Licencias',
        parentModuleId: null,
        sortOrder: 0,
      },
    ]);
    expect(from).toHaveBeenCalledWith('modules');
    expect(modules.eq).toHaveBeenCalledWith('is_active', true);
    expect(modules.eq).toHaveBeenCalledWith('is_deleted', false);

    await expect(
      gateway.listConversations({ cursor: null, limit: 20, userId }),
    ).resolves.toEqual([
      {
        createdAt: '2026-08-22T00:00:00.000Z',
        id: conversationId,
        selectedModuleId: null,
        title: 'Consulta',
        updatedAt: '2026-08-22T00:00:00.000Z',
      },
    ]);

    rpc.mockResolvedValueOnce({ data: { messages: [] }, error: null });
    await expect(
      gateway.getConversation({ conversationId, limit: 20, userId }),
    ).resolves.toEqual({ messages: [] });

    rpc.mockResolvedValueOnce({
      data: [{ deleted_at: '2026-08-23T00:00:00.000Z', id: conversationId }],
      error: null,
    });
    await expect(
      gateway.deleteConversation({ conversationId, userId }),
    ).resolves.toEqual({
      deletedAt: '2026-08-23T00:00:00.000Z',
      id: conversationId,
    });
  });

  it.each([
    ['P0002', NotFoundException],
    ['22023', BadRequestException],
    ['22P02', BadRequestException],
    ['23503', ConflictException],
    ['23505', ConflictException],
    ['P0001', ConflictException],
    ['XX000', ServiceUnavailableException],
  ])('maps database error %s safely', async (code, expected) => {
    const { client } = createClient({ rpcError: postgrestError(code) });
    const gateway = new SupabaseChatGatewayAdapter(client);

    await expect(
      gateway.beginTurn({
        conversationId: null,
        question: 'Consulta',
        selectedModuleId: null,
        userId,
      }),
    ).rejects.toBeInstanceOf(expected);
  });

  it('fails closed when an RPC returns an empty result without an error', async () => {
    const { client } = createClient({ rpcData: [] });
    const gateway = new SupabaseChatGatewayAdapter(client);

    await expect(
      gateway.beginTurn({
        conversationId: null,
        question: 'Consulta',
        selectedModuleId: null,
        userId,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('fails closed for read errors and nullable database collections', async () => {
    const { client, rpc } = createClient({ moduleData: null });
    const gateway = new SupabaseChatGatewayAdapter(client);

    await expect(gateway.listActiveModules()).resolves.toEqual([]);

    rpc.mockResolvedValueOnce({
      data: null,
      error: postgrestError('P0002'),
    });
    await expect(
      gateway.getConversation({ conversationId, limit: 20, userId }),
    ).rejects.toBeInstanceOf(NotFoundException);

    rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(
      gateway.listConversations({ cursor: null, limit: 20, userId }),
    ).resolves.toEqual([]);
  });
});
