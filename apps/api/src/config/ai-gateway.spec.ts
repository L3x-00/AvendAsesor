const mockOpenAi = jest.fn();

jest.mock('openai', () => ({ __esModule: true, default: mockOpenAi }));

import { INTERACTIVE_AI_LIMITS, createAiGatewayClient } from './ai-gateway';

function config(values: Record<string, string>) {
  return { get: jest.fn((key: string) => values[key]) } as never;
}

describe('createAiGatewayClient', () => {
  beforeEach(() => jest.clearAllMocks());

  it('applies the interactive limits on the OpenRouter branch used in production', () => {
    createAiGatewayClient(
      config({ OPENROUTER_API_KEY: 'or-key', WEB_ORIGIN: 'https://web' }),
      INTERACTIVE_AI_LIMITS,
    );

    expect(mockOpenAi).toHaveBeenCalledWith({
      apiKey: 'or-key',
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://web',
        'X-Title': 'AVEND ASESOR',
      },
      maxRetries: 1,
      timeout: 30_000,
    });
  });

  it('keeps the SDK defaults when no limits are given (ingestion)', () => {
    createAiGatewayClient(config({ OPENROUTER_API_KEY: 'or-key' }));

    const [options] = mockOpenAi.mock.calls[0] as [Record<string, unknown>];
    expect(options).not.toHaveProperty('timeout');
    expect(options).not.toHaveProperty('maxRetries');
  });

  it('applies the limits on the direct OpenAI branch with a custom base URL', () => {
    createAiGatewayClient(
      config({
        AI_GATEWAY_BASE_URL: 'https://gateway.example',
        OPENAI_API_KEY: 'oa-key',
      }),
      INTERACTIVE_AI_LIMITS,
    );

    expect(mockOpenAi).toHaveBeenCalledWith({
      apiKey: 'oa-key',
      baseURL: 'https://gateway.example',
      maxRetries: 1,
      timeout: 30_000,
    });
  });
});
