import { ServiceUnavailableException } from '@nestjs/common';

const mockCreate = jest.fn();
const mockOpenAi = jest.fn().mockImplementation(() => ({
  chat: { completions: { create: mockCreate } },
}));

jest.mock('openai', () => ({ __esModule: true, default: mockOpenAi }));

import { OpenAiAnswerGateway } from './openai-answer.gateway';

const source = {
  articleReference: null,
  chunkContent: 'Contenido normativo.',
  chunkId: 'chunk-id',
  documentId: 'document-id',
  documentSituation: 'current' as const,
  documentTitle: 'Norma docente',
  documentVersionId: 'version-id',
  lexicalScore: 0,
  moduleIds: ['module-id'],
  moduleNames: ['Módulo'],
  numeralReference: null,
  pageEnd: 1,
  pageStart: 1,
  sectionTitle: null,
  semanticScore: 0.9,
  versionNumber: 1,
};

async function collect(gateway: OpenAiAnswerGateway): Promise<string[]> {
  const tokens: string[] = [];
  for await (const token of gateway.generate({
    conversationContext: [],
    question: 'Consulta',
    sources: [source],
  })) {
    tokens.push(token);
  }
  return tokens;
}

describe('OpenAiAnswerGateway', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fails closed without a provider key', async () => {
    const gateway = new OpenAiAnswerGateway({ get: jest.fn() } as never);

    await expect(collect(gateway)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(mockOpenAi).not.toHaveBeenCalled();
  });

  it('streams non-empty delta tokens from the configured model', async () => {
    mockCreate.mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        await Promise.resolve();
        yield { choices: [{ delta: { content: 'Respuesta ' } }] };
        yield { choices: [{ delta: { content: 'con sustento.' } }] };
      },
    });
    const gateway = new OpenAiAnswerGateway({
      get: jest.fn((key: string) =>
        key === 'OPENAI_API_KEY' ? 'test-key' : 'gpt-4o-mini',
      ),
    } as never);

    await expect(collect(gateway)).resolves.toEqual([
      'Respuesta ',
      'con sustento.',
    ]);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4o-mini',
        stream: true,
        temperature: 0,
      }),
      expect.any(Object),
    );
    const calls = mockCreate.mock.calls as Array<
      [
        {
          messages: Array<{ content: string; role: string }>;
        },
      ]
    >;
    const messages = calls[0]?.[0].messages;
    const systemMessage = messages?.find(
      (message) => message.role === 'system',
    );
    const userMessage = messages?.find((message) => message.role === 'user');

    expect(systemMessage?.content).not.toContain(source.chunkContent);
    expect(systemMessage?.content).not.toContain('INICIO DE FUENTES');
    expect(userMessage?.content).toContain(source.chunkContent);
    expect(userMessage?.content).toContain('PREGUNTA ACTUAL (PRIORITARIA)');
  });

  it('falls back to the paid model only when the primary provider fails technically', async () => {
    mockCreate
      .mockRejectedValueOnce(new Error('rate limited'))
      .mockResolvedValueOnce({
        async *[Symbol.asyncIterator]() {
          await Promise.resolve();
          yield { choices: [{ delta: { content: 'Respaldo.' } }] };
        },
      });
    const gateway = new OpenAiAnswerGateway({
      get: jest.fn((key: string) => {
        if (key === 'OPENAI_API_KEY') return 'test-key';
        if (key === 'RAG_ANSWER_MODEL') return 'google/gemma-4-31b-it:free';
        if (key === 'RAG_ANSWER_FALLBACK_MODEL') return 'openai/gpt-5-mini';
        return undefined;
      }),
    } as never);

    await expect(collect(gateway)).resolves.toEqual(['Respaldo.']);
    expect(mockCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ model: 'google/gemma-4-31b-it:free' }),
      expect.any(Object),
    );
    expect(mockCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ model: 'openai/gpt-5-mini' }),
      expect.any(Object),
    );
  });
});
