import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { SetModulePermissionDto } from './dto/set-module-permission.dto';
import type { AdminModulePermission } from './module-permissions.gateway';
import { ModulePermissionsService } from './module-permissions.service';

@Controller('admin/module-permissions')
@UseGuards(ThrottlerGuard, AuthorizationGuard, RolesGuard)
@RequireRoles('superadmin')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class ModulePermissionsController {
  constructor(private readonly service: ModulePermissionsService) {}

  @Get()
  list(
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<AdminModulePermission[]> {
    return this.service.list(authorization);
  }

  @Patch(':id')
  set(
    @Param('id', new ParseUUIDPipe({ version: '4' })) targetUserId: string,
    @Body() dto: SetModulePermissionDto,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<AdminModulePermission> {
    return this.service.set(targetUserId, dto, authorization);
  }
}
