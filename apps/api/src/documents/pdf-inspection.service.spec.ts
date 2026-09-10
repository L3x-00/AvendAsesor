import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  PdfInspectionService,
  MAX_PDF_BYTES,
  MAX_PDF_PARSE_BYTES,
} from './pdf-inspection.service';

const mockDestroy = jest.fn();
const mockGetInfo = jest.fn();

jest.mock('pdf-parse', () => ({
  PDFParse: jest.fn().mockImplementation(() => ({
    destroy: mockDestroy,
    getInfo: mockGetInfo,
  })),
}));

const validPdfBase64 =
  'JVBERi0xLjQKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMiAwIFIKPj4KZW5kb2JqCjIgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9LaWRzIFszIDAgUl0KL0NvdW50IDEKPj4KZW5kb2JqCjMgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL1BhcmVudCAyIDAgUgovTWVkaWFCb3ggWzAgMCA2MTIgNzkyXQovUmVzb3VyY2VzIDw8Pj4KPj4KZW5kb2JqCnhyZWYKMCA0CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMTUgMDAwMDAgbiAKdHJhaWxlcgo8PAovU2l6ZSA0Ci9Sb290IDEgMCBSCj4+CnN0YXJ0eHJlZgoyMDUKJSVFT0Y=';

function createFile(
  buffer: Buffer,
  originalname = 'norma.pdf',
  mimetype = 'application/pdf',
): Express.Multer.File {
  return {
    buffer,
    destination: '',
    encoding: '7bit',
    fieldname: 'file',
    filename: originalname,
    mimetype,
    originalname,
    path: '',
    size: buffer.length,
    stream: undefined as never,
  };
}

describe('PdfInspectionService', () => {
  const service = new PdfInspectionService();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('parses a valid PDF by content, counts pages and hashes its bytes', async () => {
    const pdf = Buffer.from(validPdfBase64, 'base64');
    mockGetInfo.mockResolvedValue({ total: 1 });
    mockDestroy.mockResolvedValue(undefined);

    const result = await service.inspect(
      createFile(pdf, '..\\norma documental.pdf'),
    );

    expect(result).toEqual({
      extension: '.pdf',
      format: 'pdf',
      mimeType: 'application/pdf',
      originalFileName: 'norma documental.pdf',
      pageCount: 1,
      sha256: createHash('sha256').update(pdf).digest('hex'),
      sizeBytes: pdf.length,
    });
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });

  it('rejects absent, empty, oversized, mismatched and unsupported content', async () => {
    await expect(service.inspect(undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.inspect(createFile(Buffer.alloc(0)))).rejects.toThrow(
      'non-empty document',
    );
    await expect(
      service.inspect(createFile(Buffer.alloc(MAX_PDF_BYTES + 1, 0x61))),
    ).rejects.toThrow('50 MiB');
    await expect(
      service.inspect(createFile(Buffer.from('not a PDF'))),
    ).rejects.toThrow('not a valid PDF');
    await expect(
      service.inspect(createFile(Buffer.from('<xml/>'), 'archivo.xml')),
    ).rejects.toThrow('Only .pdf');
  });

  it('accepts Word and Markdown by content and derives their MIME', async () => {
    const docx = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from('rest-of-zip'),
    ]);
    await expect(
      service.inspect(
        createFile(docx, 'plan.docx', 'application/octet-stream'),
      ),
    ).resolves.toMatchObject({
      extension: '.docx',
      format: 'docx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      pageCount: 1,
    });

    const doc = Buffer.concat([
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      Buffer.from('rest-of-ole'),
    ]);
    await expect(
      service.inspect(createFile(doc, 'oficio.doc')),
    ).resolves.toMatchObject({
      format: 'doc',
      mimeType: 'application/msword',
      pageCount: 1,
    });

    const md = Buffer.from('# Título\nContenido del documento');
    await expect(
      service.inspect(createFile(md, 'nota.md')),
    ).resolves.toMatchObject({
      format: 'md',
      mimeType: 'text/markdown',
      pageCount: 1,
    });
  });

  it('rejects content that does not match the declared document format', async () => {
    await expect(
      service.inspect(createFile(Buffer.from('not a zip'), 'plan.docx')),
    ).rejects.toThrow('not a valid Word (.docx)');
    await expect(
      service.inspect(createFile(Buffer.from('not ole'), 'oficio.doc')),
    ).rejects.toThrow('not a valid Word (.doc)');
    await expect(
      service.inspect(createFile(Buffer.from([0x00, 0x01, 0x02]), 'nota.md')),
    ).rejects.toThrow('not a valid Markdown');
  });

  it('skips page parsing for a large PDF to stay within memory limits', async () => {
    // Cabecera PDF válida + relleno para superar el umbral de análisis.
    const largePdf = Buffer.concat([
      Buffer.from('%PDF-1.7\n'),
      Buffer.alloc(MAX_PDF_PARSE_BYTES, 0x20),
    ]);

    const result = await service.inspect(createFile(largePdf, 'grande.pdf'));

    expect(result).toMatchObject({
      format: 'pdf',
      mimeType: 'application/pdf',
      pageCount: 1,
      sizeBytes: largePdf.length,
    });
    // El PDF grande no se analiza: el parser nunca se invoca.
    expect(mockGetInfo).not.toHaveBeenCalled();
  });

  it('rejects malformed or over-page PDFs after parser inspection', async () => {
    const pdf = Buffer.from(validPdfBase64, 'base64');
    mockGetInfo.mockResolvedValueOnce({ total: 301 });
    mockDestroy.mockResolvedValue(undefined);

    await expect(service.inspect(createFile(pdf))).rejects.toThrow('300 pages');

    mockGetInfo.mockRejectedValueOnce(new Error('malformed PDF'));
    await expect(service.inspect(createFile(pdf))).rejects.toThrow(
      'could not be read or processed',
    );
  });
});
