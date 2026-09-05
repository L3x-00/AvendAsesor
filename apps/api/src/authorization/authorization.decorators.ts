import {
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';
import type { UserRole } from '../users/domain/user-profile';
import { REQUIRED_FEATURES, REQUIRED_ROLES } from './authorization.constants';
import type { AuthorizationContext } from './authorization.service';

export interface AuthorizedRequest extends Request {
  authorizationContext?: AuthorizationContext;
}

export const RequireRoles = (...roles: UserRole[]) =>
  SetMetadata(REQUIRED_ROLES, roles);

export type AdministrativeFeature = 'modules';

export const RequireFeatures = (...features: AdministrativeFeature[]) =>
  SetMetadata(REQUIRED_FEATURES, features);

export const CurrentAuthorization = createParamDecorator(
  (
    _data: unknown,
    context: ExecutionContext,
  ): AuthorizationContext | undefined =>
    context.switchToHttp().getRequest<AuthorizedRequest>().authorizationContext,
);
