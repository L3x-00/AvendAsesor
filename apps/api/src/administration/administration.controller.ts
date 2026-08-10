import { Controller, Get, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  AuthorizationGuard,
  CurrentAuthorization,
  RequireRoles,
  RolesGuard,
  type AuthorizationContext,
} from '../authorization';

@Controller('admin')
@UseGuards(ThrottlerGuard, AuthorizationGuard, RolesGuard)
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class AdministrationController {
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
