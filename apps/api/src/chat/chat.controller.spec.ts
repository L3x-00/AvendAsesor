import type { Response } from 'express';
import { ChatController } from './chat.controller';
import type { ChatService } from './chat.service';

describe('ChatController', () => {
  const service = {
    deleteConversation: jest.fn(),
    getConversation: jest.fn(),
    listConversations: jest.fn(),
    listModules: jest.fn(),
    stream: jest.fn(),
  };
  const controller = new ChatController(service as unknown as ChatService);
  const authorization = {
    email: 'docente@example.com',
    emailConfirmedAt: '2026-08-22T00:00:00.000Z',
    role: 'docente' as const,
    userId: '4c8b56af-6d0c-4fef-881e-7c00907540dd',
  };

  beforeEach(() => jest.clearAllMocks());

  it('delegates the read endpoints with the authenticated caller', async () => {
    service.listModules.mockResolvedValue([]);
    service.listConversations.mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    service.getConversation.mockResolvedValue({ messages: [] });
    service.deleteConversation.mockResolvedValue({
      deletedAt: '2026-08-23T00:00:00.000Z',
      id: '4c8b56af-6d0c-4fef-881e-7c00907540dd',
    });

    await expect(controller.listModules()).resolves.toEqual([]);
    await expect(
      controller.listConversations({ limit: 10 }, authorization),
    ).resolves.toEqual({ items: [], nextCursor: null });
    await expect(
      controller.getConversation(
        '4c8b56af-6d0c-4fef-881e-7c00907540dd',
        authorization,
      ),
    ).resolves.toEqual({ messages: [] });
    await expect(
      controller.deleteConversation(
        '4c8b56af-6d0c-4fef-881e-7c00907540dd',
        authorization,
      ),
    ).resolves.toEqual({
      deletedAt: '2026-08-23T00:00:00.000Z',
      id: '4c8b56af-6d0c-4fef-881e-7c00907540dd',
    });
  });

  it('serializes streaming events as SSE without exposing thrown details', async () => {
    service.stream.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        await Promise.resolve();
        yield {
          data: { conversationId: 'conversation-id' },
          type: 'conversation',
        };
        throw new Error('provider secret detail');
      },
    });
    const writes: string[] = [];
    const end = jest.fn();
    const response = {
      end,
      flushHeaders: jest.fn(),
      once: jest.fn(),
      removeListener: jest.fn(),
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      writableEnded: false,
      write: jest.fn((value: string) => writes.push(value)),
    } as unknown as Response;
    await controller.stream({ question: 'Consulta' }, authorization, response);

    expect(writes).toEqual([
      'event: conversation\ndata: {"conversationId":"conversation-id"}\n\n',
      'event: error\ndata: {"code":"CHAT_STREAM_FAILED"}\n\n',
    ]);
    expect(end).toHaveBeenCalled();
  });

  it('stops writing immediately when the client disconnects', async () => {
    service.stream.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        await Promise.resolve();
        yield {
          data: { conversationId: 'conversation-id' },
          type: 'conversation',
        };
      },
    });
    const writes: string[] = [];
    const end = jest.fn();
    const response = {
      end,
      flushHeaders: jest.fn(),
      once: jest.fn((_event: string, callback: () => void) => callback()),
      removeListener: jest.fn(),
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      writableEnded: false,
      write: jest.fn((value: string) => writes.push(value)),
    } as unknown as Response;

    await controller.stream({ question: 'Consulta' }, authorization, response);

    expect(writes).toEqual([]);
    expect(end).toHaveBeenCalled();
  });
});
