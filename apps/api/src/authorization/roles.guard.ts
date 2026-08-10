import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '../users/domain/user-profile';
import { REQUIRED_ROLES } from './authorization.constants';
import type { AuthorizedRequest } from './authorization.decorators';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      REQUIRED_ROLES,
      [context.getHandler(), context.getClass()],
    );
    const request = context.switchToHttp().getRequest<AuthorizedRequest>();
    const currentRole = request.authorizationContext?.role;

    if (!requiredRoles?.length || !currentRole) {
      throw new ForbiddenException();
    }

    if (!requiredRoles.includes(currentRole)) {
      throw new ForbiddenException();
    }

    return true;
  }
}
