import { validateEnvironment } from './environment.validation';

describe('validateEnvironment', () => {
  it('uses safe defaults when optional values are absent', () => {
    expect(validateEnvironment({})).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      CHAT_HISTORY_LIMIT: 20,
      RAG_ANSWER_MODEL: 'gpt-4o-mini',
      RAG_EMBEDDING_MODEL: 'text-embedding-3-small',
      RAG_INGESTION_LEASE_SECONDS: 300,
      RAG_INGESTION_WORKER_ENABLED: false,
      RAG_MATCH_COUNT: 5,
      RAG_MATCH_THRESHOLD: 0.7,
      WEB_ORIGIN: 'http://localhost:3000',
    });
  });

  it('coerces a valid port supplied through the environment', () => {
    expect(
      validateEnvironment({
        NODE_ENV: 'test',
        PORT: '3200',
        WEB_ORIGIN: 'http://localhost:3100',
      }),
    ).toEqual({
      NODE_ENV: 'test',
      PORT: 3200,
      CHAT_HISTORY_LIMIT: 20,
      RAG_ANSWER_MODEL: 'gpt-4o-mini',
      RAG_EMBEDDING_MODEL: 'text-embedding-3-small',
      RAG_INGESTION_LEASE_SECONDS: 300,
      RAG_INGESTION_WORKER_ENABLED: false,
      RAG_MATCH_COUNT: 5,
      RAG_MATCH_THRESHOLD: 0.7,
      WEB_ORIGIN: 'http://localhost:3100',
    });
  });

  it('preserves future configuration keys after validating known values', () => {
    expect(
      validateEnvironment({
        FUTURE_PROVIDER_URL: 'https://example.invalid',
      }),
    ).toMatchObject({
      FUTURE_PROVIDER_URL: 'https://example.invalid',
      NODE_ENV: 'development',
      PORT: 3000,
      WEB_ORIGIN: 'http://localhost:3000',
    });
  });

  it.each([
    { PORT: '0' },
    { PORT: '70000' },
    { NODE_ENV: 'preview' },
    { WEB_ORIGIN: 'not-a-url' },
    { RAG_INGESTION_LEASE_SECONDS: '1' },
    { RAG_INGESTION_WORKER_ENABLED: 'enabled' },
    { RAG_MATCH_COUNT: '11' },
    { RAG_MATCH_THRESHOLD: '1.1' },
    { CHAT_HISTORY_LIMIT: '51' },
    { RAG_ANSWER_MODEL: ' ' },
    { FAQ_MEMORY_FINGERPRINT_SECRET: 'short' },
  ])('rejects an unsafe configuration: %o', (configuration) => {
    expect(() => validateEnvironment(configuration)).toThrow(
      'Invalid environment configuration.',
    );
  });
});
