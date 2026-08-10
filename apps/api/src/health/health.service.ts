import { Injectable } from '@nestjs/common';

export interface HealthStatus {
  service: 'avend-asesor-api';
  status: 'ok';
}

@Injectable()
export class HealthService {
  getStatus(): HealthStatus {
    return {
      service: 'avend-asesor-api',
      status: 'ok',
    };
  }
}
