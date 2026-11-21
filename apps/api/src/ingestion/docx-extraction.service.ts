import { Injectable } from '@nestjs/common';
import {
  assertDocxWithinMemoryLimits,
  MAX_EXTRACTED_CHARS,
} from './document-format';

/**
 * Un OLE2 puede expandir sus flujos al parsearse (piece table de Word 97).
 * 20 MiB de entrada → peor caso ~40 MiB, holgados en Render Free (512 MiB).
 */
const MAX_LEGACY_DOC_BYTES = 20 * 1024 * 1024;

@Injectable()
export class DocxExtractionService {
  /** Extrae el texto plano de un .docx (Office Open XML) con mammoth. */
  async extract(buffer: Buffer): Promise<string> {
    // Guarda de memoria (Render Free 512 MB): rechaza un XML descomprimido
    // desmesurado ANTES de que mammoth lo cargue y construya el DOM.
    assertDocxWithinMemoryLimits(buffer);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require('mammoth') as typeof import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value.trim();
    if (text.length > MAX_EXTRACTED_CHARS) {
      throw new Error('INGESTION_DOCUMENT_TOO_LARGE');
    }
    return text;
  }

  /**
   * Extrae el texto de un `.doc` heredado (OLE2) con word-extractor, una
   * librería puramente JavaScript: no requiere LibreOffice ni binarios en el
   * contenedor de Render. Las tablas se conservan como filas de texto.
   */
  async extractLegacy(buffer: Buffer): Promise<string> {
    if (buffer.length > MAX_LEGACY_DOC_BYTES) {
      throw new Error('INGESTION_DOCUMENT_TOO_LARGE');
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const WordExtractor = require('word-extractor') as new () => {
      extract(input: Buffer): Promise<{ getBody(): string }>;
    };
    let text: string;
    try {
      const document = await new WordExtractor().extract(buffer);
      text = document.getBody().trim();
    } catch {
      throw new Error('INGESTION_DOC_UNREADABLE');
    }
    if (!text) throw new Error('INGESTION_DOC_UNREADABLE');
    if (text.length > MAX_EXTRACTED_CHARS) {
      throw new Error('INGESTION_DOCUMENT_TOO_LARGE');
    }
    return text;
  }
}
