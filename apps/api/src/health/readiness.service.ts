import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SUPABASE_SERVER_CLIENT } from '../supabase/supabase.constants';
import type { SupabaseServerClient } from '../supabase/supabase.server-client';

export interface ReadinessStatus {
  service: 'avend-asesor-api';
  status: 'ready';
}

@Injectable()
export class ReadinessService {
  constructor(
    @Inject(SUPABASE_SERVER_CLIENT)
    private readonly supabaseClient: SupabaseServerClient | null,
  ) {}

  async getStatus(): Promise<ReadinessStatus> {
    if (!this.supabaseClient) {
      throw new ServiceUnavailableException();
    }

    try {
      const { error } = await this.supabaseClient.auth.admin.listUsers({
        page: 1,
        perPage: 1,
      });

      if (error) {
        throw new ServiceUnavailableException();
      }
    } catch (error: unknown) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      throw new ServiceUnavailableException();
    }

    return {
      service: 'avend-asesor-api',
      status: 'ready',
    };
  }
}
