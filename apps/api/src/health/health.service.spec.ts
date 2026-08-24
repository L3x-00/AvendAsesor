import { HealthService } from './health.service';
import { ServiceUnavailableException } from '@nestjs/common';

describe('HealthService', () => {
  it('returns the stable API health payload', () => {
    const service = new HealthService({ isReady: jest.fn() });

    expect(service.getStatus()).toEqual({
      service: 'avend-asesor-api',
      status: 'ok',
    });
  });

  it('reports ready only when the required dependency is ready', async () => {
    const isReady = jest.fn().mockResolvedValue(true);
    const service = new HealthService({ isReady });

    await expect(service.getReadiness()).resolves.toEqual({
      service: 'avend-asesor-api',
      status: 'ready',
    });
    expect(isReady).toHaveBeenCalledTimes(1);
  });

  it('fails closed when a required dependency is unavailable', async () => {
    const service = new HealthService({
      isReady: jest.fn().mockResolvedValue(false),
    });

    await expect(service.getReadiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
