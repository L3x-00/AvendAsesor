import { ServiceUnavailableException } from '@nestjs/common';
import {
  SupabaseAuthGatewayAdapter,
  type SupabaseAuthClient,
} from './supabase-auth.gateway';

describe('SupabaseAuthGatewayAdapter', () => {
  it('maps a verified Supabase user to an application identity', async () => {
    const client: SupabaseAuthClient = {
      auth: {
        getUser: () =>
          Promise.resolve({
            data: {
              user: {
                email: 'docente@example.com',
                email_confirmed_at: '2026-08-08T00:00:00.000Z',
                id: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
              },
            },
            error: null,
          }),
      },
    };

    const gateway = new SupabaseAuthGatewayAdapter(client);

    await expect(gateway.getUser('valid-token')).resolves.toEqual({
      email: 'docente@example.com',
      emailConfirmedAt: '2026-08-08T00:00:00.000Z',
      id: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
    });
  });

  it('returns null when Supabase rejects the access token', async () => {
    const client: SupabaseAuthClient = {
      auth: {
        getUser: () =>
          Promise.resolve({
            data: { user: null },
            error: { message: 'invalid token' },
          }),
      },
    };

    const gateway = new SupabaseAuthGatewayAdapter(client);

    await expect(gateway.getUser('invalid-token')).resolves.toBeNull();
  });

  it('normalizes absent optional identity fields', async () => {
    const client: SupabaseAuthClient = {
      auth: {
        getUser: () =>
          Promise.resolve({
            data: {
              user: { id: '70a15a92-9899-4ee2-81e0-30d7c3f7677c' },
            },
            error: null,
          }),
      },
    };
    const gateway = new SupabaseAuthGatewayAdapter(client);

    await expect(gateway.getUser('valid-token')).resolves.toEqual({
      email: null,
      emailConfirmedAt: null,
      id: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
    });
  });

  it('fails closed when the identity provider is not configured', async () => {
    const gateway = new SupabaseAuthGatewayAdapter(null);

    await expect(gateway.getUser('token')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
