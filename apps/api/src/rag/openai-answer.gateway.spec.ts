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
  });
});
