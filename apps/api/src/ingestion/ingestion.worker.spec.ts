import { IngestionWorker } from './ingestion.worker';

describe('IngestionWorker', () => {
  it('keeps background processing disabled unless explicitly configured', async () => {
    const processNext = jest.fn();
    const worker = new IngestionWorker(
      { get: jest.fn().mockReturnValue(false) } as never,
      { processNext } as never,
    );

    await worker.poll();
    expect(processNext).not.toHaveBeenCalled();
  });

  it('processes one durable job when explicitly enabled', async () => {
    const processNext = jest.fn().mockResolvedValue(true);
    const worker = new IngestionWorker(
      { get: jest.fn().mockReturnValue(true) } as never,
      { processNext } as never,
    );

    await worker.poll();
    expect(processNext).toHaveBeenCalledTimes(1);
  });

  it('never starts a second job while the previous one is still running', async () => {
    let release: (value: boolean) => void = () => undefined;
    const processNext = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValue(false);
    const worker = new IngestionWorker(
      { get: jest.fn().mockReturnValue(true) } as never,
      { processNext } as never,
    );

    const first = worker.poll();
    await worker.poll();
    await worker.poll();
    expect(processNext).toHaveBeenCalledTimes(1);

    release(true);
    await first;
    await worker.poll();
    expect(processNext).toHaveBeenCalledTimes(2);
  });

  it('keeps polling after a job claim fails', async () => {
    const processNext = jest
      .fn()
      .mockRejectedValueOnce(new Error('claim failed'))
      .mockResolvedValue(false);
    const worker = new IngestionWorker(
      { get: jest.fn().mockReturnValue(true) } as never,
      { processNext } as never,
    );
    jest
      .spyOn(
        (worker as unknown as { logger: { error: () => void } }).logger,
        'error',
      )
      .mockImplementation(() => undefined);

    await expect(worker.poll()).resolves.toBeUndefined();
    await worker.poll();
    expect(processNext).toHaveBeenCalledTimes(2);
  });
});
