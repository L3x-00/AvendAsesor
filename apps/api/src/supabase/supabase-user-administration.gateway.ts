import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { PostgrestError } from '@supabase/supabase-js';
import type {
  AdministrativeUser,
  AdministrativeUserAccessState,
  AdministrativeUserCounts,
  AdministrativeUserDirectoryEntry,
  AdministrativeUserPage,
  OperationalAuditEvent,
  UserAdministrationGateway,
} from '../user-administration/user-administration.gateway';
import type { Json, SupabaseServerClient } from './supabase.server-client';

const ACCESS_STATES: ReadonlySet<AdministrativeUserAccessState> = new Set([
  'activo',
  'expirado',
  'pausado',
  'por_vencer',
]);

function databaseError(error: PostgrestError): never {
  if (error.code === '42501') {
    throw new ForbiddenException('User administration access is denied.');
  }
  if (error.code === 'P0002') {
    throw new NotFoundException('The administrative user was not found.');
  }
  if (error.code === '22023' || error.code === '22P02') {
    throw new BadRequestException(
      'The administrative user request is invalid.',
    );
  }
  if (
    error.code === '23514' ||
    error.code === '23505' ||
    error.code === 'P0001'
  ) {
    throw new ConflictException(
      'The administrative user change cannot be applied.',
    );
  }
  throw new ServiceUnavailableException(
    'User administration data is temporarily unavailable.',
  );
}

function requireSingle<T>(data: T[] | null, message: string): T {
  const result = data?.[0];
  if (!result) throw new ServiceUnavailableException(message);
  return result;
}

function asMetadata(value: Json): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new InternalServerErrorException(
      'Operational audit data is invalid.',
    );
  }
  return value;
}

function requireCount(value: unknown, message: string): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (
    typeof parsed !== 'number' ||
    !Number.isSafeInteger(parsed) ||
    parsed < 0
  ) {
    throw new InternalServerErrorException(message);
  }
  return parsed;
}

@Injectable()
export class SupabaseUserAdministrationGatewayAdapter implements UserAdministrationGateway {
  constructor(private readonly client: SupabaseServerClient | null) {}

  async listAuditEvents(
    input: Parameters<UserAdministrationGateway['listAuditEvents']>[0],
  ): Promise<OperationalAuditEvent[]> {
    const { data, error } = await this.requireClient().rpc(
      'list_operational_audit_events',
      { p_actor_id: input.actorId, p_limit: input.limit },
    );
    if (error) databaseError(error);

    return (data ?? []).map((event) => ({
      action: event.action,
      actorId: event.actor_id,
      actorRole: event.actor_role,
      id: event.id,
      metadata: asMetadata(event.metadata),
      occurredAt: event.occurred_at,
      resourceId: event.resource_id,
      resourceType: event.resource_type,
    }));
  }

  async listUsers(
    input: Parameters<UserAdministrationGateway['listUsers']>[0],
  ): Promise<AdministrativeUserPage> {
    const { data, error } = await this.requireClient().rpc(
      'list_administrative_users_page',
      {
        p_access_state: input.accessState,
        p_account_status: input.status,
        p_actor_id: input.actorId,
        p_group: input.group,
        p_limit: input.limit,
        p_offset: input.offset,
        p_search: input.search,
      },
    );
    if (error) databaseError(error);

    const page = requireSingle(
      data,
      'The administrative user listing did not complete.',
    );
    if (
      !Array.isArray(page.items) ||
      !Number.isSafeInteger(page.total_count) ||
      page.total_count < 0
    ) {
      throw new InternalServerErrorException(
        'Administrative user data is invalid.',
      );
    }

    return {
      items: page.items.map((user) => this.toDirectoryEntryJson(user)),
      limit: input.limit,
      offset: input.offset,
      total: page.total_count,
    };
  }

  async countUsers(
    input: Parameters<UserAdministrationGateway['countUsers']>[0],
  ): Promise<AdministrativeUserCounts> {
    const { data, error } = await this.requireClient().rpc(
      'count_administrative_users',
      {
        p_actor_id: input.actorId,
        p_group: input.group,
        p_search: input.search,
      },
    );
    if (error) databaseError(error);

    const row = requireSingle(
      data,
      'The administrative user count did not complete.',
    );

    return {
      active: requireCount(
        row.active_count,
        'Administrative counts are invalid.',
      ),
      expired: requireCount(
        row.expired_count,
        'Administrative counts are invalid.',
      ),
      expiringSoon: requireCount(
        row.expiring_soon_count,
        'Administrative counts are invalid.',
      ),
      suspended: requireCount(
        row.suspended_count,
        'Administrative counts are invalid.',
      ),
      total: requireCount(
        row.total_count,
        'Administrative counts are invalid.',
      ),
    };
  }

  async updateUser(
    input: Parameters<UserAdministrationGateway['updateUser']>[0],
  ): Promise<AdministrativeUser> {
    const { data, error } = await this.requireClient().rpc(
      'update_administrative_user',
      {
        p_account_status: input.accountStatus,
        p_actor_id: input.actorId,
        p_reason: input.reason,
        p_role: input.role,
        p_target_user_id: input.targetUserId,
      },
    );
    if (error) databaseError(error);

    return this.toAdministrativeUser(
      requireSingle(data, 'The administrative user update did not complete.'),
    );
  }

  async updateAccessWindow(
    input: Parameters<UserAdministrationGateway['updateAccessWindow']>[0],
  ): Promise<AdministrativeUserDirectoryEntry> {
    const { data, error } = await this.requireClient().rpc(
      'update_administrative_user_access_window',
      {
        p_access_expires_at: input.accessExpiresAt,
        p_access_start_at: input.accessStartAt,
        p_actor_id: input.actorId,
        p_reason: input.reason,
        p_target_user_id: input.targetUserId,
      },
    );
    if (error) databaseError(error);

    return this.toDirectoryEntry(
      requireSingle(data, 'The access-window update did not complete.'),
    );
  }

  private requireClient(): SupabaseServerClient {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'User administration data is not configured.',
      );
    }
    return this.client;
  }

  private toAdministrativeUser(user: {
    account_status: AdministrativeUser['accountStatus'];
    full_name: string;
    id: string;
    last_access_at: string | null;
    role: AdministrativeUser['role'];
  }): AdministrativeUser {
    return {
      accountStatus: user.account_status,
      fullName: user.full_name,
      id: user.id,
      lastAccessAt: user.last_access_at,
      role: user.role,
    };
  }

  private toDirectoryEntry(user: {
    access_expires_at: string | null;
    access_start_at: string | null;
    access_state?: AdministrativeUserAccessState;
    account_status: AdministrativeUser['accountStatus'];
    full_name: string;
    id: string;
    last_access_at: string | null;
    role: AdministrativeUser['role'];
  }): AdministrativeUserDirectoryEntry {
    return {
      ...this.toAdministrativeUser(user),
      accessExpiresAt: user.access_expires_at,
      accessStartAt: user.access_start_at,
      accessState: user.access_state ?? this.deriveAccessState(user),
    };
  }

  private deriveAccessState(user: {
    access_expires_at: string | null;
    account_status: AdministrativeUser['accountStatus'];
  }): AdministrativeUserAccessState {
    const now = Date.now();
    if (
      user.access_expires_at !== null &&
      Date.parse(user.access_expires_at) < now
    ) {
      return 'expirado';
    }
    if (user.account_status === 'suspended') {
      return 'pausado';
    }
    if (
      user.access_expires_at !== null &&
      Date.parse(user.access_expires_at) < now + 7 * 24 * 60 * 60 * 1000
    ) {
      return 'por_vencer';
    }
    return 'activo';
  }

  private toDirectoryEntryJson(user: Json): AdministrativeUserDirectoryEntry {
    if (!user || Array.isArray(user) || typeof user !== 'object') {
      throw new InternalServerErrorException(
        'Administrative user data is invalid.',
      );
    }

    const accountStatus = user.account_status;
    const fullName = user.full_name;
    const id = user.id;
    const lastAccessAt = user.last_access_at;
    const role = user.role;
    const accessStartAt = user.access_start_at ?? null;
    const accessExpiresAt = user.access_expires_at ?? null;
    const accessState = user.access_state;
    if (
      (accountStatus !== 'active' && accountStatus !== 'suspended') ||
      typeof fullName !== 'string' ||
      typeof id !== 'string' ||
      (lastAccessAt !== null && typeof lastAccessAt !== 'string') ||
      (role !== 'admin' && role !== 'docente' && role !== 'superadmin') ||
      (accessStartAt !== null && typeof accessStartAt !== 'string') ||
      (accessExpiresAt !== null && typeof accessExpiresAt !== 'string') ||
      typeof accessState !== 'string' ||
      !ACCESS_STATES.has(accessState as AdministrativeUserAccessState)
    ) {
      throw new InternalServerErrorException(
        'Administrative user data is invalid.',
      );
    }

    return this.toDirectoryEntry({
      access_expires_at: accessExpiresAt,
      access_start_at: accessStartAt,
      access_state: accessState as AdministrativeUserAccessState,
      account_status: accountStatus,
      full_name: fullName,
      id,
      last_access_at: lastAccessAt,
      role,
    });
  }
}
