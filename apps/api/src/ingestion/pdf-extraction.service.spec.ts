const mockDestroy = jest.fn();
const mockGetScreenshot = jest.fn();
const mockGetText = jest.fn();

jest.mock('pdf-parse', () => ({
  PDFParse: jest.fn().mockImplementation(() => ({
    destroy: mockDestroy,
    getScreenshot: mockGetScreenshot,
    getText: mockGetText,
  })),
}));

import { PdfExtractionService } from './pdf-extraction.service';

describe('PdfExtractionService', () => {
  const service = new PdfExtractionService();

  beforeEach(() => {
    jest.clearAllMocks();
    mockDestroy.mockResolvedValue(undefined);
  });

  it('extracts text per page and always disposes parser resources', async () => {
    mockGetText.mockResolvedValue({
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
      expect.objectContaining({ partial: [2, 4], scale: 2 }),
    );

    mockGetText.mockRejectedValueOnce(new Error('invalid PDF'));
    await expect(service.extract(Buffer.from('%PDF'))).rejects.toThrow(
      'invalid PDF',
    );
    expect(mockDestroy).toHaveBeenCalledTimes(2);
  });
});
