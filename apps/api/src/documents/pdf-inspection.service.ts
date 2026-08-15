import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PDFParse } from 'pdf-parse';

export const MAX_PDF_BYTES = 20 * 1024 * 1024;
export const MAX_PDF_PAGES = 300;

export interface InspectedPdf {
  originalFileName: string;
  pageCount: number;
  sha256: string;
  sizeBytes: number;
}

function hasPdfHeader(content: Buffer): boolean {
  return content.subarray(0, Math.min(content.length, 1_024)).includes('%PDF-');
}

function sanitizeOriginalFileName(value: string): string {
  const fileName = Array.from(
    value
      .split(/[\\/]/)
      .at(-1)
      ?.normalize('NFC')
      .replace(/[<>:"|?*]/g, '_') ?? '',
  )
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;

      return codePoint >= 32 && codePoint !== 127;
    })
    .join('')
    .trim();

  if (!fileName) {
    throw new BadRequestException('The uploaded file name is invalid.');
  }

  return fileName.slice(0, 255);
}

@Injectable()
export class PdfInspectionService {
  async inspect(file: Express.Multer.File | undefined): Promise<InspectedPdf> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('A non-empty PDF file is required.');
    }

    if (file.buffer.length > MAX_PDF_BYTES) {
      throw new BadRequestException('PDF files cannot exceed 20 MiB.');
    }

    if (!hasPdfHeader(file.buffer)) {
      throw new BadRequestException('The uploaded file is not a valid PDF.');
    }

    const parser = new PDFParse({
      data: Buffer.from(file.buffer),
      stopAtErrors: true,
    });

    try {
      const info = await parser.getInfo();

      if (!Number.isInteger(info.total) || info.total < 1) {
        throw new BadRequestException('The PDF does not contain any pages.');
      }

      if (info.total > MAX_PDF_PAGES) {
        throw new BadRequestException('PDF files cannot exceed 300 pages.');
      }

      return {
        originalFileName: sanitizeOriginalFileName(file.originalname),
        pageCount: info.total,
        sha256: createHash('sha256').update(file.buffer).digest('hex'),
        sizeBytes: file.buffer.length,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException('The uploaded file is not a valid PDF.');
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  }
}
