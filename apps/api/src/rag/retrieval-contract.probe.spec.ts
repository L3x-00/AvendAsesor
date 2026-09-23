import { Logger } from '@nestjs/common';
import { RetrievalContractProbe } from './retrieval-contract.probe';
import type {
  RetrievalContractGateway,
  RetrievalContractStatus,
} from '../supabase/supabase-retrieval-contract.gateway';

function probeWith(status: RetrievalContractStatus): {
  probe: RetrievalContractProbe;
  error: jest.SpyInstance;
  warn: jest.SpyInstance;
  log: jest.SpyInstance;
} {
  const gateway: RetrievalContractGateway = {
    probe: jest.fn().mockResolvedValue(status),
  };
  const error = jest
    .spyOn(Logger.prototype, 'error')
    .mockImplementation(() => undefined);
  const warn = jest
    .spyOn(Logger.prototype, 'warn')
    .mockImplementation(() => undefined);
  const log = jest
    .spyOn(Logger.prototype, 'log')
    .mockImplementation(() => undefined);
  return { probe: new RetrievalContractProbe(gateway), error, warn, log };
}

describe('RetrievalContractProbe', () => {
  afterEach(() => jest.restoreAllMocks());

  it('logs an actionable ERROR when the retrieval RPC is missing', async () => {
    const { probe, error, warn } = probeWith({
      ok: false,
      reason: 'missing',
      message: 'not found',
    });
    await probe.onApplicationBootstrap();
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining(
        'search_document_chunks_with_consultation_context',
      ),
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('logs OK (not error) when the contract holds', async () => {
    const { probe, error, log } = probeWith({ ok: true });
    await probe.onApplicationBootstrap();
    expect(log).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
  });

  it('warns without error when Supabase is unconfigured', async () => {
    const { probe, error, warn } = probeWith({
      ok: false,
      reason: 'unconfigured',
      message: 'no config',
    });
    await probe.onApplicationBootstrap();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
  });

  it('warns (not error) on a transient failure', async () => {
    const { probe, error, warn } = probeWith({
      ok: false,
      reason: 'error',
      message: 'timeout',
    });
    await probe.onApplicationBootstrap();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
  });
});
