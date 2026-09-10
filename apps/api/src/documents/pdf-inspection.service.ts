import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PDFParse } from 'pdf-parse';

/**
 * El módulo aceptaba solo PDF. El cliente necesita cargar también Word y
 * Markdown para poder probar la carga con sus documentos reales, así que la
 * inspección pasó a ser consciente del formato. El PDF conserva su validación
 * exacta (cabecera y conteo de páginas); los demás formatos se validan por
 * bytes mágicos y solo se almacenan (su indexación llega con la activación
 * del worker RAG). El tamaño máximo subió a 50 MiB para documentos pesados.
 */
export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
/** Alias retrocompatible: el límite es común a todos los formatos. */
export const MAX_PDF_BYTES = MAX_DOCUMENT_BYTES;
export const MAX_DOCUMENT_MIB = 50;
export const MAX_PDF_PAGES = 300;

export type DocumentFormat = 'doc' | 'docx' | 'md' | 'pdf';

interface DocumentFormatSpec {
  extension: string;
  mimeType: string;
}

/** Formatos admitidos para carga y almacenamiento. */
export const DOCUMENT_FORMATS: Record<DocumentFormat, DocumentFormatSpec> = {
  doc: { extension: '.doc', mimeType: 'application/msword' },
  docx: {
    extension: '.docx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  md: { extension: '.md', mimeType: 'text/markdown' },
  pdf: { extension: '.pdf', mimeType: 'application/pdf' },
};

export const ALLOWED_DOCUMENT_MIME_TYPES = Object.values(DOCUMENT_FORMATS).map(
  (spec) => spec.mimeType,
);

export interface InspectedDocument {
  extension: string;
  format: DocumentFormat;
  mimeType: string;
  originalFileName: string;
  pageCount: number;
  sha256: string;
  sizeBytes: number;
}

/** Alias retrocompatible con los llamadores previos. */
export type InspectedPdf = InspectedDocument;

/** A PDF-looking upload that could not be read by the processing engine. */
export class UnreadablePdfException extends BadRequestException {
  constructor() {
    super('The uploaded PDF could not be read or processed.');
  }
}

function hasPdfHeader(content: Buffer): boolean {
  return content.subarray(0, Math.min(content.length, 1_024)).includes('%PDF-');
}

/** DOCX (y todo OOXML) es un ZIP: empieza con la firma "PK\x03\x04". */
function hasZipHeader(content: Buffer): boolean {
  return (
    content.length >= 4 &&
    content[0] === 0x50 &&
    content[1] === 0x4b &&
    content[2] === 0x03 &&
    content[3] === 0x04
  );
}

/** DOC heredado (OLE2 Compound File) empieza con "D0 CF 11 E0 A1 B1 1A E1". */
function hasOleHeader(content: Buffer): boolean {
  const signature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  return (
    content.length >= signature.length &&
    signature.every((byte, index) => content[index] === byte)
  );
}

/**
 * Markdown no tiene bytes mágicos; se acepta como texto: sin bytes nulos y
 * decodificable como UTF-8. Un binario disfrazado de `.md` cae aquí.
 */
function isProbablyText(content: Buffer): boolean {
  if (content.includes(0)) return false;
  const decoded = content.toString('utf8');
  return !decoded.includes('�');
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

function detectFormat(fileName: string): DocumentFormat {
  const lower = fileName.toLocaleLowerCase('en');
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.docx')) return 'docx';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'md';
  // `.doc` va al final: `.docx` también termina en la subcadena "doc".
  if (lower.endsWith('.doc')) return 'doc';
  throw new BadRequestException(
    'Only .pdf, .docx, .doc or .md files are allowed.',
  );
}

@Injectable()
export class PdfInspectionService {
  inspectUnreadable(file: Express.Multer.File | undefined): InspectedDocument {
    const basic = this.inspectBasic(file);
    return { ...basic, pageCount: 1 };
  }

  async inspect(
    file: Express.Multer.File | undefined,
  ): Promise<InspectedDocument> {
    const basic = this.inspectBasic(file);
    if (!file) {
      throw new BadRequestException('A non-empty document file is required.');
    }

    // Solo el PDF tiene conteo de páginas; los demás formatos se almacenan
    // sin analizar (el conteo real llegaría con la indexación).
    if (basic.format !== 'pdf') {
      return { ...basic, pageCount: 1 };
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
  ): Omit<InspectedDocument, 'pageCount'> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('A non-empty document file is required.');
    }
    if (file.buffer.length > MAX_DOCUMENT_BYTES) {
      throw new BadRequestException('Documents cannot exceed 50 MiB.');
    }

    const originalFileName = sanitizeOriginalFileName(file.originalname);
    const format = detectFormat(originalFileName);
    const spec = DOCUMENT_FORMATS[format];

    this.assertContentMatchesFormat(format, file.buffer);

    return {
      extension: spec.extension,
      format,
      mimeType: spec.mimeType,
      originalFileName,
      sha256: createHash('sha256').update(file.buffer).digest('hex'),
      sizeBytes: file.buffer.length,
    };
  }

  /**
   * No se confía en la extensión ni en el `Content-Type` declarado: el
   * contenido real debe coincidir con el formato anunciado.
   */
  private assertContentMatchesFormat(
    format: DocumentFormat,
    content: Buffer,
  ): void {
    if (format === 'pdf') {
      if (!hasPdfHeader(content)) {
        throw new BadRequestException('The uploaded file is not a valid PDF.');
      }
      return;
    }
    if (format === 'docx') {
      if (!hasZipHeader(content)) {
        throw new BadRequestException(
          'The uploaded file is not a valid Word (.docx) document.',
        );
      }
      return;
    }
    if (format === 'doc') {
      if (!hasOleHeader(content)) {
        throw new BadRequestException(
          'The uploaded file is not a valid Word (.doc) document.',
        );
      }
      return;
    }
    if (!isProbablyText(content)) {
      throw new BadRequestException(
        'The uploaded file is not a valid Markdown (.md) document.',
      );
    }
  }
}
