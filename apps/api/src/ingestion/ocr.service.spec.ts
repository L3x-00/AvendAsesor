const mockRecognize = jest.fn();
const mockTerminate = jest.fn();
const mockCreateWorker = jest.fn();

jest.mock('tesseract.js', () => ({
  createWorker: mockCreateWorker,
}));

import { OcrService } from './ocr.service';

describe('OcrService', () => {
  const service = new OcrService();

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateWorker.mockResolvedValue({
      recognize: mockRecognize,
      terminate: mockTerminate,
    });
    mockTerminate.mockResolvedValue(undefined);
  });

  it('reuses a single worker for every page and frees it once', async () => {
    mockRecognize
      .mockResolvedValueOnce({ data: { text: ' Página uno ' } })
      .mockResolvedValueOnce({ data: { text: ' Página dos ' } });

    const results = await service.withWorker(async (recognize) => [
      await recognize(Buffer.from('image-1')),
      await recognize(Buffer.from('image-2')),
    ]);

    expect(results).toEqual(['Página uno', 'Página dos']);
    expect(mockCreateWorker).toHaveBeenCalledTimes(1);
    expect(mockRecognize).toHaveBeenCalledTimes(2);
    expect(mockTerminate).toHaveBeenCalledTimes(1);
  });

  it('frees the worker when recognition fails', async () => {
    mockRecognize.mockRejectedValue(new Error('ocr failed'));

    await expect(
      service.withWorker(async (recognize) => recognize(Buffer.from('image'))),
    ).rejects.toThrow('ocr failed');
    expect(mockTerminate).toHaveBeenCalledTimes(1);
  });

  it('terminates pending recognition on abort and removes its listeners', async () => {
    const cancellation = new AbortController();
    const remove = jest.spyOn(cancellation.signal, 'removeEventListener');
    mockRecognize.mockReturnValue(new Promise(() => undefined));
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const processing = service.withWorker(async (recognize) => {
      const result = recognize(Buffer.from('image'));
      started();
      return result;
    }, cancellation.signal);
    const failure = expect(processing).rejects.toThrow('INGESTION_TIMEOUT');
    await ready;
    cancellation.abort(new Error('INGESTION_TIMEOUT'));
    await failure;
    expect(mockTerminate).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(2);
  });

  it('waits for worker disposal before releasing cancelled recognition', async () => {
    const cancellation = new AbortController();
    let finishTermination!: () => void;
    mockTerminate.mockReturnValue(
      new Promise<void>((resolve) => {
        finishTermination = resolve;
      }),
    );
    mockRecognize.mockImplementation(() => {
      cancellation.abort(new Error('INGESTION_TIMEOUT'));
      return new Promise(() => undefined);
    });
    let settled = false;
    const processing = service.withWorker(
      async (recognize) => recognize(Buffer.from('image')),
      cancellation.signal,
    );
    const failure = expect(processing).rejects.toThrow('INGESTION_TIMEOUT');
    void processing.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    for (let index = 0; index < 5; index++) await Promise.resolve();
    expect(settled).toBe(false);
    finishTermination();
    await failure;
    expect(mockTerminate).toHaveBeenCalledTimes(1);
  });

  it('cleans up a worker whose initialization finishes after cancellation', async () => {
    const cancellation = new AbortController();
    let initialized!: (worker: unknown) => void;
    mockCreateWorker.mockReturnValue(
      new Promise((resolve) => {
        initialized = resolve;
      }),
    );
    const run = jest.fn();
    const processing = service.withWorker(run, cancellation.signal);
    const failure = expect(processing).rejects.toThrow('INGESTION_TIMEOUT');
    cancellation.abort(new Error('INGESTION_TIMEOUT'));
    initialized({ recognize: mockRecognize, terminate: mockTerminate });
    await failure;
    expect(run).not.toHaveBeenCalled();
    expect(mockTerminate).toHaveBeenCalledTimes(1);
  });

  it('starts no worker for an already aborted job', async () => {
    const cancellation = new AbortController();
    cancellation.abort(new Error('INGESTION_TIMEOUT'));
    await expect(
      service.withWorker(jest.fn(), cancellation.signal),
    ).rejects.toThrow('INGESTION_TIMEOUT');
    expect(mockCreateWorker).not.toHaveBeenCalled();
  });
});
