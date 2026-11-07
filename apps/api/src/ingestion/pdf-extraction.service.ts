import { Injectable } from '@nestjs/common';
import { MAX_PDF_PAGES } from '../documents/pdf-inspection.service';
import { createPdfParser } from '../documents/pdf-parser';
import type { ExtractedPage } from './chunking.service';

/** Ancho de rasterizado para OCR; tiene prioridad sobre la escala. */
export const OCR_RENDER_WIDTH_PX = 1240;

export class IncompletePdfExtractionError extends Error {
  constructor(
    detail: string,
    readonly retryable = false,
  ) {
    super(detail);
  }
}

function verifiedPageCount(total: number): number {
  if (!Number.isInteger(total) || total < 1) {
    throw new IncompletePdfExtractionError('PDF_PAGE_COUNT_UNVERIFIED');
  }
  if (total > MAX_PDF_PAGES) throw new Error('INGESTION_DOCUMENT_TOO_LARGE');
  return total;
}

@Injectable()
export class PdfExtractionService {
  async countPages(buffer: Buffer): Promise<number> {
    const parser = createPdfParser({ data: buffer });
    try {
      return verifiedPageCount((await parser.getInfo()).total);
    } finally {
      await parser.destroy();
    }
  }

  async extract(buffer: Buffer): Promise<ExtractedPage[]> {
    const parser = createPdfParser({ data: buffer });
    try {
      const total = verifiedPageCount((await parser.getInfo()).total);
      const result = await parser.getText();
      const pages = result.pages.map((page) => ({
        pageNumber: page.num,
        text: page.text.trim(),
      }));
      if (
        result.total !== total ||
        pages.length !== total ||
        pages.some((page, index) => page.pageNumber !== index + 1)
      ) {
        throw new IncompletePdfExtractionError('PDF_PAGE_COVERAGE_INCOMPLETE');
      }
      return pages;
    } finally {
      await parser.destroy();
    }
  }

  async render(
    buffer: Buffer,
    pageNumbers: number[],
  ): Promise<Map<number, Buffer>> {
    const parser = createPdfParser({ data: buffer });
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
        result.pages.map((page) => [
          page.pageNumber,
          Buffer.from(
            page.data.buffer,
            page.data.byteOffset,
            page.data.byteLength,
          ),
        ]),
      );
    } finally {
      await parser.destroy();
    }
  }
}
