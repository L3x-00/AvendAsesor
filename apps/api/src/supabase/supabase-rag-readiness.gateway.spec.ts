import { SupabaseRagReadinessGatewayAdapter } from './supabase-rag-readiness.gateway';
import type { SupabaseServerClient } from './supabase.server-client';

function clientReturning(
  countByStatus: Partial<Record<string, number>>,
  errorStatus?: string,
): SupabaseServerClient {
  return {
    from: () => ({
      select: () => ({
        eq: (_column: string, status: string) =>
          Promise.resolve(
            errorStatus === status
              ? { count: null, error: { message: 'boom' } }
              : { count: countByStatus[status] ?? 0, error: null },
          ),
      }),
    }),
  } as unknown as SupabaseServerClient;
}

describe('SupabaseRagReadinessGatewayAdapter', () => {
  it('returns null when the Supabase client is not configured', async () => {
    const gateway = new SupabaseRagReadinessGatewayAdapter(null);
    await expect(gateway.getIngestionCounts()).resolves.toBeNull();
  });

  it('aggregates version counts by ingestion status with a total', async () => {
    const gateway = new SupabaseRagReadinessGatewayAdapter(
      clientReturning({ pending: 2, processing: 1, indexed: 40, failed: 3 }),
    );
    await expect(gateway.getIngestionCounts()).resolves.toEqual({
      pending: 2,
      processing: 1,
      indexed: 40,
      failed: 3,
      total: 46,
    });
  });

  it('fails closed with ServiceUnavailable when a count query errors', async () => {
    const gateway = new SupabaseRagReadinessGatewayAdapter(
      clientReturning({}, 'failed'),
    );
    await expect(gateway.getIngestionCounts()).rejects.toThrow(
      'The RAG readiness store is temporarily unavailable.',
    );
  });
});
