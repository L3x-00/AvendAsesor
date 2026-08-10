import { HealthService } from './health.service';

describe('HealthService', () => {
  it('returns the stable API health payload', () => {
    const service = new HealthService();

    expect(service.getStatus()).toEqual({
      service: 'avend-asesor-api',
      status: 'ok',
    });
  });
});
