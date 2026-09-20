const mockExtractRawText = jest.fn();

jest.mock('mammoth', () => ({ extractRawText: mockExtractRawText }));

import { DocxExtractionService } from './docx-extraction.service';

describe('DocxExtractionService', () => {
  const service = new DocxExtractionService();

  beforeEach(() => jest.clearAllMocks());

  it('extrae y recorta el texto plano del docx', async () => {
    mockExtractRawText.mockResolvedValue({
      value: '  Texto del documento.  ',
      messages: [],
    });

    await expect(service.extract(Buffer.from('docx'))).resolves.toBe(
      'Texto del documento.',
    );
    expect(mockExtractRawText).toHaveBeenCalledWith({
      buffer: Buffer.from('docx'),
    });
  });
});
