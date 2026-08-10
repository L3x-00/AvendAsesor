import { UnauthorizedException } from '@nestjs/common';
import { type SupabaseAuthGateway } from '../supabase/supabase-auth.gateway';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  it('returns a verified identity', async () => {
    const gateway: SupabaseAuthGateway = {
      getUser: () =>
        Promise.resolve({
          email: 'docente@example.com',
          emailConfirmedAt: null,
          id: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
        }),
    };
    const service = new AuthService(gateway);

    await expect(service.verifyAccessToken('valid-token')).resolves.toEqual({
      email: 'docente@example.com',
      emailConfirmedAt: null,
      id: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
    });
  });

  it('rejects an invalid access token', async () => {
    const gateway: SupabaseAuthGateway = {
      getUser: () => Promise.resolve(null),
    };
    const service = new AuthService(gateway);

    await expect(
      service.verifyAccessToken('invalid-token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
