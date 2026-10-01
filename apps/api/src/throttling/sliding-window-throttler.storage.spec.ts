import { ThrottlerStorageService } from '@nestjs/throttler';
import { SlidingWindowThrottlerStorage } from './sliding-window-throttler.storage';

const TTL = 60_000;
const LIMIT = 5;

describe('SlidingWindowThrottlerStorage', () => {
  let now: number;
  let storage: SlidingWindowThrottlerStorage;

  const hit = (key: string, limit = LIMIT) =>
    storage.increment(key, TTL, limit, TTL, 'default');

  beforeEach(() => {
    now = 1_000_000;
    storage = new SlidingWindowThrottlerStorage({ now: () => now });
  });

  it('allows up to the limit inside the window and blocks the next request', async () => {
    for (let attempt = 1; attempt <= LIMIT; attempt += 1) {
      await expect(hit('a')).resolves.toMatchObject({
        isBlocked: false,
        totalHits: attempt,
      });
      now += 1_000;
    }

    await expect(hit('a')).resolves.toMatchObject({
      isBlocked: true,
      timeToBlockExpire: 60,
    });
  });

  it('expires each hit when it leaves the window (sliding, not fixed)', async () => {
    await hit('a');
    now += 30_000;
    await hit('a');
    now += 30_001;

    // The first hit is now older than the TTL and no longer counts.
    await expect(hit('a')).resolves.toMatchObject({ totalHits: 2 });
  });

  it('releases a blocked key after the block and starts a clean window', async () => {
    for (let attempt = 0; attempt <= LIMIT; attempt += 1) {
      await hit('a');
    }

    now += TTL - 1;
    await expect(hit('a')).resolves.toMatchObject({ isBlocked: true });

    now += 1;
    await expect(hit('a')).resolves.toMatchObject({
      isBlocked: false,
      totalHits: 1,
    });
  });

  it('keeps expiring the hits of other keys after one key is blocked and released (regression of @nestjs/throttler 6.5.0)', async () => {
    // Somebody gets blocked…
    for (let attempt = 0; attempt <= LIMIT; attempt += 1) {
      await hit('user-b');
    }

    // …another user reads a few screens shortly before that block ends…
    now += TTL - 5_000;
    for (let attempt = 0; attempt < LIMIT; attempt += 1) {
      await hit('user-a');
    }

    // …and the first one is released.
    now += 5_000;
    await expect(hit('user-b')).resolves.toMatchObject({ isBlocked: false });

    // Three windows later the first user's old hits must be gone.
    now += 3 * TTL;
    await expect(hit('user-a')).resolves.toMatchObject({
      isBlocked: false,
      totalHits: 1,
    });
  });

  it('never blocks one key because of another key', async () => {
    for (let attempt = 0; attempt <= LIMIT; attempt += 1) {
      await hit('user-b');
    }

    await expect(hit('user-a')).resolves.toMatchObject({
      isBlocked: false,
      totalHits: 1,
    });
  });

  it('prunes entries that hold no live state', async () => {
    storage = new SlidingWindowThrottlerStorage({
      now: () => now,
      sweepEvery: 1,
    });
    await hit('a');
    await hit('b');
    expect(storage.size).toBe(2);

    now += TTL + 1;
    await hit('c');

    expect(storage.size).toBe(1);
  });
});

describe('ThrottlerStorageService from @nestjs/throttler (documents the bug)', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: 1_000_000 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('stops expiring the hits of other keys once any key is released', async () => {
    const storage = new ThrottlerStorageService();
    const hit = (key: string) =>
      storage.increment(key, TTL, LIMIT, TTL, 'default');

    for (let attempt = 0; attempt <= LIMIT; attempt += 1) {
      await hit('user-b');
    }
    jest.advanceTimersByTime(TTL - 5_000);
    for (let attempt = 0; attempt < LIMIT; attempt += 1) {
      await hit('user-a');
    }
    jest.advanceTimersByTime(5_000);
    await hit('user-b'); // releases user-b and cancels every pending expiry
    jest.advanceTimersByTime(3 * TTL);

    // With the library storage the five old hits of user-a never expire, so
    // a single new request is enough to block that user. If this assertion
    // ever fails, the upstream bug was fixed and the custom storage can be
    // reconsidered.
    const record = await hit('user-a');
    expect(record.totalHits).toBe(LIMIT + 1);
    expect(record.isBlocked).toBe(true);

    storage.onApplicationShutdown();
  });
});
