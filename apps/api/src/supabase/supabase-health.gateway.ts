interface SupabaseHealthQuery {
  select(
    columns: 'id',
    options: { head: true },
  ): {
    limit(limit: 1): {
      abortSignal(signal: AbortSignal): PromiseLike<{ error: unknown }>;
    };
  };
}

export interface SupabaseHealthClient {
  from(table: 'profiles'): SupabaseHealthQuery;
}

export interface SupabaseHealthGateway {
  isReady(): Promise<boolean>;
}

export class SupabaseHealthGatewayAdapter implements SupabaseHealthGateway {
  constructor(private readonly client: SupabaseHealthClient | null) {}

  async isReady(): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      const { error } = await this.client
        .from('profiles')
        .select('id', { head: true })
        .limit(1)
        .abortSignal(AbortSignal.timeout(3_000));

      return !error;
    } catch {
      return false;
    }
  }
}
