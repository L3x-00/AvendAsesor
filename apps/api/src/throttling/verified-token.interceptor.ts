import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { readBearerToken } from './request-tracker';
import {
  hashAccessToken,
  VerifiedTokenRegistry,
} from './verified-token.registry';

interface MaybeAuthorizedRequest {
  authorizationContext?: unknown;
  headers?: Record<string, string | string[] | undefined>;
}

/**
 * Interceptors run after every guard. When AuthorizationGuard has attached an
 * authorization context, the bearer token was accepted by Supabase, so its hash
 * is recorded and later requests with it get a per-user rate-limit bucket.
 */
@Injectable()
export class VerifiedTokenInterceptor implements NestInterceptor {
  constructor(private readonly registry: VerifiedTokenRegistry) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() === 'http') {
      const request = context
        .switchToHttp()
        .getRequest<MaybeAuthorizedRequest>();
      const token = readBearerToken(request.headers?.authorization);

      if (token && request.authorizationContext) {
        this.registry.markVerified(hashAccessToken(token));
      }
    }

    return next.handle();
  }
}
