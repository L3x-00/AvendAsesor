import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SupabaseUserAdministrationGatewayAdapter } from './supabase-user-administration.gateway';
import type { SupabaseServerClient } from './supabase.server-client';

function clientWith(rpc: jest.Mock): SupabaseServerClient {
  return { rpc } as unknown as SupabaseServerClient;
}

describe('SupabaseUserAdministrationGatewayAdapter', () => {
  it('maps the minimal safe administrative user and audit contracts', async () => {
    const rpc = jest
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            items: [
              {
                access_expires_at: '2027-01-01T00:00:00.000Z',
                access_start_at: null,
                access_state: 'activo',
                account_status: 'active',
                full_name: 'Administrador Demo',
                id: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
                last_access_at: null,
                role: 'admin',
              },
            ],
            total_count: 1,
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            action: 'user_role_changed',
            actor_id: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
            actor_role: 'superadmin',
            id: '80a15a92-9899-4ee2-81e0-30d7c3f7677c',
            metadata: { fromRole: 'docente', toRole: 'admin' },
            occurred_at: '2026-08-23T00:00:00.000Z',
            resource_id: '90a15a92-9899-4ee2-81e0-30d7c3f7677c',
            resource_type: 'profile',
          },
        ],
        error: null,
      });
    const gateway = new SupabaseUserAdministrationGatewayAdapter(
      clientWith(rpc),
    );

    await expect(
      gateway.listUsers({
        accessState: null,
        actorId: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
        group: 'staff',
        limit: 10,
        offset: 20,
        search: null,
        status: 'active',
      }),
    ).resolves.toEqual({
      items: [
        {
          accessExpiresAt: '2027-01-01T00:00:00.000Z',
          accessStartAt: null,
          accessState: 'activo',
          accountStatus: 'active',
          fullName: 'Administrador Demo',
          id: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
          lastAccessAt: null,
          role: 'admin',
        },
      ],
      limit: 10,
      offset: 20,
      total: 1,
    });
    expect(rpc).toHaveBeenNthCalledWith(1, 'list_administrative_users_page', {
      p_access_state: null,
      p_account_status: 'active',
      p_actor_id: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
      p_group: 'staff',
      p_limit: 10,
      p_offset: 20,
      p_search: null,
    });
    await expect(
      gateway.listAuditEvents({
        actorId: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
        limit: 10,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        action: 'user_role_changed',
        metadata: { fromRole: 'docente', toRole: 'admin' },
        resourceType: 'profile',
      }),
    ]);
  });

  it('fails closed for malformed audit metadata or unavailable dependencies', async () => {
    const malformed = new SupabaseUserAdministrationGatewayAdapter(
      clientWith(
        jest.fn().mockResolvedValue({
          data: [
            {
              action: 'user_role_changed',
              actor_id: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
              actor_role: 'superadmin',
              id: '80a15a92-9899-4ee2-81e0-30d7c3f7677c',
              metadata: 'not-an-object',
              occurred_at: '2026-08-23T00:00:00.000Z',
              resource_id: '90a15a92-9899-4ee2-81e0-30d7c3f7677c',
              resource_type: 'profile',
            },
          ],
          error: null,
        }),
      ),
    );
    const unavailable = new SupabaseUserAdministrationGatewayAdapter(null);

    await expect(
      malformed.listAuditEvents({
        actorId: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
        limit: 10,
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    await expect(
      unavailable.listUsers({
        accessState: null,
        actorId: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
        group: null,
        limit: 10,
        offset: 0,
        search: null,
        status: null,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('maps a database permission denial without disclosing provider details', async () => {
    const gateway = new SupabaseUserAdministrationGatewayAdapter(
      clientWith(
        jest.fn().mockResolvedValue({
          data: null,
          error: { code: '42501' },
        }),
      ),
    );

    await expect(
      gateway.listUsers({
        accessState: null,
        actorId: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
        group: null,
        limit: 10,
        offset: 0,
        search: null,
        status: null,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('maps update results and rejects missing or conflicting database outcomes', async () => {
    const successful = new SupabaseUserAdministrationGatewayAdapter(
      clientWith(
        jest.fn().mockResolvedValue({
          data: [
            {
              account_status: 'suspended',
              full_name: 'Cuenta Objetivo',
              id: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
              last_access_at: null,
              role: 'docente',
            },
          ],
          error: null,
        }),
      ),
    );
    const missingResult = new SupabaseUserAdministrationGatewayAdapter(
      clientWith(jest.fn().mockResolvedValue({ data: [], error: null })),
    );
    const conflict = new SupabaseUserAdministrationGatewayAdapter(
      clientWith(
        jest.fn().mockResolvedValue({
          data: null,
          error: { code: '23514' },
        }),
      ),
    );
    const input = {
      accountStatus: 'suspended' as const,
      actorId: '80a15a92-9899-4ee2-81e0-30d7c3f7677c',
      reason: 'Incidencia confirmada.',
      role: null,
      targetUserId: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
    };

    await expect(successful.updateUser(input)).resolves.toEqual({
      accountStatus: 'suspended',
      fullName: 'Cuenta Objetivo',
      id: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
      lastAccessAt: null,
      role: 'docente',
    });
    await expect(missingResult.updateUser(input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(conflict.updateUser(input)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it.each([
    ['P0002', NotFoundException],
    ['22023', BadRequestException],
    ['P0001', ConflictException],
    ['XX000', ServiceUnavailableException],
  ])(
    'maps administrative database error %s safely',
    async (code, Exception) => {
      const gateway = new SupabaseUserAdministrationGatewayAdapter(
        clientWith(
          jest.fn().mockResolvedValue({ data: null, error: { code } }),
        ),
      );

      await expect(
        gateway.listAuditEvents({
          actorId: '80a15a92-9899-4ee2-81e0-30d7c3f7677c',
          limit: 10,
        }),
      ).rejects.toBeInstanceOf(Exception);
    },
  );

  it('maps directory bucket counts from the count RPC', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [
        {
          active_count: 3,
          expired_count: 1,
          expiring_soon_count: 2,
          suspended_count: 4,
          total_count: 8,
        },
      ],
      error: null,
    });
    const gateway = new SupabaseUserAdministrationGatewayAdapter(
      clientWith(rpc),
    );

    await expect(
      gateway.countUsers({
        actorId: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
        group: 'docente',
        search: null,
      }),
    ).resolves.toEqual({
      active: 3,
      expired: 1,
      expiringSoon: 2,
      suspended: 4,
      total: 8,
    });
    expect(rpc).toHaveBeenCalledWith('count_administrative_users', {
      p_actor_id: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
      p_group: 'docente',
      p_search: null,
    });
  });

  it('maps an access-window update and derives the state the RPC omits', async () => {
    const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const rpc = jest.fn().mockResolvedValue({
      data: [
        {
          access_expires_at: soon,
          access_start_at: null,
          account_status: 'active',
          full_name: 'Docente Objetivo',
          id: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
          last_access_at: null,
          role: 'docente',
        },
      ],
      error: null,
    });
    const gateway = new SupabaseUserAdministrationGatewayAdapter(
      clientWith(rpc),
    );

    await expect(
      gateway.updateAccessWindow({
        accessExpiresAt: soon,
        accessStartAt: null,
        actorId: '80a15a92-9899-4ee2-81e0-30d7c3f7677c',
        reason: 'Extensión de vigencia.',
        targetUserId: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
      }),
    ).resolves.toEqual({
      accessExpiresAt: soon,
      accessStartAt: null,
      accessState: 'por_vencer',
      accountStatus: 'active',
      fullName: 'Docente Objetivo',
      id: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
      lastAccessAt: null,
      role: 'docente',
    });
    expect(rpc).toHaveBeenCalledWith(
      'update_administrative_user_access_window',
      {
        p_access_expires_at: soon,
        p_access_start_at: null,
        p_actor_id: '80a15a92-9899-4ee2-81e0-30d7c3f7677c',
        p_reason: 'Extensión de vigencia.',
        p_target_user_id: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
      },
    );
  });

  it('fails closed on an unknown derived access state in a directory row', async () => {
    const gateway = new SupabaseUserAdministrationGatewayAdapter(
      clientWith(
        jest.fn().mockResolvedValue({
          data: [
            {
              items: [
                {
                  access_expires_at: null,
                  access_start_at: null,
                  access_state: 'desconocido',
                  account_status: 'active',
                  full_name: 'Fila Corrupta',
                  id: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
                  last_access_at: null,
                  role: 'docente',
                },
              ],
              total_count: 1,
            },
          ],
          error: null,
        }),
      ),
    );

    await expect(
      gateway.listUsers({
        accessState: null,
        actorId: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
        group: null,
        limit: 10,
        offset: 0,
        search: null,
        status: null,
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
