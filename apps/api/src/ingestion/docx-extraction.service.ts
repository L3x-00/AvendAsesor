import { Injectable } from '@nestjs/common';
import * as mammoth from 'mammoth';
import {
  assertDocxWithinMemoryLimits,
  MAX_EXTRACTED_CHARS,
} from './document-format';

@Injectable()
export class DocxExtractionService {
  /** Extrae el texto plano de un .docx (Office Open XML) con mammoth. */
  async extract(buffer: Buffer): Promise<string> {
    // Guarda de memoria (Render Free 512 MB): rechaza un XML descomprimido
    // desmesurado ANTES de que mammoth lo cargue y construya el DOM.
    assertDocxWithinMemoryLimits(buffer);
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value.trim();
    if (text.length > MAX_EXTRACTED_CHARS) {
      throw new Error('INGESTION_DOCUMENT_TOO_LARGE');
    }
    return text;
  }
}
