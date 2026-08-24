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
  OperationalAuditEvent,
  UserAdministrationGateway,
} from '../user-administration/user-administration.gateway';
import type { Json, SupabaseServerClient } from './supabase.server-client';

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
  ): Promise<AdministrativeUser[]> {
    const { data, error } = await this.requireClient().rpc(
      'list_administrative_users',
      {
        p_actor_id: input.actorId,
        p_limit: input.limit,
        p_search: input.search,
      },
    );
    if (error) databaseError(error);

    return (data ?? []).map((user) => this.toAdministrativeUser(user));
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
}
