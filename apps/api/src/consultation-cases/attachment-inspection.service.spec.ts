import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  AttachmentInspectionService,
  MAX_CONSULTATION_ATTACHMENT_BYTES,
} from './attachment-inspection.service';

function file(
  buffer: Buffer,
  originalname = 'adjunto.bin',
): Express.Multer.File {
  return {
    buffer,
    destination: '',
    encoding: '7bit',
    fieldname: 'file',
    filename: originalname,
    mimetype: 'application/octet-stream',
    originalname,
    path: '',
    size: buffer.length,
    stream: undefined as never,
  };
}

describe('AttachmentInspectionService', () => {
  const service = new AttachmentInspectionService();

  it('derives trusted image metadata from bytes and sanitizes its display name', () => {
    const image = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    expect(
      service.inspect(file(image, '..\\captura\u0000.png'), 'report_image'),
    ).toEqual({
      extension: 'png',
      fileSizeBytes: image.length,
      mimeType: 'image/png',
      originalFileName: 'captura.png',
      sha256: createHash('sha256').update(image).digest('hex'),
    });
  });

  it('accepts only supported suggestion file signatures', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const webp = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.alloc(4),
      Buffer.from('WEBP'),
    ]);
    const pdf = Buffer.from('%PDF-1.7\ncontenido');
    const doc = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    const docx = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from('[Content_Types].xml word/document.xml'),
    ]);

    expect(
      service.inspect(file(jpeg, 'foto.jpg'), 'suggestion_file')?.extension,
    ).toBe('jpg');
    expect(
      service.inspect(file(webp, 'foto.webp'), 'suggestion_file')?.extension,
    ).toBe('webp');
    expect(
      service.inspect(file(pdf, 'norma.pdf'), 'suggestion_file')?.mimeType,
    ).toBe('application/pdf');
    expect(
      service.inspect(file(doc, 'norma.doc'), 'suggestion_file')?.extension,
    ).toBe('doc');
    expect(
      service.inspect(file(docx, 'norma.docx'), 'suggestion_file')?.extension,
    ).toBe('docx');
    expect(
      service.inspect(file(pdf, ''), 'suggestion_file')?.originalFileName,
    ).toBe('adjunto');
  });

  it('rejects invalid, oversized and non-image report attachments', () => {
    expect(() =>
      service.inspect(file(Buffer.from('texto')), 'suggestion_file'),
    ).toThrow(BadRequestException);
    expect(() =>
      service.inspect(file(Buffer.from('%PDF-1.7')), 'report_image'),
    ).toThrow('JPEG, PNG or WebP');
    expect(() =>
      service.inspect(
        file(Buffer.alloc(MAX_CONSULTATION_ATTACHMENT_BYTES + 1, 0x61)),
        'suggestion_file',
      ),
    ).toThrow('10 MiB');
  });

  it('returns null for no optional file and rejects an inconsistent upload', () => {
    expect(service.inspect(undefined, 'suggestion_file')).toBeNull();
    const inconsistent = file(Buffer.from('%PDF-1.7'));
    Object.defineProperty(inconsistent, 'size', { value: 100 });
    expect(() => service.inspect(inconsistent, 'suggestion_file')).toThrow(
      'could not be read',
    );
  });
});
