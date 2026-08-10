import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthorizationService } from './authorization.service';
import type { AuthorizedRequest } from './authorization.decorators';

function getBearerToken(value: string | undefined): string | null {
  if (!value?.startsWith('Bearer ')) {
    return null;
  }

  const token = value.slice('Bearer '.length).trim();

  return token && !/\s/.test(token) ? token : null;
}

@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(private readonly authorizationService: AuthorizationService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthorizedRequest>();
    const token = getBearerToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException();
    }

    const authorizationContext =
      await this.authorizationService.resolveContext(token);

    if (!authorizationContext.emailConfirmedAt) {
      throw new UnauthorizedException();
    }

    request.authorizationContext = authorizationContext;

    return true;
  }
}
