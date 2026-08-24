import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  AuthorizationGuard,
  CurrentAuthorization,
  RequireRoles,
  RolesGuard,
  type AuthorizationContext,
} from '../authorization';
import { ListAdministrativeUsersQueryDto } from './dto/list-administrative-users-query.dto';
import { ListOperationalAuditEventsQueryDto } from './dto/list-operational-audit-events-query.dto';
import { UpdateAdministrativeUserDto } from './dto/update-administrative-user.dto';
import { UserAdministrationService } from './user-administration.service';
import type {
  AdministrativeUser,
  OperationalAuditEvent,
} from './user-administration.gateway';

@Controller('admin/users')
@UseGuards(ThrottlerGuard, AuthorizationGuard, RolesGuard)
@RequireRoles('superadmin')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class UserAdministrationController {
  constructor(
    private readonly userAdministrationService: UserAdministrationService,
  ) {}

  @Get()
  listUsers(
    @Query() dto: ListAdministrativeUsersQueryDto,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<AdministrativeUser[]> {
    return this.userAdministrationService.listUsers(dto, authorization);
  }

  @Get('audit-events')
  listAuditEvents(
    @Query() dto: ListOperationalAuditEventsQueryDto,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<OperationalAuditEvent[]> {
    return this.userAdministrationService.listAuditEvents(dto, authorization);
  }

  @Patch(':id')
  updateUser(
    @Param('id', new ParseUUIDPipe({ version: '4' })) targetUserId: string,
    @Body() dto: UpdateAdministrativeUserDto,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<AdministrativeUser> {
    return this.userAdministrationService.updateUser(
      targetUserId,
      dto,
      authorization,
    );
  }
}
