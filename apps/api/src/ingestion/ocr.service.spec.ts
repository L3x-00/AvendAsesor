const mockRecognize = jest.fn();
const mockTerminate = jest.fn();
const mockCreateWorker = jest.fn();

jest.mock('tesseract.js', () => ({
  createWorker: mockCreateWorker,
}));

import { OcrService } from './ocr.service';

describe('OcrService', () => {
  const service = new OcrService();

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateWorker.mockResolvedValue({
      recognize: mockRecognize,
      terminate: mockTerminate,
    });
    mockTerminate.mockResolvedValue(undefined);
  });

  it('reuses a single worker for every page and frees it once', async () => {
    mockRecognize
      .mockResolvedValueOnce({ data: { text: ' Página uno ' } })
      .mockResolvedValueOnce({ data: { text: ' Página dos ' } });

    const results = await service.withWorker(async (recognize) => [
      await recognize(Buffer.from('image-1')),
      await recognize(Buffer.from('image-2')),
    ]);

    expect(results).toEqual(['Página uno', 'Página dos']);
    expect(mockCreateWorker).toHaveBeenCalledTimes(1);
    expect(mockRecognize).toHaveBeenCalledTimes(2);
    expect(mockTerminate).toHaveBeenCalledTimes(1);
  });

  it('frees the worker when recognition fails', async () => {
    mockRecognize.mockRejectedValue(new Error('ocr failed'));

    await expect(
      service.withWorker(async (recognize) => recognize(Buffer.from('image'))),
    ).rejects.toThrow('ocr failed');
    expect(mockTerminate).toHaveBeenCalledTimes(1);
  });
});
