import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { PostgrestError } from '@supabase/supabase-js';
import type {
  AdminModulePermission,
  ModulePermissionsGateway,
} from '../module-permissions/module-permissions.gateway';
import type { SupabaseServerClient } from './supabase.server-client';

function databaseError(error: PostgrestError): never {
  if (error.code === '42501') throw new ForbiddenException();
  if (error.code === 'P0002') throw new NotFoundException();
  if (error.code === '22023') throw new BadRequestException();
  throw new ServiceUnavailableException(
    'Module permissions are temporarily unavailable.',
  );
}

function map(row: {
  can_access: boolean;
  full_name: string;
  role: 'admin' | 'superadmin';
  updated_at: string | null;
  updated_by: string | null;
  user_id: string;
}): AdminModulePermission {
  return {
    canAccess: row.can_access,
    fullName: row.full_name,
    role: row.role,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    userId: row.user_id,
  };
}

@Injectable()
export class SupabaseModulePermissionsGatewayAdapter implements ModulePermissionsGateway {
  constructor(private readonly client: SupabaseServerClient | null) {}

  async list(actorId: string): Promise<AdminModulePermission[]> {
    const { data, error } = await this.requireClient().rpc(
      'list_admin_module_permissions',
      { p_actor_id: actorId },
    );
    if (error) databaseError(error);
    return (data ?? []).map(map);
  }

  async set(
    input: Parameters<ModulePermissionsGateway['set']>[0],
  ): Promise<AdminModulePermission> {
    const { data, error } = await this.requireClient().rpc(
      'set_admin_module_permission',
      {
        p_actor_id: input.actorId,
        p_can_access: input.canAccess,
        p_reason: input.reason,
        p_target_user_id: input.targetUserId,
      },
    );
    if (error) databaseError(error);
    const row = data?.[0];
    if (!row) {
      throw new ServiceUnavailableException(
        'The module permission change was not confirmed.',
      );
    }
    return map(row);
  }

  private requireClient(): SupabaseServerClient {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Module permissions are not configured.',
      );
    }
    return this.client;
  }
}
