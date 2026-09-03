import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ADMIN_HOME_MODULE_NAMES } from '../administration/admin-dashboard.gateway';
import { SupabaseAdminDashboardGatewayAdapter } from './supabase-admin-dashboard.gateway';
import type { SupabaseServerClient } from './supabase.server-client';

function clientWith(rpc: jest.Mock): SupabaseServerClient {
  return { rpc } as unknown as SupabaseServerClient;
}

const moduleSummaries = ADMIN_HOME_MODULE_NAMES.map((name, index) => ({
  documentCount: index + 2,
  id: `00000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`,
  name,
  submoduleCount: index + 1,
}));

describe('SupabaseAdminDashboardGatewayAdapter', () => {
  it('requests, validates and maps the complete dashboard aggregate', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [
        {
          active_modules: 7,
          active_submodules: 14,
          active_users: 30,
          ai_queries_processed: 45,
          expired_users: 3,
          expiring_soon_users: 4,
          expiry_window_days: 7,
          module_summaries: moduleSummaries,
          total_documents: 21,
          total_queries: 50,
          total_users: 37,
        },
      ],
      error: null,
    });
    const gateway = new SupabaseAdminDashboardGatewayAdapter(clientWith(rpc));
    const administratorId = '80a15a92-9899-4ee2-81e0-30d7c3f7677c';

    await expect(
      gateway.getDashboard({ administratorId, expiringSoonDays: 7 }),
    ).resolves.toEqual({
      activeModules: 7,
      activeSubmodules: 14,
      activeUsers: 30,
      aiQueriesProcessed: 45,
      expiredUsers: 3,
      expiringSoonUsers: 4,
      expiryWindowDays: 7,
      moduleSummaries,
      totalDocuments: 21,
      totalQueries: 50,
      totalUsers: 37,
    });
    expect(rpc).toHaveBeenCalledWith('get_admin_home_dashboard_metrics', {
      p_administrator_id: administratorId,
      p_expiring_soon_days: 7,
    });
  });

  it.each([
    ['42501', ForbiddenException],
    ['22023', BadRequestException],
    ['P0002', ServiceUnavailableException],
    ['XX000', ServiceUnavailableException],
  ])(
    'maps database error %s without leaking details',
    async (code, Exception) => {
      const gateway = new SupabaseAdminDashboardGatewayAdapter(
        clientWith(
          jest.fn().mockResolvedValue({ data: null, error: { code } }),
        ),
      );

      await expect(
        gateway.getDashboard({
          administratorId: '80a15a92-9899-4ee2-81e0-30d7c3f7677c',
          expiringSoonDays: 7,
        }),
      ).rejects.toBeInstanceOf(Exception);
    },
  );

  it.each([
    [null],
    [{ ...moduleSummaries[0], name: 'Módulo no canónico' }],
    [
      ...moduleSummaries.slice(0, 6),
      { ...moduleSummaries[6], documentCount: -1 },
    ],
  ])(
    'fails closed for malformed module summaries',
    async (...invalidSummary) => {
      const gateway = new SupabaseAdminDashboardGatewayAdapter(
        clientWith(
          jest.fn().mockResolvedValue({
            data: [
              {
                active_modules: 0,
                active_submodules: 0,
                active_users: 0,
                ai_queries_processed: 0,
                expired_users: 0,
                expiring_soon_users: 0,
                expiry_window_days: 7,
                module_summaries: invalidSummary,
                total_documents: 0,
                total_queries: 0,
                total_users: 0,
              },
            ],
            error: null,
          }),
        ),
      );

      await expect(
        gateway.getDashboard({
          administratorId: '80a15a92-9899-4ee2-81e0-30d7c3f7677c',
          expiringSoonDays: 7,
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    },
  );

  it('fails closed for a missing result, an inconsistent window and an unconfigured client', async () => {
    const missing = new SupabaseAdminDashboardGatewayAdapter(
      clientWith(jest.fn().mockResolvedValue({ data: [], error: null })),
    );
    const inconsistent = new SupabaseAdminDashboardGatewayAdapter(
      clientWith(
        jest.fn().mockResolvedValue({
          data: [{ expiry_window_days: 30 }],
          error: null,
        }),
      ),
    );
    const unconfigured = new SupabaseAdminDashboardGatewayAdapter(null);
    const input = {
      administratorId: '80a15a92-9899-4ee2-81e0-30d7c3f7677c',
      expiringSoonDays: 7,
    };

    await expect(missing.getDashboard(input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(inconsistent.getDashboard(input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(unconfigured.getDashboard(input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
