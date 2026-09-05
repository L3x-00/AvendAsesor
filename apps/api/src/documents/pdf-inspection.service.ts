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

/** A PDF-looking upload that could not be read by the processing engine. */
export class UnreadablePdfException extends BadRequestException {
  constructor() {
    super('The uploaded PDF could not be read or processed.');
  }
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
  inspectUnreadable(file: Express.Multer.File | undefined): InspectedPdf {
    const basic = this.inspectBasic(file);
    return { ...basic, pageCount: 1 };
  }

  async inspect(file: Express.Multer.File | undefined): Promise<InspectedPdf> {
    const basic = this.inspectBasic(file);
    if (!file) {
      throw new BadRequestException('A non-empty PDF file is required.');
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
        ...basic,
        pageCount: info.total,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new UnreadablePdfException();
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  }

  private inspectBasic(
    file: Express.Multer.File | undefined,
  ): Omit<InspectedPdf, 'pageCount'> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('A non-empty PDF file is required.');
    }
    if (file.buffer.length > MAX_PDF_BYTES) {
      throw new BadRequestException('PDF files cannot exceed 20 MiB.');
    }

    const originalFileName = sanitizeOriginalFileName(file.originalname);
    if (!originalFileName.toLocaleLowerCase('en').endsWith('.pdf')) {
      throw new BadRequestException(
        'Only files with a .pdf extension are allowed.',
      );
    }
    if (
      file.mimetype &&
      file.mimetype !== 'application/pdf' &&
      file.mimetype !== 'application/octet-stream'
    ) {
      throw new BadRequestException('The uploaded file type must be PDF.');
    }
    if (!hasPdfHeader(file.buffer)) {
      throw new BadRequestException('The uploaded file is not a valid PDF.');
    }

    return {
      originalFileName,
      sha256: createHash('sha256').update(file.buffer).digest('hex'),
      sizeBytes: file.buffer.length,
    };
  }
}
