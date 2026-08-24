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

  it('uses bundled Spanish data and frees the local worker', async () => {
    mockRecognize.mockResolvedValue({ data: { text: ' Texto reconocido ' } });

    await expect(service.recognize(Buffer.from('image'))).resolves.toBe(
      'Texto reconocido',
    );
    expect(mockCreateWorker).toHaveBeenCalledTimes(1);
    expect(mockTerminate).toHaveBeenCalledTimes(1);
  });

  it('frees the worker when recognition fails', async () => {
    mockRecognize.mockRejectedValue(new Error('ocr failed'));

    await expect(service.recognize(Buffer.from('image'))).rejects.toThrow(
      'ocr failed',
    );
    expect(mockTerminate).toHaveBeenCalledTimes(1);
  });
});
