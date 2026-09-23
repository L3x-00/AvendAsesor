import { SupabaseRetrievalContractGatewayAdapter } from './supabase-retrieval-contract.gateway';
import type { SupabaseServerClient } from './supabase.server-client';

function clientReturning(result: { error: unknown }): SupabaseServerClient {
  return {
    rpc: () => ({
      abortSignal: () => Promise.resolve(result),
    }),
  } as unknown as SupabaseServerClient;
}

describe('SupabaseRetrievalContractGatewayAdapter', () => {
  it('reports unconfigured when the Supabase client is absent', async () => {
    const gateway = new SupabaseRetrievalContractGatewayAdapter(null);
    await expect(gateway.probe()).resolves.toMatchObject({
      ok: false,
      reason: 'unconfigured',
    });
  });

  it('reports ok when the RPC responds without error', async () => {
    const gateway = new SupabaseRetrievalContractGatewayAdapter(
      clientReturning({ error: null }),
    );
    await expect(gateway.probe()).resolves.toEqual({ ok: true });
  });

  it('classifies a PostgREST "function not found" as missing', async () => {
    const gateway = new SupabaseRetrievalContractGatewayAdapter(
      clientReturning({
        error: { code: 'PGRST202', message: 'Could not find the function' },
      }),
    );
    await expect(gateway.probe()).resolves.toMatchObject({
      ok: false,
      reason: 'missing',
    });
  });

  it('classifies a PostgreSQL undefined_function (42883) as missing', async () => {
    const gateway = new SupabaseRetrievalContractGatewayAdapter(
      clientReturning({
        error: { code: '42883', message: 'function ... does not exist' },
      }),
    );
    await expect(gateway.probe()).resolves.toMatchObject({
      ok: false,
      reason: 'missing',
    });
  });

  it('classifies an unrelated error as transient (not missing)', async () => {
    const gateway = new SupabaseRetrievalContractGatewayAdapter(
      clientReturning({
        error: { code: '57014', message: 'canceling statement due to timeout' },
      }),
    );
    await expect(gateway.probe()).resolves.toMatchObject({
      ok: false,
      reason: 'error',
    });
  });
});
