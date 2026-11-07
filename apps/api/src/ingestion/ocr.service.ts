import { Injectable } from '@nestjs/common';
import spanishData from '@tesseract.js-data/spa';
import type { Worker } from 'node:worker_threads';

export type OcrRecognize = (image: Buffer) => Promise<string>;

@Injectable()
export class OcrService {
  /**
   * Ejecuta `run` con UN solo worker Tesseract reutilizable para todas las
   * páginas del trabajo (antes se creaba y destruía uno por página, con carga
   * de datos `spa` y arranque WASM repetidos — coste y picos de memoria en
   * Render Free). El worker se libera siempre al terminar, incluso ante error.
   */
  async withWorker<T>(
    run: (recognize: OcrRecognize) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    signal?.throwIfAborted();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const library = require('tesseract.js') as typeof import('tesseract.js');
    const { createWorker } = library;
    let workerReady = false;
    const worker = await createWorker('spa', 1, {
      gzip: spanishData.gzip,
      langPath: spanishData.langPath,
      errorHandler: () => {
        // Tesseract rejects recognition before calling this handler. During
        // startup, some errors do not reject createWorker and expose no handle
        // for disposal. Preserve process/lease recovery for that case.
        if (!workerReady) throw new Error('OCR_WORKER_INITIALIZATION_FAILED');
      },
    });
    workerReady = true;
    // tesseract.js 7 exposes its Node Worker at runtime (its declarations omit
    // it). Its terminate() discards Worker.terminate()'s promise, so awaiting
    // that wrapper alone can overlap the next job with a still-live WASM heap.
    const nativeWorker = (worker as typeof worker & { worker: Worker }).worker;
    // A native error also emits exit. Observe it without taking down the API.
    const onWorkerError = () => undefined;
    nativeWorker.on('error', onWorkerError);
    const exited =
      nativeWorker.threadId === -1
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            nativeWorker.once('exit', () => resolve());
          });
    let termination: Promise<unknown> | undefined;
    const terminate = () =>
      (termination ??= (async () => {
        try {
          await worker.terminate();
        } finally {
          await exited;
        }
      })());
    const onAbort = () => {
      // Tesseract termination does not reject a pending recognize promise.
      // The per-recognition race below unwinds its caller as well.
      void terminate().catch(() => undefined);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      signal?.throwIfAborted();
      const result = await run(async (image) => {
        signal?.throwIfAborted();
        let abortRecognition: () => void = () => undefined;
        const cancelled = new Promise<never>((_, reject) => {
          abortRecognition = () =>
            reject(
              signal?.reason instanceof Error
                ? signal.reason
                : new Error('OCR_ABORTED'),
            );
          signal?.addEventListener('abort', abortRecognition, { once: true });
        });
        try {
          const recognized = await Promise.race([
            worker.recognize(image),
            cancelled,
            exited.then(() => {
              signal?.throwIfAborted();
              throw new Error('OCR_WORKER_EXITED');
            }),
          ]);
          signal?.throwIfAborted();
          return recognized.data.text.trim();
        } finally {
          signal?.removeEventListener('abort', abortRecognition);
        }
      });
      signal?.throwIfAborted();
      return result;
    } finally {
      signal?.removeEventListener('abort', onAbort);
      try {
        await terminate();
      } finally {
        nativeWorker.removeListener('error', onWorkerError);
      }
    }
  }
}
