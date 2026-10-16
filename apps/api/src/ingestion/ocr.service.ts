import { Injectable } from '@nestjs/common';
import spanishData from '@tesseract.js-data/spa';

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
    const worker = await createWorker('spa', 1, {
      gzip: spanishData.gzip,
      langPath: spanishData.langPath,
    });
    let termination: Promise<unknown> | undefined;
    const terminate = () => (termination ??= worker.terminate());
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
        if (!signal) return (await worker.recognize(image)).data.text.trim();
        let abortRecognition: () => void = () => undefined;
        const cancelled = new Promise<never>((_, reject) => {
          abortRecognition = () =>
            reject(
              signal.reason instanceof Error
                ? signal.reason
                : new Error('OCR_ABORTED'),
            );
          signal.addEventListener('abort', abortRecognition, { once: true });
        });
        try {
          const recognized = await Promise.race([
            worker.recognize(image),
            cancelled,
          ]);
          signal.throwIfAborted();
          return recognized.data.text.trim();
        } finally {
          signal.removeEventListener('abort', abortRecognition);
        }
      });
      signal?.throwIfAborted();
      return result;
    } finally {
      signal?.removeEventListener('abort', onAbort);
      await terminate();
    }
  }
}
