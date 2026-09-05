import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_FEATURES } from './authorization.constants';
import type {
  AdministrativeFeature,
  AuthorizedRequest,
} from './authorization.decorators';

@Injectable()
export class FeaturesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AdministrativeFeature[]>(
      REQUIRED_FEATURES,
      [context.getHandler(), context.getClass()],
    );

    if (!required?.length) return true;

    const authorization = context
      .switchToHttp()
      .getRequest<AuthorizedRequest>().authorizationContext;

    if (!authorization) throw new ForbiddenException();

    if (required.includes('modules') && !authorization.modulesAccess) {
      throw new ForbiddenException('Modules administration access is denied.');
    }

    return true;
  }
}
