import {
  hashAccessToken,
  VERIFIED_TOKEN_MAX_ENTRIES,
  VERIFIED_TOKEN_TTL_MS,
  VerifiedTokenRegistry,
} from './verified-token.registry';

describe('VerifiedTokenRegistry', () => {
  it('stores a SHA-256 hash, never the token', () => {
    expect(hashAccessToken('secret-token')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashAccessToken('secret-token')).not.toContain('secret');
  });

  it('remembers a verified token until its mark expires', () => {
    let now = 0;
    const registry = new VerifiedTokenRegistry(() => now);

    registry.markVerified('hash');
    now = VERIFIED_TOKEN_TTL_MS - 1;
    expect(registry.isVerified('hash')).toBe(true);

    now = VERIFIED_TOKEN_TTL_MS;
    expect(registry.isVerified('hash')).toBe(false);
  });

  it('never grows beyond its cap, dropping the oldest mark first', () => {
    const registry = new VerifiedTokenRegistry(() => 0);

    for (let index = 0; index <= VERIFIED_TOKEN_MAX_ENTRIES; index += 1) {
      registry.markVerified(`hash-${index}`);
    }

    expect(registry.isVerified('hash-0')).toBe(false);
    expect(registry.isVerified('hash-1')).toBe(true);
    expect(registry.isVerified(`hash-${VERIFIED_TOKEN_MAX_ENTRIES}`)).toBe(
      true,
    );
  });
});
