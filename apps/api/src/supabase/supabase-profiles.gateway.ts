import {
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  supabaseProfileRowSchema,
  type UserProfile,
} from '../users/domain/user-profile';

interface SupabaseProfilesQuery {
  select(columns: string): {
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
}

export interface SupabaseProfilesGateway {
  findById(userId: string): Promise<UserProfile | null>;
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
      .select('id, full_name, role')
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

    return {
      fullName: result.data.full_name,
      id: result.data.id,
      role: result.data.role,
    };
  }
}
