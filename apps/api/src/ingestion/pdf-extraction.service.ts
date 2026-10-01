import { Injectable } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';
import type { ExtractedPage } from './chunking.service';

/** Ancho de rasterizado para OCR; tiene prioridad sobre la escala. */
export const OCR_RENDER_WIDTH_PX = 1240;

@Injectable()
export class PdfExtractionService {
  async extract(buffer: Buffer): Promise<ExtractedPage[]> {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.pages.map((page) => ({
        pageNumber: page.num,
        text: page.text.trim(),
      }));
    } finally {
      await parser.destroy();
    }
  }

  async render(
    buffer: Buffer,
    pageNumbers: number[],
  ): Promise<Map<number, Buffer>> {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getScreenshot({
        imageBuffer: true,
        imageDataUrl: false,
        partial: pageNumbers,
        // Ancho fijo (≈150 ppp en A4, como la escala 2 anterior): una página
        // de tamaño anómalo ya no genera un lienzo de cientos de MB que deja
        // al worker sin memoria en Render Free (512 MB).
        desiredWidth: OCR_RENDER_WIDTH_PX,
      });
      return new Map(
        result.pages.map((page) => [page.pageNumber, Buffer.from(page.data)]),
      );
    } finally {
      await parser.destroy();
    }
  }
}
