import { Injectable } from '@nestjs/common';
import spanishData from '@tesseract.js-data/spa';
import { createWorker } from 'tesseract.js';

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
  ): Promise<T> {
    const worker = await createWorker('spa', 1, {
      gzip: spanishData.gzip,
      langPath: spanishData.langPath,
    });
    try {
      return await run(async (image) =>
        (await worker.recognize(image)).data.text.trim(),
      );
    } finally {
      await worker.terminate();
    }
  }
}
