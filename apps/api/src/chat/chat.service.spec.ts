import { ServiceUnavailableException } from '@nestjs/common';
import type { AuthorizationContext } from '../authorization';
import {
  MAX_RAG_ANSWER_CHARS,
  RAG_AMBIGUITY_MESSAGE,
  RAG_NO_EVIDENCE_MESSAGE,
} from '../rag/rag.constants';
import { ChatService, type ChatStreamEvent } from './chat.service';

const authorization: AuthorizationContext = {
  email: 'docente@example.com',
  emailConfirmedAt: '2026-08-22T00:00:00.000Z',
  role: 'docente',
  userId: '4c8b56af-6d0c-4fef-881e-7c00907540dd',
};

const source = {
  articleReference: 'Artículo 5',
  chunkContent: 'La licencia se solicita mediante procedimiento institucional.',
  chunkId: '5c8b56af-6d0c-4fef-881e-7c00907540dd',
  documentId: '6c8b56af-6d0c-4fef-881e-7c00907540dd',
  documentTitle: 'Norma de licencias',
  documentVersionId: '7c8b56af-6d0c-4fef-881e-7c00907540dd',
  lexicalScore: 0.2,
  moduleIds: ['8c8b56af-6d0c-4fef-881e-7c00907540dd'],
  moduleNames: ['Licencias'],
  numeralReference: null,
  pageEnd: 1,
  pageStart: 1,
  sectionTitle: 'Licencias',
  semanticScore: 0.9,
  versionNumber: 1,
};

async function collect(
  service: ChatService,
  input: Partial<Parameters<ChatService['stream']>[0]> = {},
): Promise<ChatStreamEvent[]> {
  const events: ChatStreamEvent[] = [];
  for await (const event of service.stream({
    authorization,
    conversationId: null,
    question: '¿Cómo solicito una licencia?',
    selectedModuleId: null,
    ...input,
  })) {
    events.push(event);
  }
  return events;
}

describe('ChatService', () => {
  let answerGateway: { generate: jest.Mock };
  let historyGateway: {
    beginTurn: jest.Mock;
    completeTurn: jest.Mock;
    deleteConversation: jest.Mock;
    getConversation: jest.Mock;
    listActiveModules: jest.Mock;
    listConversations: jest.Mock;
  };
  let ragService: { retrieve: jest.Mock };
  let configService: { get: jest.Mock };
  let faqMemoryService: { prepare: jest.Mock };
  let service: ChatService;

  beforeEach(() => {
    answerGateway = { generate: jest.fn() };
    historyGateway = {
      beginTurn: jest.fn().mockResolvedValue({
        conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
        userMessageId: 'ac8b56af-6d0c-4fef-881e-7c00907540dd',
      }),
      completeTurn: jest.fn().mockResolvedValue({
        answerMessageId: 'bc8b56af-6d0c-4fef-881e-7c00907540dd',
      }),
      deleteConversation: jest.fn(),
      getConversation: jest.fn(),
      listActiveModules: jest.fn(),
      listConversations: jest.fn(),
    };
    ragService = { retrieve: jest.fn() };
    configService = { get: jest.fn().mockReturnValue(20) };
    faqMemoryService = {
      prepare: jest.fn().mockReturnValue({
        questionFingerprint:
          'd7d93628135348b418dccf36bcffca1b5484813982f4d4ca8dc4570d65e78f4d',
      }),
    };
    service = new ChatService(
      answerGateway,
      historyGateway,
      ragService as never,
      configService as never,
      faqMemoryService as never,
    );
  });

  it('records no-evidence without calling the answer provider', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'no_evidence',
      topRelevanceScore: null,
    });

    await expect(collect(service)).resolves.toEqual([
      {
        data: { conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd' },
        type: 'conversation',
      },
      { data: { message: RAG_NO_EVIDENCE_MESSAGE }, type: 'no_evidence' },
      {
        data: {
          conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
          messageId: 'bc8b56af-6d0c-4fef-881e-7c00907540dd',
          provider: 'rule',
        },
        type: 'done',
      },
    ]);
    expect(answerGateway.generate).not.toHaveBeenCalled();
    expect(historyGateway.completeTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        replyRole: 'no_evidence',
        sources: [],
        unansweredReason: 'insufficient_evidence',
      }),
    );
  });

  it('records ambiguity without calling the answer provider', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'ambiguous',
      modules: [{ id: source.moduleIds[0], name: 'Licencias' }],
      topRelevanceScore: 0.9,
    });

    const events = await collect(service);

    expect(events[1]).toEqual({
      data: {
        message: RAG_AMBIGUITY_MESSAGE,
        modules: [{ id: source.moduleIds[0], name: 'Licencias' }],
      },
      type: 'clarification',
    });
    expect(answerGateway.generate).not.toHaveBeenCalled();
    expect(historyGateway.completeTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        replyRole: 'clarification',
        sources: [],
        unansweredReason: 'ambiguous_request',
      }),
    );
  });

  it('streams evidence, then persists real sources only after completion', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      sources: [source],
      topRelevanceScore: 0.9,
    });
    answerGateway.generate.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        await Promise.resolve();
        yield 'La licencia ';
        yield 'se solicita conforme al procedimiento. [1]';
      },
    });

    const events = await collect(service);

    expect(events.map((event) => event.type)).toEqual([
      'conversation',
      'sources',
      'token',
      'token',
      'done',
    ]);
    expect(historyGateway.completeTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        answer: 'La licencia se solicita conforme al procedimiento. [1]',
        replyRole: 'assistant',
        sources: [
          {
            chunkId: source.chunkId,
            moduleId: source.moduleIds[0],
            relevanceScore: 0.9,
          },
        ],
      }),
    );
  });

  it('does not persist a partial assistant reply after a disconnect', async () => {
    const controller = new AbortController();
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      sources: [source],
      topRelevanceScore: 0.9,
    });
    answerGateway.generate.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        await Promise.resolve();
        controller.abort();
        yield 'Texto parcial';
      },
    });

    const events = await collect(service, { abortSignal: controller.signal });

    expect(events.map((event) => event.type)).toEqual([
      'conversation',
      'sources',
    ]);
    expect(historyGateway.completeTurn).not.toHaveBeenCalled();
  });

  it('does not decide an outcome when the caller disconnected during retrieval', async () => {
    const controller = new AbortController();
    controller.abort();
    ragService.retrieve.mockResolvedValue({
      kind: 'no_evidence',
      topRelevanceScore: null,
    });

    const events = await collect(service, { abortSignal: controller.signal });

    expect(events.map((event) => event.type)).toEqual(['conversation']);
    expect(historyGateway.completeTurn).not.toHaveBeenCalled();
  });

  it('fails closed when the provider produces only blank output', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      sources: [source],
      topRelevanceScore: 0.9,
    });
    answerGateway.generate.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        await Promise.resolve();
        yield '   ';
      },
    });

    await expect(collect(service)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(historyGateway.completeTurn).not.toHaveBeenCalled();
  });

  it('caps generated output before it can be persisted', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      sources: [source],
      topRelevanceScore: 0.9,
    });
    answerGateway.generate.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        await Promise.resolve();
        yield 'x'.repeat(MAX_RAG_ANSWER_CHARS + 1);
      },
    });

    await expect(collect(service)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(historyGateway.completeTurn).not.toHaveBeenCalled();
  });

  it('retains only unambiguous source-module associations and bounds scores', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      sources: [
        {
          ...source,
          moduleIds: [
            source.moduleIds[0],
            '9c8b56af-6d0c-4fef-881e-7c00907540dd',
          ],
          moduleNames: ['Licencias', 'Permisos'],
          semanticScore: 1.5,
        },
      ],
      topRelevanceScore: 1.5,
    });
    answerGateway.generate.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        await Promise.resolve();
        yield 'Respuesta fundada. [1]';
      },
    });

    const events = await collect(service);

    expect(events[1]).toEqual({
      data: {
        sources: [
          expect.objectContaining({
            moduleName: null,
            relevanceScore: 1,
          }),
        ],
      },
      type: 'sources',
    });
    expect(historyGateway.completeTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: [
          expect.objectContaining({ moduleId: null, relevanceScore: 1 }),
        ],
      }),
    );
  });

  it('uses configured history bounds for owned reads and a safe default for lists', async () => {
    const conversationId = '9c8b56af-6d0c-4fef-881e-7c00907540dd';
    configService.get.mockReturnValue(undefined);
    historyGateway.getConversation.mockResolvedValue({ messages: [] });
    historyGateway.listConversations.mockResolvedValue([]);
    historyGateway.listActiveModules.mockResolvedValue([]);

    await expect(
      service.getConversation(conversationId, authorization),
    ).resolves.toEqual({
      messages: [],
    });
    await expect(
      service.listConversations(undefined, undefined, authorization),
    ).resolves.toEqual({ items: [], nextCursor: null });
    await expect(service.listModules()).resolves.toEqual([]);

    expect(historyGateway.getConversation).toHaveBeenCalledWith({
      conversationId,
      limit: 20,
      userId: authorization.userId,
    });
    expect(historyGateway.listConversations).toHaveBeenCalledWith({
      cursor: null,
      limit: 21,
      userId: authorization.userId,
    });
  });

  it('keeps deletion bound to the authenticated history owner', async () => {
    const conversationId = '9c8b56af-6d0c-4fef-881e-7c00907540dd';
    historyGateway.deleteConversation.mockResolvedValue({
      deletedAt: '2026-08-23T00:00:00.000Z',
      id: conversationId,
    });

    await expect(
      service.deleteConversation(conversationId, authorization),
    ).resolves.toEqual({
      deletedAt: '2026-08-23T00:00:00.000Z',
      id: conversationId,
    });
    expect(historyGateway.deleteConversation).toHaveBeenCalledWith({
      conversationId,
      userId: authorization.userId,
    });
  });

  it('propagates an unavailable provider rather than inventing an answer', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      sources: [source],
      topRelevanceScore: 0.9,
    });
    answerGateway.generate.mockImplementation(() => {
      throw new ServiceUnavailableException();
    });

    await expect(collect(service)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(historyGateway.completeTurn).not.toHaveBeenCalled();
  });
});
