import { SupabaseHealthGatewayAdapter } from './supabase-health.gateway';

function createClient(
  result: PromiseLike<{ error: unknown }> = Promise.resolve({ error: null }),
) {
  const abortSignal = jest.fn().mockReturnValue(result);
  const limit = jest.fn().mockReturnValue({ abortSignal });
  const select = jest.fn().mockReturnValue({ limit });
  const from = jest.fn().mockReturnValue({ select });

  return {
    abortSignal,
    client: { from },
    from,
    limit,
    select,
  };
}

describe('SupabaseHealthGatewayAdapter', () => {
  it('is not ready without a configured server client', async () => {
    const gateway = new SupabaseHealthGatewayAdapter(null);

    await expect(gateway.isReady()).resolves.toBe(false);
  });

  it('uses a bounded, metadata-only profiles probe when Supabase is available', async () => {
    const { abortSignal, client, from, limit, select } = createClient();
    const gateway = new SupabaseHealthGatewayAdapter(client);

    await expect(gateway.isReady()).resolves.toBe(true);
    expect(from).toHaveBeenCalledWith('profiles');
    expect(select).toHaveBeenCalledWith('id', { head: true });
    expect(limit).toHaveBeenCalledWith(1);
    expect(abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it('fails closed when the probe returns an error or rejects', async () => {
    const unavailable = createClient(
      Promise.resolve({ error: new Error('no') }),
    );
    const rejected = createClient(Promise.reject(new Error('network')));

    await expect(
      new SupabaseHealthGatewayAdapter(unavailable.client).isReady(),
    ).resolves.toBe(false);
    await expect(
      new SupabaseHealthGatewayAdapter(rejected.client).isReady(),
    ).resolves.toBe(false);
  });
});
