import { createSupabaseServerClient } from './supabase.server-client';

describe('createSupabaseServerClient', () => {
  it('does not initialize a client when Supabase is intentionally unconfigured', () => {
    expect(createSupabaseServerClient(undefined, undefined)).toBeNull();
  });

  it('rejects partial server configuration', () => {
    expect(() =>
      createSupabaseServerClient('https://example.supabase.co', undefined),
    ).toThrow('Supabase server configuration is invalid.');
  });

  it('creates a server-only client without requiring network access', () => {
    expect(
      createSupabaseServerClient(
        'https://example.supabase.co',
        'server-only-test-key',
      ),
    ).not.toBeNull();
  });
});
