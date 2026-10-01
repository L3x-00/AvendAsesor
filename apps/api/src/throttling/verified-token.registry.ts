import { createHash } from 'node:crypto';

/** A Supabase access token lives one hour by default; keep the mark as long. */
export const VERIFIED_TOKEN_TTL_MS = 60 * 60 * 1000;
/** Hard cap so the registry cannot grow without bound. */
export const VERIFIED_TOKEN_MAX_ENTRIES = 50_000;

export function hashAccessToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Remembers (by SHA-256 hash, never the token itself) which bearer tokens were
 * accepted by `AuthorizationGuard`. Only those tokens get their own rate-limit
 * bucket: a request with an unknown or forged token is tracked by client IP, so
 * nobody can obtain a fresh quota just by inventing a new random token.
 *
 * Registered with a factory (see ThrottlingModule) because the clock argument
 * is not an injectable token.
 */
export class VerifiedTokenRegistry {
  private readonly verifiedUntil = new Map<string, number>();

  constructor(private readonly now: () => number = Date.now) {}

  markVerified(tokenHash: string): void {
    const now = this.now();

    if (
      !this.verifiedUntil.has(tokenHash) &&
      this.verifiedUntil.size >= VERIFIED_TOKEN_MAX_ENTRIES
    ) {
      this.prune(now);

      if (this.verifiedUntil.size >= VERIFIED_TOKEN_MAX_ENTRIES) {
        // Drop the oldest mark (Map keeps insertion order).
        for (const oldest of this.verifiedUntil.keys()) {
          this.verifiedUntil.delete(oldest);
          break;
        }
      }
    }

    this.verifiedUntil.delete(tokenHash);
    this.verifiedUntil.set(tokenHash, now + VERIFIED_TOKEN_TTL_MS);
  }

  isVerified(tokenHash: string): boolean {
    const until = this.verifiedUntil.get(tokenHash);

    if (until === undefined) {
      return false;
    }

    if (until <= this.now()) {
      this.verifiedUntil.delete(tokenHash);
      return false;
    }

    return true;
  }

  private prune(now: number): void {
    for (const [tokenHash, until] of this.verifiedUntil) {
      if (until <= now) {
        this.verifiedUntil.delete(tokenHash);
      }
    }
  }
}
