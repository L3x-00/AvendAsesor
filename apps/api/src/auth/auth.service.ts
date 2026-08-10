import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { SUPABASE_AUTH_GATEWAY } from '../supabase/supabase.constants';
import type {
  AuthenticatedIdentity,
  SupabaseAuthGateway,
} from '../supabase/supabase-auth.gateway';

@Injectable()
export class AuthService {
  constructor(
    @Inject(SUPABASE_AUTH_GATEWAY)
    private readonly authGateway: SupabaseAuthGateway,
  ) {}

  async verifyAccessToken(accessToken: string): Promise<AuthenticatedIdentity> {
    const identity = await this.authGateway.getUser(accessToken);

    if (!identity) {
      throw new UnauthorizedException('Invalid or expired access token.');
    }

    return identity;
  }
}
