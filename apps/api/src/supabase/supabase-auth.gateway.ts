import { ServiceUnavailableException } from '@nestjs/common';

export interface AuthenticatedIdentity {
  email: string | null;
  emailConfirmedAt: string | null;
  id: string;
}

interface SupabaseAuthUser {
  email?: string | null;
  email_confirmed_at?: string | null;
  id: string;
}

export interface SupabaseAuthClient {
  auth: {
    getUser(accessToken: string): Promise<{
      data: { user: SupabaseAuthUser | null };
      error: unknown;
    }>;
  };
}

export interface SupabaseAuthGateway {
  getUser(accessToken: string): Promise<AuthenticatedIdentity | null>;
}

export class SupabaseAuthGatewayAdapter implements SupabaseAuthGateway {
  constructor(private readonly client: SupabaseAuthClient | null) {}

  async getUser(accessToken: string): Promise<AuthenticatedIdentity | null> {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Identity provider is not configured.',
      );
    }

    const { data, error } = await this.client.auth.getUser(accessToken);

    if (error || !data.user) {
      return null;
    }

    return {
      email: data.user.email ?? null,
      emailConfirmedAt: data.user.email_confirmed_at ?? null,
      id: data.user.id,
    };
  }
}
