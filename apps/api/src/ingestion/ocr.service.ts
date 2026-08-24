import { Injectable } from '@nestjs/common';
import spanishData from '@tesseract.js-data/spa';
import { createWorker } from 'tesseract.js';

@Injectable()
export class OcrService {
  async recognize(image: Buffer): Promise<string> {
    const worker = await createWorker('spa', 1, {
      gzip: spanishData.gzip,
      langPath: spanishData.langPath,
    });
    try {
      return (await worker.recognize(image)).data.text.trim();
    } finally {
      await worker.terminate();
    }
  }
}
