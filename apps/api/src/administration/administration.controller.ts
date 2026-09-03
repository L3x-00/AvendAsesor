import { Controller, Get, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  AuthorizationGuard,
  CurrentAuthorization,
  RequireRoles,
  RolesGuard,
  type AuthorizationContext,
} from '../authorization';
import type { AdminHomeDashboard } from './admin-dashboard.gateway';
import { AdministrationService } from './administration.service';

@Controller('admin')
@UseGuards(ThrottlerGuard, AuthorizationGuard, RolesGuard)
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class AdministrationController {
  constructor(private readonly administrationService: AdministrationService) {}

  @Get('dashboard')
  @RequireRoles('admin', 'superadmin')
  getDashboard(
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<AdminHomeDashboard> {
    return this.administrationService.getDashboard(authorization);
  }

  @Get('access')
  @RequireRoles('admin', 'superadmin')
  getAccess(@CurrentAuthorization() authorization: AuthorizationContext): {
    role: AuthorizationContext['role'];
    status: 'authorized';
  } {
    return {
      role: authorization.role,
      status: 'authorized',
    };
  }

  @Get('system')
  @RequireRoles('superadmin')
  getSystemAccess(): { status: 'authorized' } {
    return { status: 'authorized' };
  }
}
