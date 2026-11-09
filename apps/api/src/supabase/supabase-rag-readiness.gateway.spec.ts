import { SupabaseRagReadinessGatewayAdapter } from './supabase-rag-readiness.gateway';
import type { SupabaseServerClient } from './supabase.server-client';

function clientReturning(
  countByStatus: Partial<Record<string, number>>,
  errorStatus?: string,
): { client: SupabaseServerClient; abortSignal: jest.Mock } {
  const abortSignal = jest.fn((signal: AbortSignal) => {
    void signal;
  });
  return {
    abortSignal,
    client: {
      from: () => ({
        select: () => ({
          eq: (_column: string, status: string) => ({
            abortSignal: (signal: AbortSignal) => {
              abortSignal(signal);
              return Promise.resolve(
                errorStatus === status
                  ? { count: null, error: { message: 'boom' } }
                  : { count: countByStatus[status] ?? 0, error: null },
              );
            },
          }),
        }),
      }),
    } as unknown as SupabaseServerClient,
  };
}

describe('SupabaseRagReadinessGatewayAdapter', () => {
  it('returns null when the Supabase client is not configured', async () => {
    const gateway = new SupabaseRagReadinessGatewayAdapter(null);
    await expect(gateway.getIngestionCounts()).resolves.toBeNull();
  });

  it('aggregates version counts by ingestion status with a total', async () => {
    const { abortSignal, client } = clientReturning({
      pending: 2,
      processing: 1,
      indexed: 40,
      failed: 3,
    });
    const gateway = new SupabaseRagReadinessGatewayAdapter(client);
    await expect(gateway.getIngestionCounts()).resolves.toEqual({
      pending: 2,
      processing: 1,
      indexed: 40,
      failed: 3,
      total: 46,
    });
    expect(abortSignal).toHaveBeenCalledTimes(4);
    expect(abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it('fails closed with ServiceUnavailable when a count query errors', async () => {
    const gateway = new SupabaseRagReadinessGatewayAdapter(
      clientReturning({}, 'failed').client,
    );
    await expect(gateway.getIngestionCounts()).rejects.toThrow(
      'The RAG readiness store is temporarily unavailable.',
    );
  });
});
