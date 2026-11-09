import { HealthService } from './health.service';
import { ServiceUnavailableException } from '@nestjs/common';
import type { RagReadinessService } from '../rag-admin/rag-readiness.service';

function ragReadiness(ready: boolean): RagReadinessService {
  return {
    getReadiness: jest.fn().mockResolvedValue({ ready }),
  } as unknown as RagReadinessService;
}

describe('HealthService', () => {
  it('keeps liveness independent from external RAG dependencies', () => {
    const service = new HealthService(ragReadiness(false));

    expect(service.getStatus()).toEqual({
      service: 'avend-asesor-api',
      status: 'ok',
    });
  });

  it('reports ready only when functional RAG is ready', async () => {
    const service = new HealthService(ragReadiness(true));

    await expect(service.getReadiness()).resolves.toEqual({
      service: 'avend-asesor-api',
      status: 'ready',
    });
  });

  it.each([
    ['Supabase is unavailable', false],
    ['RAG is not functionally ready', false],
  ])('fails closed when %s', async (_label, ragReady) => {
    const service = new HealthService(ragReadiness(ragReady));

    await expect(service.getReadiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
