import type { ThrottlerGetTrackerFunction } from '@nestjs/throttler';
import {
  hashAccessToken,
  VerifiedTokenRegistry,
} from './verified-token.registry';

interface TrackableRequest {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
}

/** Same parsing rule as AuthorizationGuard: `Bearer <token>` without spaces. */
export function readBearerToken(
  authorization: string | string[] | undefined,
): string | null {
  if (
    typeof authorization !== 'string' ||
    !authorization.startsWith('Bearer ')
  ) {
    return null;
  }

  const token = authorization.slice('Bearer '.length).trim();

  return token && !/\s/.test(token) ? token : null;
}

/**
 * `req.ip` already honours Express `trust proxy` (configured in
 * configureApplication), so behind Render it is the client address.
 */
export function readClientIp(request: TrackableRequest): string {
  return request.ip ?? request.socket?.remoteAddress ?? 'unknown';
}

/**
 * Rate-limit identity of a request:
 * - a bearer token that AuthorizationGuard already accepted gets its own
 *   bucket, keyed by the SHA-256 of the token (never by its unverified `sub`,
 *   which anyone could forge to exhaust another person's quota);
 * - anything else (no token, an unknown token or a forged one) shares the
 *   bucket of its client IP.
 */
export function createRequestTracker(
  registry: VerifiedTokenRegistry,
): ThrottlerGetTrackerFunction {
  return (request: TrackableRequest) => {
    const token = readBearerToken(request.headers?.authorization);

    if (token) {
      const tokenHash = hashAccessToken(token);

      if (registry.isVerified(tokenHash)) {
        return `token:${tokenHash}`;
      }
    }

    return `ip:${readClientIp(request)}`;
  };
}
