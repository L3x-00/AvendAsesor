import {
  assertDocxWithinMemoryLimits,
  detectIngestionFormat,
  inspectDocxXmlUncompressedBytes,
  isProbablyText,
  MAX_DOCX_XML_BYTES,
} from './document-format';

/** Registro de directorio central mínimo para una entrada del ZIP. */
function centralDirectoryRecord(
  name: string,
  uncompressedSize: number,
): Buffer {
  const nameBuffer = Buffer.from(name, 'latin1');
  const record = Buffer.alloc(46 + nameBuffer.length);
  record.writeUInt32LE(0x02014b50, 0); // firma PK\x01\x02
  record.writeUInt32LE(uncompressedSize >>> 0, 24); // tamaño descomprimido
  record.writeUInt16LE(nameBuffer.length, 28); // longitud del nombre
  nameBuffer.copy(record, 46);
  return record;
}

/** ZIP sintético: solo directorio central + EOCD (basta para el inspector). */
function zipWithEntries(
  entries: Array<{ name: string; uncompressedSize: number }>,
): Buffer {
  const records = entries.map((entry) =>
    centralDirectoryRecord(entry.name, entry.uncompressedSize),
  );
  const centralDirectory = Buffer.concat(records);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // firma PK\x05\x06
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(0, 16); // el directorio central empieza en el offset 0
  return Buffer.concat([centralDirectory, eocd]);
}

describe('detectIngestionFormat', () => {
  it('detecta un PDF por su cabecera %PDF', () => {
    expect(detectIngestionFormat(Buffer.from('%PDF-1.7\n...'))).toBe('pdf');
  });

  it('detecta un PDF con BOM UTF-8 antes de %PDF- (igual que la carga)', () => {
    const pdf = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from('%PDF-1.7\n...'),
    ]);
    expect(detectIngestionFormat(pdf)).toBe('pdf');
  });

  it('detecta un PDF con espacios/saltos iniciales antes de %PDF-', () => {
    expect(detectIngestionFormat(Buffer.from('\n\n%PDF-1.4\n...'))).toBe('pdf');
  });

  it('detecta un DOCX por la firma zip completa PK\\x03\\x04', () => {
    expect(
      detectIngestionFormat(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00])),
    ).toBe('docx');
  });

  it('trata como markdown un texto que empieza con "PK" (no es firma zip)', () => {
    expect(
      detectIngestionFormat(Buffer.from('PK-12 educación: estándares...')),
    ).toBe('md');
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

describe('isProbablyText', () => {
  it('acepta texto UTF-8 sin bytes nulos', () => {
    expect(isProbablyText(Buffer.from('# Título\n\nContenido.'))).toBe(true);
  });

  it('rechaza contenido con un byte NUL (binario)', () => {
    expect(isProbablyText(Buffer.from([0x54, 0x00, 0x65]))).toBe(false);
  });

  it('rechaza secuencias UTF-8 inválidas', () => {
    expect(isProbablyText(Buffer.from([0xff, 0xfe, 0xfd]))).toBe(false);
  });
});

describe('inspectDocxXmlUncompressedBytes', () => {
  it('suma el tamaño descomprimido de las entradas .xml', () => {
    const zip = zipWithEntries([
      { name: 'word/document.xml', uncompressedSize: 3_000 },
      { name: 'word/styles.xml', uncompressedSize: 1_000 },
      { name: 'word/media/image1.png', uncompressedSize: 9_000_000 },
    ]);
    expect(inspectDocxXmlUncompressedBytes(zip)).toBe(4_000);
  });

  it('devuelve null cuando el ZIP no es interpretable', () => {
    expect(inspectDocxXmlUncompressedBytes(Buffer.from('no es un zip'))).toBe(
      null,
    );
  });
});

describe('assertDocxWithinMemoryLimits', () => {
  it('rechaza un .docx cuyo XML descomprimido supera el tope (guarda de memoria)', () => {
    const bomb = zipWithEntries([
      { name: 'word/document.xml', uncompressedSize: MAX_DOCX_XML_BYTES + 1 },
    ]);
    expect(() => assertDocxWithinMemoryLimits(bomb)).toThrow(
      'INGESTION_DOCUMENT_TOO_LARGE',
    );
  });

  it('acepta un .docx con XML dentro del tope aunque tenga imágenes grandes', () => {
    const normal = zipWithEntries([
      { name: 'word/document.xml', uncompressedSize: 2_000_000 },
      { name: 'word/media/image1.png', uncompressedSize: 40_000_000 },
    ]);
    expect(() => assertDocxWithinMemoryLimits(normal)).not.toThrow();
  });

  it('no bloquea cuando el ZIP no es interpretable (deja intentar a mammoth)', () => {
    expect(() =>
      assertDocxWithinMemoryLimits(Buffer.from([0x50, 0x4b, 0x03, 0x04])),
    ).not.toThrow();
  });
});
