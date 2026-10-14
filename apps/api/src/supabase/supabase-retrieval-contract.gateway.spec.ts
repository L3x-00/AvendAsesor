import { SupabaseRetrievalContractGatewayAdapter } from './supabase-retrieval-contract.gateway';
import type { SupabaseServerClient } from './supabase.server-client';
import {
  EXACT_REFERENCE_RETRIEVAL_RPC_NAME,
  RETRIEVAL_RPC_NAME,
} from '../rag/retrieval.constants';

let lastArgs: {
  p_query_text?: unknown;
  p_match_threshold?: unknown;
} | null = null;
let calledNames: string[] = [];

function clientReturning(result: { error: unknown }): SupabaseServerClient {
  return {
    rpc: (
      name: string,
      args: { p_query_text?: unknown; p_match_threshold?: unknown },
    ) => {
      calledNames.push(name);
      if (name === RETRIEVAL_RPC_NAME) lastArgs = args;
      return { abortSignal: () => Promise.resolve(result) };
    },
  } as unknown as SupabaseServerClient;
}

describe('SupabaseRetrievalContractGatewayAdapter', () => {
  beforeEach(() => {
    lastArgs = null;
    calledNames = [];
  });

  it('reports unconfigured when the Supabase client is absent', async () => {
    const gateway = new SupabaseRetrievalContractGatewayAdapter(null);
    await expect(gateway.probe()).resolves.toMatchObject({
      ok: false,
      reason: 'unconfigured',
    });
  });

  it('probes with arguments the RPC input guard accepts (non-empty text, threshold in [0,1])', async () => {
    // La RPC valida su entrada y lanza 22023 si el texto está vacío o el umbral
    // sale de [0,1]; si el probe usara args inválidos, en una BD sana nunca daría
    // ok y avisaría "transient?" en cada arranque.
    const gateway = new SupabaseRetrievalContractGatewayAdapter(
      clientReturning({ error: null }),
    );
    await gateway.probe();

    expect(typeof lastArgs?.p_query_text).toBe('string');
    expect((lastArgs?.p_query_text as string).trim().length).toBeGreaterThan(0);
    expect(typeof lastArgs?.p_match_threshold).toBe('number');
    const threshold = lastArgs?.p_match_threshold as number;
    expect(threshold).toBeGreaterThanOrEqual(0);
    expect(threshold).toBeLessThanOrEqual(1);
  });

  it('reports ok when the RPC responds without error', async () => {
    const gateway = new SupabaseRetrievalContractGatewayAdapter(
      clientReturning({ error: null }),
    );
    await expect(gateway.probe()).resolves.toEqual({ ok: true });
    expect(calledNames).toEqual([
      RETRIEVAL_RPC_NAME,
      EXACT_REFERENCE_RETRIEVAL_RPC_NAME,
    ]);
  });

  it('reports the exact-reference RPC as missing after the general contract passes', async () => {
    const client = {
      rpc: (name: string) => ({
        abortSignal: () =>
          Promise.resolve({
            error:
              name === EXACT_REFERENCE_RETRIEVAL_RPC_NAME
                ? { code: 'PGRST202', message: 'Could not find the function' }
                : null,
          }),
      }),
    } as unknown as SupabaseServerClient;
    const gateway = new SupabaseRetrievalContractGatewayAdapter(client);

    const result = await gateway.probe();
    expect(result).toMatchObject({ ok: false, reason: 'missing' });
    if (result.ok) throw new Error('Expected a missing contract.');
    expect(result.message).toContain(EXACT_REFERENCE_RETRIEVAL_RPC_NAME);
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

  it('classifies an unrelated error (e.g. input-validation 22023) as transient, not missing', async () => {
    const gateway = new SupabaseRetrievalContractGatewayAdapter(
      clientReturning({
        error: { code: '22023', message: 'Invalid document search parameters' },
      }),
    );
    await expect(gateway.probe()).resolves.toMatchObject({
      ok: false,
      reason: 'error',
    });
  });
});
