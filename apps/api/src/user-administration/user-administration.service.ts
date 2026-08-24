import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { AuthorizationContext } from '../authorization';
import { SUPABASE_USER_ADMINISTRATION_GATEWAY } from '../supabase/supabase.constants';
import type { ListAdministrativeUsersQueryDto } from './dto/list-administrative-users-query.dto';
import type { ListOperationalAuditEventsQueryDto } from './dto/list-operational-audit-events-query.dto';
import type { UpdateAdministrativeUserDto } from './dto/update-administrative-user.dto';
import type {
  AdministrativeUser,
  OperationalAuditEvent,
  UserAdministrationGateway,
} from './user-administration.gateway';

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
  ): Promise<AdministrativeUser[]> {
    return this.gateway.listUsers({
      actorId: authorization.userId,
      limit: dto.limit ?? 50,
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
}
