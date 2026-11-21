const mockExtractRawText = jest.fn();
const mockExtractDoc = jest.fn();

jest.mock('mammoth', () => ({ extractRawText: mockExtractRawText }));
jest.mock('word-extractor', () =>
  jest.fn().mockImplementation(() => ({ extract: mockExtractDoc })),
);

import { DocxExtractionService } from './docx-extraction.service';
import { MAX_DOCX_XML_BYTES, MAX_EXTRACTED_CHARS } from './document-format';

/** ZIP sintético (directorio central + EOCD) con una entrada .xml declarada. */
function docxWithXmlSize(uncompressedSize: number): Buffer {
  const nameBuffer = Buffer.from('word/document.xml', 'latin1');
  const record = Buffer.alloc(46 + nameBuffer.length);
  record.writeUInt32LE(0x02014b50, 0);
  record.writeUInt32LE(uncompressedSize >>> 0, 24);
  record.writeUInt16LE(nameBuffer.length, 28);
  nameBuffer.copy(record, 46);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(record.length, 12);
  eocd.writeUInt32LE(0, 16);
  return Buffer.concat([record, eocd]);
}

describe('DocxExtractionService', () => {
  const service = new DocxExtractionService();

  beforeEach(() => {
    jest.clearAllMocks();
    mockExtractDoc.mockResolvedValue({ getBody: () => 'Texto del .doc' });
  });

  it('rechaza un .doc grande antes de parsearlo', async () => {
    await expect(
      service.extractLegacy(Buffer.alloc(20 * 1024 * 1024 + 1)),
    ).rejects.toThrow('INGESTION_DOCUMENT_TOO_LARGE');
    expect(mockExtractDoc).not.toHaveBeenCalled();
  });

  it('extrae un .doc heredado y rechaza uno ilegible', async () => {
    await expect(
      service.extractLegacy(Buffer.from([0xd0, 0xcf, 0x11, 0xe0])),
    ).resolves.toBe('Texto del .doc');

    mockExtractDoc.mockRejectedValueOnce(new Error('OLE inválido'));
    await expect(
      service.extractLegacy(Buffer.from('no es un doc')),
    ).rejects.toThrow('INGESTION_DOC_UNREADABLE');
  });

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

  it('rechaza un docx cuyo XML descomprimido excede el tope, sin invocar a mammoth', async () => {
    const bomb = docxWithXmlSize(MAX_DOCX_XML_BYTES + 1);

    await expect(service.extract(bomb)).rejects.toThrow(
      'INGESTION_DOCUMENT_TOO_LARGE',
    );
    expect(mockExtractRawText).not.toHaveBeenCalled();
  });

  it('rechaza un texto extraído que supera el tope de caracteres', async () => {
    mockExtractRawText.mockResolvedValue({
      value: 'a'.repeat(MAX_EXTRACTED_CHARS + 1),
      messages: [],
    });

    await expect(service.extract(Buffer.from('docx'))).rejects.toThrow(
      'INGESTION_DOCUMENT_TOO_LARGE',
    );
  });
});
