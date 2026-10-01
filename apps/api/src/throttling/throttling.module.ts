import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { createRequestTracker } from './request-tracker';
import { SlidingWindowThrottlerStorage } from './sliding-window-throttler.storage';
import { VerifiedTokenInterceptor } from './verified-token.interceptor';
import { VerifiedTokenRegistry } from './verified-token.registry';

/** Default quota for handlers without their own `@Throttle`. */
export const DEFAULT_THROTTLE = { limit: 30, ttl: 60_000 } as const;

@Module({
  exports: [VerifiedTokenRegistry],
  providers: [
    {
      provide: VerifiedTokenRegistry,
      useFactory: () => new VerifiedTokenRegistry(),
    },
    { provide: APP_INTERCEPTOR, useClass: VerifiedTokenInterceptor },
  ],
})
export class VerifiedTokenModule {}

/**
 * Rate limiting for the whole API. Controllers keep using `ThrottlerGuard` and
 * `@Throttle`; this module only swaps what the guard relies on:
 * - storage: a per-key sliding window (fixes the frozen counters of the
 *   package's default in-memory storage);
 * - tracker: verified bearer token hash, falling back to the client IP.
 * A new storage is created per application instance so state never leaks
 * between test applications.
 */
export const ThrottlingModule = ThrottlerModule.forRootAsync({
  imports: [VerifiedTokenModule],
  inject: [VerifiedTokenRegistry],
  useFactory: (registry: VerifiedTokenRegistry) => ({
    getTracker: createRequestTracker(registry),
    storage: new SlidingWindowThrottlerStorage(),
    throttlers: [{ ...DEFAULT_THROTTLE }],
  }),
});
