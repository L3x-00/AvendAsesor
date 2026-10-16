import { ServiceUnavailableException } from '@nestjs/common';

const mockCreate = jest.fn();
const mockOpenAi = jest.fn().mockImplementation(() => ({
  embeddings: { create: mockCreate },
}));

jest.mock('openai', () => ({ __esModule: true, default: mockOpenAi }));

import {
  MAX_EMBEDDING_BATCH_SIZE,
  OpenAiEmbeddingsGateway,
} from './openai-embeddings.gateway';

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
    expect(mockCreate).toHaveBeenCalledWith(
      {
        dimensions: 1536,
        input: ['primera', 'segunda'],
        model: 'text-embedding-3-small',
      },
      { signal: undefined },
    );
    // La indexación conserva los límites del SDK por lote.
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

  it('embeds bounded sequential batches without losing input order', async () => {
    const gateway = new OpenAiEmbeddingsGateway({
      get: jest.fn((key: string) =>
        key === 'OPENAI_API_KEY' ? 'test-key' : undefined,
      ),
    } as never);
    const inputs = Array.from({ length: 65 }, (_, index) => String(index));
    let active = 0;
    let peak = 0;
    mockCreate.mockImplementation(async ({ input }: { input: string[] }) => {
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active--;
      return {
        data: input
          .map((value, index) => ({
            index,
            embedding: Array.from({ length: 1536 }, () => Number(value)),
          }))
          .reverse(),
      };
    });

    const result = await gateway.embed(inputs);

    expect(result).toEqual(
      inputs.map((value) => Array.from({ length: 1536 }, () => Number(value))),
    );
    expect(
      mockCreate.mock.calls.map(
        ([body]: [{ input: string[] }]) => body.input.length,
      ),
    ).toEqual([32, 32, 1]);
    expect(MAX_EMBEDDING_BATCH_SIZE).toBe(32);
    expect(peak).toBe(1);
    expect(mockOpenAi).toHaveBeenCalledTimes(1);
  });

  it('rejects duplicate or missing provider indices instead of attaching the wrong vector', async () => {
    const gateway = new OpenAiEmbeddingsGateway({
      get: jest.fn((key: string) =>
        key === 'OPENAI_API_KEY' ? 'test-key' : undefined,
      ),
    } as never);
    mockCreate.mockResolvedValue({
      data: [
        { index: 0, embedding: vector() },
        { index: 0, embedding: vector() },
      ],
    });

    await expect(gateway.embed(['uno', 'dos'])).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('stops after a later batch fails validation without returning partial vectors', async () => {
    const gateway = new OpenAiEmbeddingsGateway({
      get: jest.fn((key: string) =>
        key === 'OPENAI_API_KEY' ? 'test-key' : undefined,
      ),
    } as never);
    mockCreate
      .mockResolvedValueOnce({
        data: Array.from({ length: 32 }, (_, index) => ({
          index,
          embedding: vector(),
        })),
      })
      .mockResolvedValueOnce({ data: [] });

    await expect(
      gateway.embed(Array.from({ length: 65 }, () => 'texto')),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('passes cancellation to the SDK and starts no further batch after abort', async () => {
    const gateway = new OpenAiEmbeddingsGateway({
      get: jest.fn((key: string) =>
        key === 'OPENAI_API_KEY' ? 'test-key' : undefined,
      ),
    } as never);
    const cancellation = new AbortController();
    mockCreate.mockImplementation(() => {
      cancellation.abort(new Error('INGESTION_TIMEOUT'));
      return Promise.resolve({
        data: Array.from({ length: 32 }, (_, index) => ({
          index,
          embedding: vector(),
        })),
      });
    });

    await expect(
      gateway.embed(
        Array.from({ length: 65 }, () => 'texto'),
        undefined,
        cancellation.signal,
      ),
    ).rejects.toThrow('INGESTION_TIMEOUT');
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const call = mockCreate.mock.calls[0] as [unknown, { signal: AbortSignal }];
    expect(call[1]).toEqual({
      signal: cancellation.signal,
    });
  });

  it('avoids a provider call for an empty input or an already cancelled job', async () => {
    const gateway = new OpenAiEmbeddingsGateway({ get: jest.fn() } as never);
    await expect(gateway.embed([])).resolves.toEqual([]);
    const cancellation = new AbortController();
    cancellation.abort(new Error('INGESTION_TIMEOUT'));
    await expect(
      gateway.embed(['texto'], undefined, cancellation.signal),
    ).rejects.toThrow('INGESTION_TIMEOUT');
    expect(mockOpenAi).not.toHaveBeenCalled();
  });
});
