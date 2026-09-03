import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { PostgrestError } from '@supabase/supabase-js';
import {
  ADMIN_HOME_MODULE_NAMES,
  type AdminDashboardGateway,
  type AdminHomeDashboard,
  type AdminHomeModuleSummary,
} from '../administration/admin-dashboard.gateway';
import type { Json, SupabaseServerClient } from './supabase.server-client';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function databaseError(error: PostgrestError): never {
  if (error.code === '42501') {
    throw new ForbiddenException('Administrative dashboard access is denied.');
  }
  if (error.code === '22023') {
    throw new BadRequestException(
      'The administrative dashboard request is invalid.',
    );
  }
  throw new ServiceUnavailableException(
    'Administrative dashboard data is temporarily unavailable.',
  );
}

function unavailableResponse(): never {
  throw new ServiceUnavailableException(
    'Administrative dashboard data is unavailable.',
  );
}

function requireCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    unavailableResponse();
  }
  return value;
}

function mapModuleSummaries(value: Json): AdminHomeModuleSummary[] {
  if (
    !Array.isArray(value) ||
    value.length !== ADMIN_HOME_MODULE_NAMES.length
  ) {
    unavailableResponse();
  }

  const seenIds = new Set<string>();
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      unavailableResponse();
    }

    const id = item.id;
    const name = item.name;
    if (
      typeof id !== 'string' ||
      !UUID_PATTERN.test(id) ||
      seenIds.has(id) ||
      name !== ADMIN_HOME_MODULE_NAMES[index]
    ) {
      unavailableResponse();
    }
    seenIds.add(id);

    return {
      documentCount: requireCount(item.documentCount),
      id,
      name,
      submoduleCount: requireCount(item.submoduleCount),
    };
  });
}

@Injectable()
export class SupabaseAdminDashboardGatewayAdapter implements AdminDashboardGateway {
  constructor(private readonly client: SupabaseServerClient | null) {}

  async getDashboard(
    input: Parameters<AdminDashboardGateway['getDashboard']>[0],
  ): Promise<AdminHomeDashboard> {
    const { data, error } = await this.requireClient().rpc(
      'get_admin_home_dashboard_metrics',
      {
        p_administrator_id: input.administratorId,
        p_expiring_soon_days: input.expiringSoonDays,
      },
    );
    if (error) databaseError(error);

    const result = data?.[0];
    if (!result || result.expiry_window_days !== input.expiringSoonDays) {
      unavailableResponse();
    }

    return {
      activeModules: requireCount(result.active_modules),
      activeSubmodules: requireCount(result.active_submodules),
      activeUsers: requireCount(result.active_users),
      aiQueriesProcessed: requireCount(result.ai_queries_processed),
      expiredUsers: requireCount(result.expired_users),
      expiringSoonUsers: requireCount(result.expiring_soon_users),
      expiryWindowDays: result.expiry_window_days,
      moduleSummaries: mapModuleSummaries(result.module_summaries),
      totalDocuments: requireCount(result.total_documents),
      totalQueries: requireCount(result.total_queries),
      totalUsers: requireCount(result.total_users),
    };
  }

  private requireClient(): SupabaseServerClient {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Administrative dashboard data is not configured.',
      );
    }
    return this.client;
  }
}
