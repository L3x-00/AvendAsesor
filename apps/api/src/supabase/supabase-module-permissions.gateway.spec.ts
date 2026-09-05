import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SupabaseModulePermissionsGatewayAdapter } from './supabase-module-permissions.gateway';
import type { SupabaseServerClient } from './supabase.server-client';

const actorId = '4814398e-8d0a-49a0-ac18-4fa3cffb063f';
const targetUserId = '30db913a-7c14-4eaa-872c-fa4eaf6e68b2';
const permissionRow = {
  can_access: false,
  full_name: 'Administradora de prueba',
  role: 'admin' as const,
  updated_at: '2026-09-05T12:00:00Z',
  updated_by: actorId,
  user_id: targetUserId,
};
const change = {
  actorId,
  canAccess: false,
  reason: 'Cambio de responsabilidades',
  targetUserId,
};

function createGateway(data: unknown = [permissionRow], code?: string) {
  const rpc = jest.fn().mockResolvedValue({
    data,
    error: code
      ? {
          code,
          details: 'private detail',
          hint: '',
          message: 'database failure',
        }
      : null,
  });
  return {
    gateway: new SupabaseModulePermissionsGatewayAdapter({
      rpc,
    } as unknown as SupabaseServerClient),
    rpc,
  };
}

describe('SupabaseModulePermissionsGatewayAdapter', () => {
  it('maps directory permissions and preserves the actor on the restricted RPC', async () => {
    const { gateway, rpc } = createGateway();

    await expect(gateway.list(actorId)).resolves.toEqual([
      {
        canAccess: false,
        fullName: permissionRow.full_name,
        role: 'admin',
        updatedAt: permissionRow.updated_at,
        updatedBy: actorId,
        userId: targetUserId,
      },
    ]);
    expect(rpc).toHaveBeenCalledWith('list_admin_module_permissions', {
      p_actor_id: actorId,
    });
  });

  it('returns an empty directory when the database has no permission rows', async () => {
    const { gateway } = createGateway(null);
    await expect(gateway.list(actorId)).resolves.toEqual([]);
  });

  it('confirms a permission change with its reason and authoritative returned value', async () => {
    const { gateway, rpc } = createGateway();

    await expect(gateway.set(change)).resolves.toMatchObject({
      canAccess: false,
      updatedBy: actorId,
      userId: targetUserId,
    });
    expect(rpc).toHaveBeenCalledWith('set_admin_module_permission', {
      p_actor_id: actorId,
      p_can_access: false,
      p_reason: change.reason,
      p_target_user_id: targetUserId,
    });
  });

  it.each([null, []])(
    'never reports success for an unconfirmed change: %j',
    async (data) => {
      const { gateway } = createGateway(data);
      await expect(gateway.set(change)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    },
  );

  it.each([
    ['42501', ForbiddenException],
    ['P0002', NotFoundException],
    ['22023', BadRequestException],
    ['XX000', ServiceUnavailableException],
  ])(
    'maps %s consistently for listing and changing permissions',
    async (code, exception) => {
      const { gateway } = createGateway(null, code);
      await expect(gateway.list(actorId)).rejects.toBeInstanceOf(exception);
      await expect(gateway.set(change)).rejects.toBeInstanceOf(exception);
    },
  );

  it('fails closed for both operations when server configuration is absent', async () => {
    const gateway = new SupabaseModulePermissionsGatewayAdapter(null);
    await expect(gateway.list(actorId)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(gateway.set(change)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
