import type { ConfigService } from '@nestjs/config';
import { RagReadinessService } from './rag-readiness.service';
import type { RagReadinessGateway } from '../supabase/supabase-rag-readiness.gateway';

function configWith(values: Record<string, unknown>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

const counts = { pending: 0, processing: 0, indexed: 5, failed: 0, total: 5 };

describe('RagReadinessService', () => {
  it('is ready when worker is on, a provider key is set and the store is reachable', async () => {
    const gateway: RagReadinessGateway = {
      getIngestionCounts: jest.fn().mockResolvedValue(counts),
    };
    const service = new RagReadinessService(
      configWith({
        RAG_INGESTION_WORKER_ENABLED: true,
        OPENROUTER_API_KEY: 'sk-or-test',
        RAG_MATCH_THRESHOLD: 0.5,
      }),
      gateway,
    );

    await expect(service.getReadiness()).resolves.toMatchObject({
      workerEnabled: true,
      provider: 'openrouter',
      providerConfigured: true,
      matchThreshold: 0.5,
      counts,
      ready: true,
    });
  });

  it('falls back to OpenAI and is not ready while the worker is off', async () => {
    const gateway: RagReadinessGateway = {
      getIngestionCounts: jest.fn().mockResolvedValue(counts),
    };
    const service = new RagReadinessService(
      configWith({
        RAG_INGESTION_WORKER_ENABLED: false,
        OPENAI_API_KEY: 'sk-openai',
      }),
      gateway,
    );

    await expect(service.getReadiness()).resolves.toMatchObject({
      workerEnabled: false,
      provider: 'openai',
      providerConfigured: true,
      ready: false,
    });
  });

  it('reports provider none and not ready when there is no key or the store is unreachable', async () => {
    const gateway: RagReadinessGateway = {
      getIngestionCounts: jest.fn().mockResolvedValue(null),
    };
    const service = new RagReadinessService(
      configWith({ RAG_INGESTION_WORKER_ENABLED: true }),
      gateway,
    );

    await expect(service.getReadiness()).resolves.toMatchObject({
      provider: 'none',
      providerConfigured: false,
      counts: null,
      ready: false,
      embeddingModel: 'text-embedding-3-small',
      answerModel: 'gpt-4o-mini',
      matchThreshold: 0.7,
    });
  });
});
