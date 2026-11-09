import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { RagReadinessService } from '../rag-admin/rag-readiness.service';

export interface HealthStatus {
  service: 'avend-asesor-api';
  status: 'ok';
}

export interface HealthReadinessStatus {
  service: 'avend-asesor-api';
  status: 'ready';
}

@Injectable()
export class HealthService {
  constructor(private readonly ragReadinessService: RagReadinessService) {}

  getStatus(): HealthStatus {
    return {
      service: 'avend-asesor-api',
      status: 'ok',
    };
  }

  async getReadiness(): Promise<HealthReadinessStatus> {
    const ragReadiness = await this.ragReadinessService.getReadiness();
    if (!ragReadiness.ready) {
      throw new ServiceUnavailableException(
        'Service dependencies are unavailable.',
      );
    }

    return {
      service: 'avend-asesor-api',
      status: 'ready',
    };
  }
}
