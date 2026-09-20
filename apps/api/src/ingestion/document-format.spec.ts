import { detectIngestionFormat } from './document-format';

describe('detectIngestionFormat', () => {
  it('detecta un PDF por su cabecera %PDF', () => {
    expect(detectIngestionFormat(Buffer.from('%PDF-1.7\n...'))).toBe('pdf');
  });

  it('detecta un DOCX por la cabecera zip PK', () => {
    expect(
      detectIngestionFormat(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00])),
    ).toBe('docx');
  });

  it('detecta un DOC heredado por la cabecera OLE2', () => {
    expect(
      detectIngestionFormat(
        Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      ),
    ).toBe('doc');
  });

  it('trata el texto plano como markdown', () => {
    expect(detectIngestionFormat(Buffer.from('# Título\n\nContenido.'))).toBe(
      'md',
    );
  });
});
