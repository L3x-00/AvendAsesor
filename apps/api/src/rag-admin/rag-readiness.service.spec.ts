import type { ConfigService } from '@nestjs/config';
import { RagReadinessService } from './rag-readiness.service';
import type { RagReadinessGateway } from '../supabase/supabase-rag-readiness.gateway';
import type { SupabaseHealthGateway } from '../supabase/supabase-health.gateway';
import type { EmbeddingsGateway } from '../ingestion/embeddings.gateway';
import type { RetrievalContractProbe } from '../rag/retrieval-contract.probe';

function configWith(values: Record<string, unknown>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

const counts = { pending: 0, processing: 0, indexed: 5, failed: 0, total: 5 };

function createService(
  options: {
    config?: Record<string, unknown>;
    counts?: typeof counts | null;
    embeddingsReady?: boolean;
    retrievalReady?: boolean;
    supabaseReady?: boolean;
  } = {},
) {
  const gateway: RagReadinessGateway = {
    getIngestionCounts: jest.fn().mockResolvedValue(options.counts ?? counts),
  };
  const supabase: SupabaseHealthGateway = {
    isReady: jest.fn().mockResolvedValue(options.supabaseReady ?? true),
  };
  const embed = jest.fn(() =>
    options.embeddingsReady === false
      ? Promise.reject(new Error('provider down'))
      : Promise.resolve([[0.1, 0.2]]),
  );
  const embeddings: EmbeddingsGateway = { embed };
  const retrieval = {
    check: jest
      .fn()
      .mockResolvedValue(
        options.retrievalReady === false
          ? { ok: false, reason: 'missing', message: 'not found' }
          : { ok: true },
      ),
  } as unknown as RetrievalContractProbe;
  const service = new RagReadinessService(
    configWith({
      RAG_INGESTION_WORKER_ENABLED: true,
      OPENROUTER_API_KEY: 'configured',
      ...options.config,
    }),
    gateway,
    supabase,
    embeddings,
    retrieval,
  );
  return { service, embed, gateway };
}

describe('RagReadinessService', () => {
  it('reports readiness only after Supabase, retrieval and embeddings work', async () => {
    const { service } = createService({ config: { RAG_MATCH_THRESHOLD: 0.5 } });

    await expect(service.getReadiness()).resolves.toMatchObject({
      workerEnabled: true,
      provider: 'openrouter',
      providerConfigured: true,
      matchThreshold: 0.5,
      counts,
      supabaseReady: true,
      retrievalContractReady: true,
      embeddingsReady: true,
      ingestionReady: true,
      ready: true,
    });
  });

  it.each([
    ['Supabase is unavailable', { supabaseReady: false }],
    ['the retrieval RPC is unavailable', { retrievalReady: false }],
    ['the embeddings provider is unavailable', { embeddingsReady: false }],
  ])('fails closed when %s', async (_label, options) => {
    const { service } = createService(options);
    await expect(service.getReadiness()).resolves.toMatchObject({
      ready: false,
    });
  });

  it('keeps RAG query readiness separate from a stopped ingestion worker', async () => {
    const { service } = createService({
      config: { RAG_INGESTION_WORKER_ENABLED: false },
    });

    await expect(service.getReadiness()).resolves.toMatchObject({
      workerEnabled: false,
      ingestionReady: false,
      ready: true,
    });
  });

  it('remains responsive and reports ingestion unavailable when counts reject', async () => {
    const { service, gateway } = createService();
    (gateway.getIngestionCounts as jest.Mock).mockRejectedValue(
      new Error('timeout'),
    );

    await expect(service.getReadiness()).resolves.toMatchObject({
      counts: null,
      ingestionReady: false,
      ready: true,
    });
  });

  it('shares repeated checks, then recovers after the cache expires', async () => {
    jest.useFakeTimers();
    const { service, embed } = createService({ embeddingsReady: false });

    const first = service.getReadiness();
    const second = service.getReadiness();
    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ ready: false }),
      expect.objectContaining({ ready: false }),
    ]);
    expect(embed).toHaveBeenCalledTimes(1);

    embed.mockResolvedValue([[0.1, 0.2]]);
    jest.advanceTimersByTime(15_001);
    await expect(service.getReadiness()).resolves.toMatchObject({
      ready: true,
    });
    expect(embed).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });
});
