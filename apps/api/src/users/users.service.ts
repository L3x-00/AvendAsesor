import { Inject, Injectable } from '@nestjs/common';
import { SUPABASE_PROFILES_GATEWAY } from '../supabase/supabase.constants';
import type { SupabaseProfilesGateway } from '../supabase/supabase-profiles.gateway';
import type { UserProfile } from './domain/user-profile';

@Injectable()
export class UsersService {
  constructor(
    @Inject(SUPABASE_PROFILES_GATEWAY)
    private readonly profilesGateway: SupabaseProfilesGateway,
  ) {}

  findProfileById(userId: string): Promise<UserProfile | null> {
    return this.profilesGateway.findById(userId);
  }
}
