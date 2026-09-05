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
    rpc: (functionName) =>
      Promise.resolve({
        data: functionName === 'has_admin_module_access' ? false : undefined,
        error: null,
      }),
  };
}

describe('SupabaseProfilesGatewayAdapter', () => {
  it('maps a validated profile row', async () => {
    const gateway = new SupabaseProfilesGatewayAdapter(
      createProfilesClient({
        data: {
          access_expires_at: null,
          account_status: 'active',
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
      accessExpiresAt: null,
      accountStatus: 'active',
      fullName: 'Docente Demo',
      id: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
      modulesAccess: false,
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
          access_expires_at: null,
          account_status: 'active',
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

  it('records bounded access telemetry through the server-only profile client', async () => {
    const rpc = jest.fn().mockResolvedValue({ error: null });
    const client: SupabaseProfilesClient = {
      ...createProfilesClient({ data: null, error: null }),
      rpc,
    };
    const gateway = new SupabaseProfilesGatewayAdapter(client);

    await expect(
      gateway.touchLastAccess('70a15a92-9899-4ee2-81e0-30d7c3f7677c'),
    ).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith('touch_profile_last_access', {
      p_user_id: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
    });
  });

  it('fails closed when profile telemetry cannot be persisted', async () => {
    const unavailable = new SupabaseProfilesGatewayAdapter(null);
    const failing = new SupabaseProfilesGatewayAdapter({
      ...createProfilesClient({ data: null, error: null }),
      rpc: () => Promise.resolve({ error: { message: 'provider failure' } }),
    });

    await expect(
      unavailable.touchLastAccess('70a15a92-9899-4ee2-81e0-30d7c3f7677c'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      failing.touchLastAccess('70a15a92-9899-4ee2-81e0-30d7c3f7677c'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
