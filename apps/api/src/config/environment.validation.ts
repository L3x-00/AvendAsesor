import { z } from 'zod';

const webOriginSchema = z
  .string()
  .url()
  .transform((value, context) => {
    const origin = new URL(value);

    if (
      (origin.protocol !== 'http:' && origin.protocol !== 'https:') ||
      origin.origin === 'null' ||
      origin.username !== '' ||
      origin.password !== '' ||
      (origin.pathname !== '' && origin.pathname !== '/') ||
      origin.search !== '' ||
      origin.hash !== ''
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'WEB_ORIGIN must be a credential-free HTTP(S) origin.',
      });
      return z.NEVER;
    }

    return origin.origin;
  });

const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'staging', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    RAG_INGESTION_LEASE_SECONDS: z.coerce
      .number()
      .int()
      .min(30)
      .max(900)
      .default(300),
    RAG_INGESTION_WORKER_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    RAG_MATCH_COUNT: z.coerce.number().int().min(1).max(10).default(5),
    RAG_MATCH_THRESHOLD: z.coerce.number().min(0).max(1).default(0.7),
    RAG_EMBEDDING_MODEL: z
      .string()
      .trim()
      .min(1)
      .default('text-embedding-3-small'),
    RAG_ANSWER_MODEL: z.string().trim().min(1).default('gpt-4o-mini'),
    // Modelo pagado de respaldo; solo se usa ante error técnico del primario.
    RAG_ANSWER_FALLBACK_MODEL: z.string().trim().min(1).optional(),
    // Gateway único de IA. Con OPENROUTER_API_KEY se enruta todo por OpenRouter;
    // en su ausencia se usa OPENAI_API_KEY directo. AI_GATEWAY_BASE_URL permite
    // sobreescribir el endpoint compatible con la API de OpenAI.
    OPENROUTER_API_KEY: z.string().trim().min(1).optional(),
    OPENAI_API_KEY: z.string().trim().min(1).optional(),
    AI_GATEWAY_BASE_URL: z.string().url().optional(),
    FAQ_MEMORY_FINGERPRINT_SECRET: z.string().trim().min(32).optional(),
    CHAT_HISTORY_LIMIT: z.coerce.number().int().min(1).max(50).default(20),
    WEB_ORIGIN: webOriginSchema.default('http://localhost:3000'),
  })
  .superRefine((environment, context) => {
    if (
      (environment.NODE_ENV === 'production' ||
        environment.NODE_ENV === 'staging') &&
      !environment.WEB_ORIGIN.startsWith('https://')
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Staging and production WEB_ORIGIN must use HTTPS.',
        path: ['WEB_ORIGIN'],
      });
    }
  })
  .passthrough();

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(
  configuration: Record<string, unknown>,
): Environment {
  const result = environmentSchema.safeParse(configuration);

  if (!result.success) {
    throw new Error('Invalid environment configuration.');
  }

  return result.data;
}
