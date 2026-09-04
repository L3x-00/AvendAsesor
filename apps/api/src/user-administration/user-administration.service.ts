import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { AuthorizationContext } from '../authorization';
import { SUPABASE_USER_ADMINISTRATION_GATEWAY } from '../supabase/supabase.constants';
import type { ListAdministrativeUsersQueryDto } from './dto/list-administrative-users-query.dto';
import type { ListOperationalAuditEventsQueryDto } from './dto/list-operational-audit-events-query.dto';
import type { UpdateAccessWindowDto } from './dto/update-access-window.dto';
import type { UpdateAdministrativeUserDto } from './dto/update-administrative-user.dto';
import type {
  AdministrativeUser,
  AdministrativeUserCounts,
  AdministrativeUserDirectoryEntry,
  AdministrativeUserPage,
  OperationalAuditEvent,
  UserAdministrationGateway,
} from './user-administration.gateway';

function normalizedTimestamp(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    throw new BadRequestException('A valid access-window date is required.');
  }
  return new Date(parsed).toISOString();
}

@Injectable()
export class UserAdministrationService {
  constructor(
    @Inject(SUPABASE_USER_ADMINISTRATION_GATEWAY)
    private readonly gateway: UserAdministrationGateway,
  ) {}

  listAuditEvents(
    dto: ListOperationalAuditEventsQueryDto,
    authorization: AuthorizationContext,
  ): Promise<OperationalAuditEvent[]> {
    return this.gateway.listAuditEvents({
      actorId: authorization.userId,
      limit: dto.limit ?? 50,
    });
  }

  listUsers(
    dto: ListAdministrativeUsersQueryDto,
    authorization: AuthorizationContext,
  ): Promise<AdministrativeUserPage> {
    return this.gateway.listUsers({
      accessState: dto.accessState ?? null,
      actorId: authorization.userId,
      group: dto.group ?? null,
      limit: dto.limit ?? 50,
      offset: dto.offset ?? 0,
      search: dto.search?.trim() || null,
      status: dto.status ?? null,
    });
  }

  countUsers(
    dto: ListAdministrativeUsersQueryDto,
    authorization: AuthorizationContext,
  ): Promise<AdministrativeUserCounts> {
    return this.gateway.countUsers({
      actorId: authorization.userId,
      group: dto.group ?? null,
      search: dto.search?.trim() || null,
    });
  }

  updateUser(
    targetUserId: string,
    dto: UpdateAdministrativeUserDto,
    authorization: AuthorizationContext,
  ): Promise<AdministrativeUser> {
    if (dto.accountStatus === undefined && dto.role === undefined) {
      throw new BadRequestException(
        'A role or account status change is required.',
      );
    }

    const reason = dto.reason.trim();
    if (reason.length < 4 || reason.length > 500) {
      throw new BadRequestException(
        'An administrative user change requires a valid reason.',
      );
    }

    return this.gateway.updateUser({
      accountStatus: dto.accountStatus ?? null,
      actorId: authorization.userId,
      reason,
      role: dto.role ?? null,
      targetUserId,
    });
  }

  updateAccessWindow(
    targetUserId: string,
    dto: UpdateAccessWindowDto,
    authorization: AuthorizationContext,
  ): Promise<AdministrativeUserDirectoryEntry> {
    const reason = dto.reason.trim();
    if (reason.length < 4 || reason.length > 500) {
      throw new BadRequestException(
        'An access-window change requires a valid reason.',
      );
    }

    const accessStartAt = normalizedTimestamp(dto.accessStartAt);
    const accessExpiresAt = normalizedTimestamp(dto.accessExpiresAt);

    if (
      accessStartAt !== null &&
      accessExpiresAt !== null &&
      Date.parse(accessStartAt) > Date.parse(accessExpiresAt)
    ) {
      throw new BadRequestException(
        'The access start must not be after the access expiry.',
      );
    }

    return this.gateway.updateAccessWindow({
      accessExpiresAt,
      accessStartAt,
      actorId: authorization.userId,
      reason,
      targetUserId,
    });
  }
}
