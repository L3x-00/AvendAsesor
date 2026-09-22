export type IngestionFormat = 'pdf' | 'docx' | 'doc' | 'md';

/** Ventana inspeccionada para la cabecera del PDF, igual que la carga. */
const PDF_HEADER_WINDOW = 1_024;

/**
 * Tope del texto extraído (docx/md) que llega al troceo/embeddings. Un documento
 * educativo real no se acerca a esto (≈1500 páginas); acota casos patológicos y
 * evita que un archivo enorme sature la memoria del worker aguas abajo.
 */
export const MAX_EXTRACTED_CHARS = 5_000_000;

/**
 * Tope del XML descomprimido de un .docx. mammoth ignora las imágenes y solo
 * construye un DOM del XML (word/*.xml), cuyo pico de memoria es varias veces su
 * tamaño; 48 MiB de XML ya es un documento descomunal, muy por encima de
 * cualquier documento educativo, y mantiene el DOM lejos del límite de 512 MB de
 * Render Free. No cuenta las imágenes (van "stored", acotadas por el tope de
 * carga de 50 MiB), así que no rechaza documentos legítimos con muchas imágenes.
 */
export const MAX_DOCX_XML_BYTES = 48 * 1024 * 1024;

/**
 * Detecta el formato del archivo por bytes mágicos, ALINEADO con la validación
 * de carga (documents/pdf-inspection.service): el PDF puede llevar BOM o bytes
 * iniciales antes de `%PDF-` (se escanean los primeros 1024 bytes, igual que la
 * carga) y el DOCX exige la firma zip completa `PK\x03\x04`. El DOC heredado es
 * OLE2 y el resto se trata como markdown/texto. Se basa en el CONTENIDO porque el
 * job de ingesta no transporta el mime_type.
 *
 * Antes exigía `%PDF` en el offset 0 y aceptaba `PK` con solo 2 bytes: un PDF con
 * BOM pasaba la carga pero aquí caía a 'md' (indexando el binario como basura) y
 * un `.md` que empezara con "PK" se tomaba por 'docx'. Ahora ambos coinciden con
 * la carga.
 */
export function detectIngestionFormat(buffer: Buffer): IngestionFormat {
  if (hasPdfHeader(buffer)) return 'pdf';
  if (hasZipHeader(buffer)) return 'docx';
  if (hasOleHeader(buffer)) return 'doc';
  return 'md';
}

function hasPdfHeader(buffer: Buffer): boolean {
  return buffer
    .subarray(0, Math.min(buffer.length, PDF_HEADER_WINDOW))
    .includes('%PDF-');
}

/** DOCX (y todo OOXML) es un ZIP: empieza con la firma "PK\x03\x04". */
function hasZipHeader(buffer: Buffer): boolean {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  );
}

/** DOC heredado (OLE2 Compound File) empieza con "D0 CF 11 E0 A1 B1 1A E1". */
function hasOleHeader(buffer: Buffer): boolean {
  const signature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  return (
    buffer.length >= signature.length &&
    signature.every((byte, index) => buffer[index] === byte)
  );
}

/**
 * Un `.md` legítimo es texto: sin bytes nulos y decodificable como UTF-8. Sirve
 * de guarda fail-closed cuando el detector cae al caso markdown: un binario mal
 * clasificado NO debe decodificarse como texto y contaminar con basura el índice
 * evidence-only. Réplica de la comprobación de la carga.
 */
export function isProbablyText(buffer: Buffer): boolean {
  if (buffer.includes(0)) return false;
  return !buffer.toString('utf8').includes('�');
}

/**
 * Suma el tamaño DESCOMPRIMIDO de las entradas `.xml` de un .docx leyendo el
 * directorio central del ZIP, SIN descomprimir nada. Es la guarda anti "zip-bomb"
 * / OOM de mammoth: permite rechazar el documento antes de que mammoth
 * descomprima el XML y construya el DOM. Devuelve `null` si el ZIP no se puede
 * interpretar de forma fiable (zip64, truncado); en ese caso el llamador deja
 * intentar a mammoth (un ZIP malformado fallará allí de todos modos) y el tope de
 * texto extraído acota el resultado.
 */
export function inspectDocxXmlUncompressedBytes(buffer: Buffer): number | null {
  // Fin del directorio central (EOCD): firma PK\x05\x06. El comentario del ZIP
  // puede ocupar hasta 65535 bytes, así que se busca hacia atrás esa ventana.
  const EOCD_SIGNATURE = 0x06054b50;
  const CD_SIGNATURE = 0x02014b50;
  const minEocd = 22;
  if (buffer.length < minEocd) return null;

  const scanFrom = Math.max(0, buffer.length - (0xffff + minEocd));
  let eocd = -1;
  for (let offset = buffer.length - minEocd; offset >= scanFrom; offset--) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) {
      eocd = offset;
      break;
    }
  }
  if (eocd === -1) return null;

  const entries = buffer.readUInt16LE(eocd + 10);
  const cdOffset = buffer.readUInt32LE(eocd + 16);
  // 0xFFFFFFFF marca zip64: no se puede leer el tamaño real de forma barata.
  if (cdOffset === 0xffffffff || entries === 0xffff) return null;
  if (cdOffset < 0 || cdOffset >= buffer.length) return null;

  let cursor = cdOffset;
  let xmlBytes = 0;
  for (let index = 0; index < entries; index++) {
    if (cursor + 46 > buffer.length) return null;
    if (buffer.readUInt32LE(cursor) !== CD_SIGNATURE) return null;
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const nameStart = cursor + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > buffer.length) return null;
    // Un tamaño 0xFFFFFFFF vive en el registro extra zip64: no legible aquí.
    if (uncompressedSize === 0xffffffff) return null;
    const name = buffer.toString('latin1', nameStart, nameEnd);
    if (name.toLowerCase().endsWith('.xml')) {
      xmlBytes += uncompressedSize;
    }
    cursor = nameEnd + extraLength + commentLength;
  }
  return xmlBytes;
}

/**
 * Rechaza un .docx cuyo XML descomprimido excede el tope, ANTES de que mammoth lo
 * descomprima (guarda de memoria del worker de 512 MB). Si el ZIP no es legible
 * de forma fiable, no bloquea: deja que mammoth lo intente y el tope de texto
 * extraído acota el resultado.
 */
export function assertDocxWithinMemoryLimits(buffer: Buffer): void {
  const xmlBytes = inspectDocxXmlUncompressedBytes(buffer);
  if (xmlBytes !== null && xmlBytes > MAX_DOCX_XML_BYTES) {
    throw new Error('INGESTION_DOCUMENT_TOO_LARGE');
  }
}
