import { Injectable } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';
import type { ExtractedPage } from './chunking.service';

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
        scale: 2,
      });
      return new Map(
        result.pages.map((page) => [page.pageNumber, Buffer.from(page.data)]),
      );
    } finally {
      await parser.destroy();
    }
  }
}
