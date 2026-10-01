import { createRequestTracker, readBearerToken } from './request-tracker';
import {
  hashAccessToken,
  VERIFIED_TOKEN_TTL_MS,
  VerifiedTokenRegistry,
} from './verified-token.registry';

describe('readBearerToken', () => {
  it.each([
    [undefined, null],
    ['Basic abc', null],
    ['Bearer ', null],
    ['Bearer two parts', null],
    [['Bearer abc'], null],
    ['Bearer abc.def.ghi', 'abc.def.ghi'],
  ])('reads %p as %p', (header, expected) => {
    expect(readBearerToken(header)).toBe(expected);
  });
});

describe('createRequestTracker', () => {
  let now: number;
  let registry: VerifiedTokenRegistry;
  let track: (request: object) => Promise<string>;

  const context = {} as never;
  const request = (token: string | null, ip = '203.0.113.7') => ({
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ip,
  });

  beforeEach(() => {
    now = 1_000_000;
    registry = new VerifiedTokenRegistry(() => now);
    const tracker = createRequestTracker(registry);
    track = (value) => Promise.resolve(tracker(value, context));
  });

  it('tracks anonymous requests by client IP', async () => {
    await expect(track(request(null))).resolves.toBe('ip:203.0.113.7');
  });

  it('tracks unverified (possibly forged) tokens by client IP, so inventing tokens does not grant new quota', async () => {
    await expect(track(request('forged-1'))).resolves.toBe('ip:203.0.113.7');
    await expect(track(request('forged-2'))).resolves.toBe('ip:203.0.113.7');
  });

  it('gives each verified token its own bucket, independent of the shared IP', async () => {
    registry.markVerified(hashAccessToken('token-admin-1'));
    registry.markVerified(hashAccessToken('token-admin-2'));

    const first = await track(request('token-admin-1', '10.0.0.1'));
    const second = await track(request('token-admin-2', '10.0.0.1'));

    expect(first).toBe(`token:${hashAccessToken('token-admin-1')}`);
    expect(second).toBe(`token:${hashAccessToken('token-admin-2')}`);
    expect(first).not.toBe(second);
    expect(first).not.toContain('token-admin-1');
  });

  it('falls back to the IP once the verification mark expires', async () => {
    registry.markVerified(hashAccessToken('token'));
    now += VERIFIED_TOKEN_TTL_MS;

    await expect(track(request('token'))).resolves.toBe('ip:203.0.113.7');
  });

  it('uses the socket address when Express did not set req.ip', async () => {
    await expect(
      track({ headers: {}, socket: { remoteAddress: '198.51.100.4' } }),
    ).resolves.toBe('ip:198.51.100.4');
  });
});
