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
          fullName: 'Administrador Demo',
          id: userId,
          role: 'admin',
        }),
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
    };
    const service = new AuthorizationService(
      createAuthService(),
      new UsersService(profilesGateway),
    );

    await expect(service.resolveContext('valid-token')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
