export type IngestionFormat = 'pdf' | 'docx' | 'doc' | 'md';

/**
 * Detecta el formato del archivo por bytes mágicos, en línea con la validación
 * de carga: PDF (`%PDF`), DOCX (zip `PK`), DOC heredado (OLE2) y markdown/texto
 * como caso restante. Se basa en el CONTENIDO, no en la extensión de la ruta,
 * porque el job de ingesta no transporta el mime_type.
 */
export function detectIngestionFormat(buffer: Buffer): IngestionFormat {
  if (buffer.length >= 4 && buffer.toString('latin1', 0, 4) === '%PDF') {
    return 'pdf';
  }
  if (buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b) {
    return 'docx';
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0
  ) {
    return 'doc';
  }
  return 'md';
}
