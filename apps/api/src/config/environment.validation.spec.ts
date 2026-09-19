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

  it('normalizes an optional trailing slash for the exact browser CORS origin', () => {
    expect(
      validateEnvironment({
        WEB_ORIGIN: 'https://avend-asesor-web.vercel.app/',
      }),
    ).toMatchObject({
      WEB_ORIGIN: 'https://avend-asesor-web.vercel.app',
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
    { WEB_ORIGIN: 'https://avend-asesor-web.vercel.app/path' },
    { WEB_ORIGIN: 'https://avend-asesor-web.vercel.app?redirect=unsafe' },
    { WEB_ORIGIN: 'https://avend-asesor-web.vercel.app#unsafe' },
    { WEB_ORIGIN: 'https://user:password@avend-asesor-web.vercel.app' },
    { WEB_ORIGIN: 'file:///tmp/avend' },
    { WEB_ORIGIN: 'data:text/plain,unsafe' },
    { WEB_ORIGIN: 'ftp://avend-asesor-web.vercel.app' },
    { NODE_ENV: 'production', WEB_ORIGIN: 'http://avend-asesor-web.local' },
    { RAG_INGESTION_LEASE_SECONDS: '1' },
    { RAG_INGESTION_WORKER_ENABLED: 'enabled' },
    { RAG_MATCH_COUNT: '11' },
    { RAG_MATCH_THRESHOLD: '1.1' },
    { CHAT_HISTORY_LIMIT: '51' },
    { RAG_ANSWER_MODEL: ' ' },
    { FAQ_MEMORY_FINGERPRINT_SECRET: 'short' },
    // Worker de ingesta encendido sin ninguna clave de proveedor (H2): fallo
    // de arranque explícito en vez de fallar cada job silenciosamente.
    { RAG_INGESTION_WORKER_ENABLED: 'true' },
  ])('rejects an unsafe configuration: %o', (configuration) => {
    expect(() => validateEnvironment(configuration)).toThrow(
      'Invalid environment configuration.',
    );
  });

  it('accepts the ingestion worker when a provider key is present', () => {
    expect(
      validateEnvironment({
        RAG_INGESTION_WORKER_ENABLED: 'true',
        OPENROUTER_API_KEY: 'sk-or-test-key',
      }),
    ).toMatchObject({
      RAG_INGESTION_WORKER_ENABLED: true,
      OPENROUTER_API_KEY: 'sk-or-test-key',
    });
  });
});
