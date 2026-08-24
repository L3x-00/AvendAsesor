import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { SUPABASE_HEALTH_GATEWAY } from '../supabase/supabase.constants';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        {
          provide: SUPABASE_HEALTH_GATEWAY,
          useValue: { isReady: jest.fn().mockResolvedValue(true) },
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

  it('delegates readiness to the service', async () => {
    await expect(controller.getReadiness()).resolves.toEqual({
      service: 'avend-asesor-api',
      status: 'ready',
    });
  });
});
