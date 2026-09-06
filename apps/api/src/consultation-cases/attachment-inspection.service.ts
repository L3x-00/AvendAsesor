import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';

export const MAX_CONSULTATION_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export interface InspectedConsultationAttachment {
  extension: string;
  fileSizeBytes: number;
  mimeType:
    | 'image/jpeg'
    | 'image/png'
    | 'image/webp'
    | 'application/pdf'
    | 'application/msword'
    | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  originalFileName: string;
  sha256: string;
}

function startsWith(buffer: Buffer, bytes: number[]): boolean {
  return bytes.every((byte, index) => buffer[index] === byte);
}

function contentType(
  buffer: Buffer,
): InspectedConsultationAttachment['mimeType'] | null {
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return 'image/png';
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  )
    return 'image/webp';
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-')
    return 'application/pdf';
  if (startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))
    return 'application/msword';
  if (
    startsWith(buffer, [0x50, 0x4b, 0x03, 0x04]) &&
    buffer.includes(Buffer.from('[Content_Types].xml')) &&
    buffer.includes(Buffer.from('word/'))
  ) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return null;
}

function extensionFor(
  mimeType: InspectedConsultationAttachment['mimeType'],
): string {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'application/pdf':
      return 'pdf';
    case 'application/msword':
      return 'doc';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return 'docx';
  }
}

function safeOriginalFileName(value: string): string {
  return [...basename(value || 'adjunto')]
    .filter((character) => {
      const codePoint = character.codePointAt(0);
      return (
        codePoint !== undefined &&
        codePoint >= 32 &&
        codePoint !== 127 &&
        character !== '/' &&
        character !== '\\'
      );
    })
    .join('')
    .trim()
    .slice(0, 255);
}

@Injectable()
export class AttachmentInspectionService {
  inspect(
    file: Express.Multer.File | undefined,
    kind: 'report_image' | 'suggestion_file',
  ): InspectedConsultationAttachment | null {
    if (!file) return null;
    if (!file.buffer?.length || file.size !== file.buffer.length) {
      throw new BadRequestException('The attachment could not be read.');
    }
    if (file.size > MAX_CONSULTATION_ATTACHMENT_BYTES) {
      throw new BadRequestException('The attachment cannot exceed 10 MiB.');
    }
    const mimeType = contentType(file.buffer);
    if (!mimeType) {
      throw new BadRequestException(
        'The attachment type is not allowed or its content is invalid.',
      );
    }
    if (kind === 'report_image' && !mimeType.startsWith('image/')) {
      throw new BadRequestException(
        'A report attachment must be a JPEG, PNG or WebP image.',
      );
    }
    const originalFileName = safeOriginalFileName(file.originalname);
    if (!originalFileName) {
      throw new BadRequestException('The attachment file name is invalid.');
    }
    return {
      extension: extensionFor(mimeType),
      fileSizeBytes: file.size,
      mimeType,
      originalFileName,
      sha256: createHash('sha256').update(file.buffer).digest('hex'),
    };
  }
}
