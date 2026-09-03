import { ForbiddenException } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { type SupabaseAuthGateway } from '../supabase/supabase-auth.gateway';
import { type SupabaseProfilesGateway } from '../supabase/supabase-profiles.gateway';
import { UsersService } from '../users/users.service';
import { AuthorizationService } from './authorization.service';

const userId = '70a15a92-9899-4ee2-81e0-30d7c3f7677c';

function createAuthService(): AuthService {
  const gateway: SupabaseAuthGateway = {
    getUser: () =>
      Promise.resolve({
        email: 'admin@example.com',
        emailConfirmedAt: '2026-08-08T00:00:00.000Z',
        id: userId,
      }),
  };

  return new AuthService(gateway);
}

describe('AuthorizationService', () => {
  it('resolves role from the server-controlled profile', async () => {
    const profilesGateway: SupabaseProfilesGateway = {
      findById: () =>
        Promise.resolve({
          accessExpiresAt: null,
          accountStatus: 'active',
          fullName: 'Administrador Demo',
          id: userId,
          role: 'admin',
        }),
      touchLastAccess: () => Promise.resolve(),
    };
    const service = new AuthorizationService(
      createAuthService(),
      new UsersService(profilesGateway),
    );

    await expect(service.resolveContext('valid-token')).resolves.toEqual({
      email: 'admin@example.com',
      emailConfirmedAt: '2026-08-08T00:00:00.000Z',
      role: 'admin',
      userId,
    });
  });

  it('denies an authenticated user without a profile', async () => {
    const profilesGateway: SupabaseProfilesGateway = {
      findById: () => Promise.resolve(null),
      touchLastAccess: () => Promise.resolve(),
    };
    const service = new AuthorizationService(
      createAuthService(),
      new UsersService(profilesGateway),
    );

    await expect(service.resolveContext('valid-token')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('denies a suspended account before exposing any role', async () => {
    const profilesGateway: SupabaseProfilesGateway = {
      findById: () =>
        Promise.resolve({
          accessExpiresAt: null,
          accountStatus: 'suspended',
          fullName: 'Cuenta Suspendida',
          id: userId,
          role: 'admin',
        }),
      touchLastAccess: () => Promise.resolve(),
    };
    const service = new AuthorizationService(
      createAuthService(),
      new UsersService(profilesGateway),
    );

    await expect(service.resolveContext('valid-token')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('denies an account whose access period has expired', async () => {
    const touchLastAccess = jest.fn(() => Promise.resolve());
    const profilesGateway: SupabaseProfilesGateway = {
      findById: () =>
        Promise.resolve({
          accessExpiresAt: '2026-08-31T23:59:59.999Z',
          accountStatus: 'active',
          fullName: 'Cuenta Expirada',
          id: userId,
          role: 'admin',
        }),
      touchLastAccess,
    };
    const service = new AuthorizationService(
      createAuthService(),
      new UsersService(profilesGateway),
    );

    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-01T00:00:00.000Z'));
    await expect(service.resolveContext('valid-token')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(touchLastAccess).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('keeps authorization available when best-effort access telemetry is unavailable', async () => {
    const touchLastAccess = jest
      .fn()
      .mockRejectedValue(new Error('telemetry store unavailable'));
    const profilesGateway: SupabaseProfilesGateway = {
      findById: () =>
        Promise.resolve({
          accessExpiresAt: null,
          accountStatus: 'active',
          fullName: 'Administrador Demo',
          id: userId,
          role: 'admin',
        }),
      touchLastAccess,
    };
    const service = new AuthorizationService(
      createAuthService(),
      new UsersService(profilesGateway),
    );

    await expect(service.resolveContext('valid-token')).resolves.toEqual(
      expect.objectContaining({ role: 'admin', userId }),
    );
    expect(touchLastAccess).toHaveBeenCalledWith(userId);
  });
});
