import { ForbiddenException, Injectable } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { type UserRole } from '../users/domain/user-profile';
import { UsersService } from '../users/users.service';

export interface AuthorizationContext {
  email: string | null;
  emailConfirmedAt: string | null;
  role: UserRole;
  userId: string;
}

@Injectable()
export class AuthorizationService {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  async resolveContext(accessToken: string): Promise<AuthorizationContext> {
    const identity = await this.authService.verifyAccessToken(accessToken);
    const profile = await this.usersService.findProfileById(identity.id);

    if (!profile) {
      throw new ForbiddenException(
        'Authenticated user profile is unavailable.',
      );
    }

    if (profile.accountStatus !== 'active') {
      throw new ForbiddenException('Account access is suspended.');
    }

    if (
      profile.accessExpiresAt !== null &&
      Date.parse(profile.accessExpiresAt) < Date.now()
    ) {
      throw new ForbiddenException('Account access has expired.');
    }

    // Access telemetry is useful to superadministrators but must never weaken
    // the authorization boundary when its optional persistence path is down.
    void this.usersService.touchLastAccess(profile.id).catch(() => undefined);

    return {
      email: identity.email,
      emailConfirmedAt: identity.emailConfirmedAt,
      role: profile.role,
      userId: identity.id,
    };
  }
}
