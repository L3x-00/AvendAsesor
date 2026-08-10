import {
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  SupabaseProfilesGatewayAdapter,
  type SupabaseProfilesClient,
} from './supabase-profiles.gateway';

function createProfilesClient(result: {
  data: unknown;
  error: unknown;
}): SupabaseProfilesClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve(result),
        }),
      }),
    }),
  };
}

describe('SupabaseProfilesGatewayAdapter', () => {
  it('maps a validated profile row', async () => {
    const gateway = new SupabaseProfilesGatewayAdapter(
      createProfilesClient({
        data: {
          full_name: 'Docente Demo',
          id: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
          role: 'docente',
        },
        error: null,
      }),
    );

    await expect(
      gateway.findById('70a15a92-9899-4ee2-81e0-30d7c3f7677c'),
    ).resolves.toEqual({
      fullName: 'Docente Demo',
      id: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
      role: 'docente',
    });
  });

  it('returns null when a profile does not exist', async () => {
    const gateway = new SupabaseProfilesGatewayAdapter(
      createProfilesClient({ data: null, error: null }),
    );

    await expect(
      gateway.findById('70a15a92-9899-4ee2-81e0-30d7c3f7677c'),
    ).resolves.toBeNull();
  });

  it('fails closed when the profile data is malformed', async () => {
    const gateway = new SupabaseProfilesGatewayAdapter(
      createProfilesClient({
        data: {
          full_name: 'Docente Demo',
          id: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
          role: 'superuser',
        },
        error: null,
      }),
    );

    await expect(
      gateway.findById('70a15a92-9899-4ee2-81e0-30d7c3f7677c'),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('reports unavailable storage without exposing the provider error', async () => {
    const gateway = new SupabaseProfilesGatewayAdapter(
      createProfilesClient({
        data: null,
        error: { message: 'provider failure' },
      }),
    );

    await expect(
      gateway.findById('70a15a92-9899-4ee2-81e0-30d7c3f7677c'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('fails closed when the profile store is not configured', async () => {
    const gateway = new SupabaseProfilesGatewayAdapter(null);

    await expect(
      gateway.findById('70a15a92-9899-4ee2-81e0-30d7c3f7677c'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
