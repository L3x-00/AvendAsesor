import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PdfInspectionService, MAX_PDF_BYTES } from './pdf-inspection.service';

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
): Express.Multer.File {
  return {
    buffer,
    destination: '',
    encoding: '7bit',
    fieldname: 'file',
    filename: originalname,
    mimetype: 'text/plain',
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
      originalFileName: 'norma documental.pdf',
      pageCount: 1,
      sha256: createHash('sha256').update(pdf).digest('hex'),
      sizeBytes: pdf.length,
    });
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });

  it('rejects absent, empty, oversized and non-PDF upload content', async () => {
    await expect(service.inspect(undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.inspect(createFile(Buffer.alloc(0)))).rejects.toThrow(
      'non-empty PDF',
    );
    await expect(
      service.inspect(createFile(Buffer.alloc(MAX_PDF_BYTES + 1, 0x61))),
    ).rejects.toThrow('20 MiB');
    await expect(
      service.inspect(createFile(Buffer.from('not a PDF'))),
    ).rejects.toThrow('not a valid PDF');
  });

  it('rejects malformed or over-page PDFs after parser inspection', async () => {
    const pdf = Buffer.from(validPdfBase64, 'base64');
    mockGetInfo.mockResolvedValueOnce({ total: 301 });
    mockDestroy.mockResolvedValue(undefined);

    await expect(service.inspect(createFile(pdf))).rejects.toThrow('300 pages');

    mockGetInfo.mockRejectedValueOnce(new Error('malformed PDF'));
    await expect(service.inspect(createFile(pdf))).rejects.toThrow(
      'not a valid PDF',
    );
  });
});
