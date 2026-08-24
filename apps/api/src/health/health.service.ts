import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SUPABASE_HEALTH_GATEWAY } from '../supabase/supabase.constants';
import type { SupabaseHealthGateway } from '../supabase/supabase-health.gateway';

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
  constructor(
    @Inject(SUPABASE_HEALTH_GATEWAY)
    private readonly supabaseHealthGateway: SupabaseHealthGateway,
  ) {}

  getStatus(): HealthStatus {
    return {
      service: 'avend-asesor-api',
      status: 'ok',
    };
  }

  async getReadiness(): Promise<HealthReadinessStatus> {
    if (!(await this.supabaseHealthGateway.isReady())) {
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
