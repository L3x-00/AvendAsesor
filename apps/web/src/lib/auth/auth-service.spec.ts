import { describe, expect, it, vi } from 'vitest';
import { AuthService, type SupabaseAuthClient } from './auth-service';

function createClient(
  overrides: Partial<SupabaseAuthClient['auth']> = {},
): SupabaseAuthClient {
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
      resetPasswordForEmail: vi.fn(async () => ({ error: null })),
      signInWithPassword: vi.fn(async () => ({ error: null })),
      signOut: vi.fn(async () => ({ error: null })),
      signUp: vi.fn(async () => ({ error: null })),
      updateUser: vi.fn(async () => ({ error: null })),
      ...overrides,
    },
  };
}

describe('AuthService', () => {
  it('sends signup data with display-only metadata and the fixed callback', async () => {
    const client = createClient();
    const service = new AuthService(client);

    await service.signUp({
      email: 'docente@avend.pe',
      emailRedirectTo: 'https://staging.avend.pe/auth/callback',
      fullName: 'Docente Demo',
      password: 'Password1',
    });

    expect(client.auth.signUp).toHaveBeenCalledWith({
      email: 'docente@avend.pe',
      options: {
        data: { full_name: 'Docente Demo' },
        emailRedirectTo: 'https://staging.avend.pe/auth/callback',
      },
      password: 'Password1',
    });
  });

  it('does not expose signup provider errors to callers', async () => {
    const client = createClient({ signUp: vi.fn(async () => ({ error: {} })) });
    const service = new AuthService(client);

    await expect(
      service.signUp({
        email: 'docente@avend.pe',
        emailRedirectTo: 'https://staging.avend.pe/auth/callback',
        fullName: 'Docente Demo',
        password: 'Password1',
      }),
    ).resolves.toBeUndefined();
  });

  it('returns a neutral boolean for login success and failure', async () => {
    await expect(new AuthService(createClient()).signIn({
      email: 'docente@avend.pe',
      password: 'Password1',
    })).resolves.toBe(true);

    await expect(
      new AuthService(
        createClient({ signInWithPassword: vi.fn(async () => ({ error: {} })) }),
      ).signIn({ email: 'docente@avend.pe', password: 'Password1' }),
    ).resolves.toBe(false);
  });

  it('requests recovery at the configured callback without exposing provider errors', async () => {
    const client = createClient({
      resetPasswordForEmail: vi.fn(async () => ({ error: {} })),
    });
    const service = new AuthService(client);

    await service.requestPasswordReset({
      email: 'docente@avend.pe',
      redirectTo: 'https://staging.avend.pe/auth/callback?next=/auth/update-password',
    });

    expect(client.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      'docente@avend.pe',
      {
        redirectTo:
          'https://staging.avend.pe/auth/callback?next=/auth/update-password',
      },
    );
  });

  it('updates a password only when Supabase verifies an active user', async () => {
    const missingUserClient = createClient({
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
    });

    await expect(
      new AuthService(missingUserClient).updatePassword('Password1'),
    ).resolves.toBe(false);
    expect(missingUserClient.auth.updateUser).not.toHaveBeenCalled();

    const providerFailureClient = createClient({
      updateUser: vi.fn(async () => ({ error: {} })),
    });

    await expect(
      new AuthService(providerFailureClient).updatePassword('Password1'),
    ).resolves.toBe(false);
  });

  it('signs out only the local session', async () => {
    const client = createClient({ signOut: vi.fn(async () => ({ error: {} })) });

    await expect(new AuthService(client).signOut()).resolves.toBe(false);
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});
