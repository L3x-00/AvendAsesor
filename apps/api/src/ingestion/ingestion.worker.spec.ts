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
});
