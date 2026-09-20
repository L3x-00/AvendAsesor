import { Injectable } from '@nestjs/common';
import * as mammoth from 'mammoth';

@Injectable()
export class DocxExtractionService {
  /** Extrae el texto plano de un .docx (Office Open XML) con mammoth. */
  async extract(buffer: Buffer): Promise<string> {
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  }
}
