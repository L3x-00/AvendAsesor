import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { ReadinessService } from './readiness.service';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        {
          provide: ReadinessService,
          useValue: { getStatus: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('delegates the health status to the service', () => {
    expect(controller.getStatus()).toEqual({
      service: 'avend-asesor-api',
      status: 'ok',
    });
  });

  it('delegates readiness to the Supabase-backed readiness service', async () => {
    const readinessService = {
      getStatus: jest.fn().mockResolvedValue({
        service: 'avend-asesor-api',
        status: 'ready',
      }),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        {
          provide: ReadinessService,
          useValue: readinessService,
        },
      ],
    }).compile();

    await expect(
      module.get<HealthController>(HealthController).getReadiness(),
    ).resolves.toEqual({
      service: 'avend-asesor-api',
      status: 'ready',
    });
    expect(readinessService.getStatus).toHaveBeenCalledTimes(1);
  });
});
