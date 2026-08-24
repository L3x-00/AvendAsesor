import { z } from 'zod';

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
    FAQ_MEMORY_FINGERPRINT_SECRET: z.string().trim().min(32).optional(),
    CHAT_HISTORY_LIMIT: z.coerce.number().int().min(1).max(50).default(20),
    WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
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
