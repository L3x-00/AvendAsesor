import type { ThrottlerStorage } from '@nestjs/throttler';

/** The package does not re-export this interface from its entry point. */
type ThrottlerStorageRecord = Awaited<
  ReturnType<ThrottlerStorage['increment']>
>;

interface SlidingWindowEntry {
  /** Instants (ms) of the requests counted inside the current window. */
  hits: number[];
  /** Instant (ms) until which the key stays blocked; 0 when it is not blocked. */
  blockedUntil: number;
  /** Instant (ms) after which the entry holds no useful state and can be pruned. */
  staleAfter: number;
}

export interface SlidingWindowThrottlerStorageOptions {
  /** Clock source; injectable so tests can move time deterministically. */
  now?: () => number;
  /** Number of increments between two sweeps of stale entries. */
  sweepEvery?: number;
}

const DEFAULT_SWEEP_EVERY = 500;

/**
 * In-memory rate-limit storage with an independent sliding window per key.
 *
 * It replaces the default `ThrottlerStorageService` of @nestjs/throttler 6.5.0.
 * That implementation keeps the timers that expire each hit in a list indexed
 * only by throttler name, and `resetBlockdRequest` cancels that whole list when
 * any key leaves its block. From that moment the hits of every OTHER key stop
 * expiring, so "N per minute" silently becomes "N in total" and users end up
 * locked out by requests made long ago (TSK-0070, Historial/Módulos errors).
 *
 * This storage keeps no timers at all: each key stores the timestamps of its
 * own hits and expired ones are discarded lazily when that key is touched, so
 * blocking or releasing one key can never affect another.
 */
export class SlidingWindowThrottlerStorage implements ThrottlerStorage {
  private readonly entries = new Map<string, SlidingWindowEntry>();
  private readonly now: () => number;
  private readonly sweepEvery: number;
  private operationsSinceSweep = 0;

  constructor(options: SlidingWindowThrottlerStorageOptions = {}) {
    this.now = options.now ?? Date.now;
    this.sweepEvery = Math.max(1, options.sweepEvery ?? DEFAULT_SWEEP_EVERY);
  }

  /** Number of keys currently held in memory (exposed for tests and metrics). */
  get size(): number {
    return this.entries.size;
  }

  increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const now = this.now();
    this.sweepIfDue(now);

    const storageKey = `${throttlerName}:${key}`;
    const entry = this.entries.get(storageKey) ?? {
      blockedUntil: 0,
      hits: [],
      staleAfter: 0,
    };

    if (entry.blockedUntil > 0 && entry.blockedUntil <= now) {
      // The block of THIS key is over: start it again from a clean window,
      // as the library does, without touching any other key.
      entry.blockedUntil = 0;
      entry.hits = [];
    }

    entry.hits = entry.hits.filter((hitAt) => hitAt > now - ttl);

    if (entry.blockedUntil === 0) {
      entry.hits.push(now);

      if (entry.hits.length > limit) {
        entry.blockedUntil = now + blockDuration;
      }
    }

    const oldestHit = entry.hits[0] ?? now;
    entry.staleAfter = Math.max(now + ttl, entry.blockedUntil);
    this.entries.set(storageKey, entry);

    const isBlocked = entry.blockedUntil > now;

    return Promise.resolve({
      isBlocked,
      timeToBlockExpire: isBlocked
        ? Math.ceil((entry.blockedUntil - now) / 1000)
        : 0,
      timeToExpire: Math.max(0, Math.ceil((oldestHit + ttl - now) / 1000)),
      totalHits: entry.hits.length,
    });
  }

  private sweepIfDue(now: number): void {
    this.operationsSinceSweep += 1;

    if (this.operationsSinceSweep < this.sweepEvery) {
      return;
    }

    this.operationsSinceSweep = 0;

    for (const [storageKey, entry] of this.entries) {
      if (entry.staleAfter <= now) {
        this.entries.delete(storageKey);
      }
    }
  }
}
