import {
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  supabaseProfileRowSchema,
  type UserProfile,
} from '../users/domain/user-profile';

interface SupabaseProfilesQuery {
  select(columns: 'id, full_name, role, account_status, access_expires_at'): {
    eq(
      column: 'id',
      value: string,
    ): {
      maybeSingle(): PromiseLike<{ data: unknown; error: unknown }>;
    };
  };
}

export interface SupabaseProfilesClient {
  from(table: 'profiles'): SupabaseProfilesQuery;
  rpc(
    functionName: 'has_admin_module_access' | 'touch_profile_last_access',
    args: { p_user_id: string },
  ): PromiseLike<{ data?: unknown; error: unknown }>;
}

export interface SupabaseProfilesGateway {
  findById(userId: string): Promise<UserProfile | null>;
  touchLastAccess(userId: string): Promise<void>;
}

export class SupabaseProfilesGatewayAdapter implements SupabaseProfilesGateway {
  constructor(private readonly client: SupabaseProfilesClient | null) {}

  async findById(userId: string): Promise<UserProfile | null> {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'User profile store is not configured.',
      );
    }

    const { data, error } = await this.client
      .from('profiles')
      .select('id, full_name, role, account_status, access_expires_at')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      throw new ServiceUnavailableException(
        'User profile store is temporarily unavailable.',
      );
    }

    if (!data) {
      return null;
    }

    const result = supabaseProfileRowSchema.safeParse(data);

    if (!result.success) {
      throw new InternalServerErrorException('User profile data is invalid.');
    }

    const permission = await this.client.rpc('has_admin_module_access', {
      p_user_id: result.data.id,
    });

    if (permission.error || typeof permission.data !== 'boolean') {
      throw new ServiceUnavailableException(
        'User module permissions are temporarily unavailable.',
      );
    }

    return {
      accessExpiresAt: result.data.access_expires_at,
      accountStatus: result.data.account_status,
      fullName: result.data.full_name,
      id: result.data.id,
      modulesAccess: permission.data,
      role: result.data.role,
    };
  }

  async touchLastAccess(userId: string): Promise<void> {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'User profile store is not configured.',
      );
    }

    const { error } = await this.client.rpc('touch_profile_last_access', {
      p_user_id: userId,
    });

    if (error) {
      throw new ServiceUnavailableException(
        'User profile access tracking is temporarily unavailable.',
      );
    }
  }
}
