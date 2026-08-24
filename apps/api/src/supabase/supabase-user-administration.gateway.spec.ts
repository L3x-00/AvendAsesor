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
            account_status: 'active',
            created_at: '2026-08-23T00:00:00.000Z',
            full_name: 'Administrador Demo',
            id: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
            last_access_at: null,
            role: 'admin',
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
        actorId: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
        limit: 10,
        search: null,
      }),
    ).resolves.toEqual([
      {
        accountStatus: 'active',
        fullName: 'Administrador Demo',
        id: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
        lastAccessAt: null,
        role: 'admin',
      },
    ]);
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
        actorId: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
        limit: 10,
        search: null,
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
        actorId: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
        limit: 10,
        search: null,
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
});
