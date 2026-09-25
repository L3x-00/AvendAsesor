/* eslint-disable @typescript-eslint/unbound-method */
import { RagReadinessController } from './rag-readiness.controller';
import {
  RagReadinessService,
  type RagReadiness,
} from './rag-readiness.service';

describe('RagReadinessController', () => {
  it('delegates readiness to the service without building data in the controller', async () => {
    const readiness: RagReadiness = {
      workerEnabled: true,
      provider: 'openrouter',
      providerConfigured: true,
      embeddingModel: 'text-embedding-3-small',
      answerModel: 'gpt-4o-mini',
      matchThreshold: 0.5,
      counts: { pending: 0, processing: 0, indexed: 5, failed: 0, total: 5 },
      ready: true,
    };
    const service = {
      getReadiness: jest.fn().mockResolvedValue(readiness),
    } as unknown as jest.Mocked<RagReadinessService>;
    const controller = new RagReadinessController(service);

    await expect(controller.getReadiness()).resolves.toEqual(readiness);
    expect(service.getReadiness).toHaveBeenCalledTimes(1);
  });
});
