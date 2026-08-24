import { type SupabaseProfilesGateway } from '../supabase/supabase-profiles.gateway';
import { UsersService } from './users.service';

describe('UsersService', () => {
  it('delegates profile lookup to the persistence gateway', async () => {
    const gateway: SupabaseProfilesGateway = {
      findById: () =>
        Promise.resolve({
          accountStatus: 'active',
          fullName: 'Docente Demo',
          id: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
          role: 'docente',
        }),
      touchLastAccess: () => Promise.resolve(),
    };
    const service = new UsersService(gateway);

    await expect(
      service.findProfileById('70a15a92-9899-4ee2-81e0-30d7c3f7677c'),
    ).resolves.toEqual({
      accountStatus: 'active',
      fullName: 'Docente Demo',
      id: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
      role: 'docente',
    });
  });
});
