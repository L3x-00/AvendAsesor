const mockDestroy = jest.fn();
const mockGetScreenshot = jest.fn();
const mockGetText = jest.fn();
const mockGetInfo = jest.fn();

jest.mock('pdf-parse', () => ({
  PDFParse: jest.fn().mockImplementation(() => ({
    destroy: mockDestroy,
    getScreenshot: mockGetScreenshot,
    getText: mockGetText,
    getInfo: mockGetInfo,
  })),
}));

import { PdfExtractionService } from './pdf-extraction.service';

describe('PdfExtractionService', () => {
  const service = new PdfExtractionService();

  beforeEach(() => {
    jest.clearAllMocks();
    mockDestroy.mockResolvedValue(undefined);
    mockGetInfo.mockResolvedValue({ total: 2 });
  });

  it('extracts text per page and always disposes parser resources', async () => {
    mockGetText.mockResolvedValue({
      total: 2,
      pages: [
        { num: 1, text: ' Primera página ' },
        { num: 2, text: 'Segunda página' },
      ],
    });

    await expect(service.extract(Buffer.from('%PDF'))).resolves.toEqual([
      { pageNumber: 1, text: 'Primera página' },
      { pageNumber: 2, text: 'Segunda página' },
    ]);
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });

  it.each([
    [1, 3],
    [1, 1],
    [2, 1],
    [1, 2],
  ])(
    'rejects missing, duplicate or unordered physical pages (%i, %i)',
    async (first, second) => {
      const total = first === 1 && second === 2 ? 3 : 2;
      mockGetInfo.mockResolvedValue({ total });
      mockGetText.mockResolvedValue({
        total,
        pages: [first, second].map((num) => ({
          num,
          text: 'Texto disponible',
        })),
      });
      await expect(service.extract(Buffer.from('%PDF'))).rejects.toThrow(
        'PDF_PAGE_COVERAGE_INCOMPLETE',
      );
      expect(mockDestroy).toHaveBeenCalledTimes(1);
    },
  );

  it('uses the file page count to verify sidecars without extracting text', async () => {
    mockGetInfo.mockResolvedValue({ total: 45 });
    await expect(service.countPages(Buffer.from('%PDF'))).resolves.toBe(45);
    expect(mockGetText).not.toHaveBeenCalled();
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });

  it('rejects a file over the physical page limit before reading text', async () => {
    mockGetInfo.mockResolvedValue({ total: 301 });
    await expect(service.extract(Buffer.from('%PDF'))).rejects.toThrow(
      'INGESTION_DOCUMENT_TOO_LARGE',
    );
    expect(mockGetText).not.toHaveBeenCalled();
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });

  it('renders only requested pages for local OCR and destroys parser on failure', async () => {
    mockGetScreenshot.mockResolvedValue({
      pages: [
        { data: Uint8Array.from([1, 2]), pageNumber: 2 },
        { data: Uint8Array.from([3, 4]), pageNumber: 4 },
      ],
    });

    await expect(service.render(Buffer.from('%PDF'), [2, 4])).resolves.toEqual(
      new Map([
        [2, Buffer.from([1, 2])],
        [4, Buffer.from([3, 4])],
      ]),
    );
    expect(mockGetScreenshot).toHaveBeenCalledWith(
      expect.objectContaining({ desiredWidth: 1240, partial: [2, 4] }),
    );

    mockGetText.mockRejectedValueOnce(new Error('invalid PDF'));
    await expect(service.extract(Buffer.from('%PDF'))).rejects.toThrow(
      'invalid PDF',
    );
    expect(mockDestroy).toHaveBeenCalledTimes(2);
  });

  it('returns a view of the PNG bytes without retaining bytes outside their slice', async () => {
    const backing = Uint8Array.from([99, 1, 2, 3, 88]);
    const data = backing.subarray(1, 4);
    mockGetScreenshot.mockResolvedValue({ pages: [{ data, pageNumber: 1 }] });
    const images = await service.render(Buffer.from('%PDF'), [1]);
    const image = images.get(1)!;
    expect([...image]).toEqual([1, 2, 3]);
    expect(image.buffer).toBe(backing.buffer);
    expect(image.byteOffset).toBe(data.byteOffset);
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });
});
