import { ServiceUnavailableException } from '@nestjs/common';

const mockCreate = jest.fn();
const mockOpenAi = jest.fn().mockImplementation(() => ({
  embeddings: { create: mockCreate },
}));

jest.mock('openai', () => ({ __esModule: true, default: mockOpenAi }));

import { OpenAiEmbeddingsGateway } from './openai-embeddings.gateway';

function vector(): number[] {
  return Array.from({ length: 1536 }, () => 0.1);
}

describe('OpenAiEmbeddingsGateway', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fails closed until the configured provider key exists', async () => {
    const gateway = new OpenAiEmbeddingsGateway({ get: jest.fn() } as never);

    await expect(gateway.embed(['consulta'])).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(mockOpenAi).not.toHaveBeenCalled();
  });

  it('uses the configured model and restores provider response order', async () => {
    const get = jest.fn((key: string) =>
      key === 'OPENAI_API_KEY' ? 'test-key' : 'text-embedding-3-small',
    );
    mockCreate.mockResolvedValue({
      data: [
        { embedding: vector(), index: 1 },
        { embedding: vector(), index: 0 },
      ],
    });
    const gateway = new OpenAiEmbeddingsGateway({ get } as never);

    await expect(gateway.embed(['primera', 'segunda'])).resolves.toEqual([
      vector(),
      vector(),
    ]);
    expect(mockCreate).toHaveBeenCalledWith({
      dimensions: 1536,
      input: ['primera', 'segunda'],
      model: 'text-embedding-3-small',
    });
    // La indexación embebe un documento entero: conserva los límites del SDK.
    const [options] = mockOpenAi.mock.calls[0] as [Record<string, unknown>];
    expect(options).not.toHaveProperty('timeout');
    expect(options).not.toHaveProperty('maxRetries');
  });

  it('applies the interactive limits when a chat query is embedded', async () => {
    const get = jest.fn((key: string) =>
      key === 'OPENAI_API_KEY' ? 'test-key' : undefined,
    );
    mockCreate.mockResolvedValue({ data: [{ embedding: vector(), index: 0 }] });
    const gateway = new OpenAiEmbeddingsGateway({ get } as never);

    await gateway.embed(['consulta'], { maxRetries: 1, timeout: 30_000 });

    expect(mockOpenAi).toHaveBeenCalledWith({
      apiKey: 'test-key',
      maxRetries: 1,
      timeout: 30_000,
    });
  });

  it('rejects malformed embedding dimensions before persistence', async () => {
    const gateway = new OpenAiEmbeddingsGateway({
      get: jest.fn((key: string) =>
        key === 'OPENAI_API_KEY' ? 'test-key' : 'text-embedding-3-small',
      ),
    } as never);
    mockCreate.mockResolvedValue({ data: [{ embedding: [0.1], index: 0 }] });

    await expect(gateway.embed(['consulta'])).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
