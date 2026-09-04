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
import { UpdateAccessWindowDto } from './dto/update-access-window.dto';
import { UpdateAdministrativeUserDto } from './dto/update-administrative-user.dto';
import { UserAdministrationService } from './user-administration.service';
import type {
  AdministrativeUser,
  AdministrativeUserCounts,
  AdministrativeUserDirectoryEntry,
  AdministrativeUserPage,
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
  async listUsers(
    @Query() dto: ListAdministrativeUsersQueryDto,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<AdministrativeUser[]> {
    const page = await this.userAdministrationService.listUsers(
      dto,
      authorization,
    );
    return page.items;
  }

  @Get('page')
  listUsersPage(
    @Query() dto: ListAdministrativeUsersQueryDto,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<AdministrativeUserPage> {
    return this.userAdministrationService.listUsers(dto, authorization);
  }

  @Get('counts')
  countUsers(
    @Query() dto: ListAdministrativeUsersQueryDto,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<AdministrativeUserCounts> {
    return this.userAdministrationService.countUsers(dto, authorization);
  }

  @Get('audit-events')
  listAuditEvents(
    @Query() dto: ListOperationalAuditEventsQueryDto,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<OperationalAuditEvent[]> {
    return this.userAdministrationService.listAuditEvents(dto, authorization);
  }

  @Patch(':id/access-window')
  updateAccessWindow(
    @Param('id', new ParseUUIDPipe({ version: '4' })) targetUserId: string,
    @Body() dto: UpdateAccessWindowDto,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<AdministrativeUserDirectoryEntry> {
    return this.userAdministrationService.updateAccessWindow(
      targetUserId,
      dto,
      authorization,
    );
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
