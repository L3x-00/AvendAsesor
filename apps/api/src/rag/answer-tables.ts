import { citesAnySource } from './citations';

/**
 * Control determinista de las tablas de la respuesta (CR-07, punto 4).
 *
 * El prompt exige una cita [n] en cada fila y la web solo pinta como tabla
 * cuando todas las filas citan una fuente entregada; una fila sin cita pierde el
 * formato y no puede presentarse como sustento. Este módulo cierra el lado del
 * servidor: la tabla con filas sin cita válida se señala para revisión humana
 * (`support_partial`) y deja su extracto en la cola de calidad.
 *
 * Los límites de forma (columnas, filas, tamaño de celda) se replican aquí para
 * no marcar como «tabla» un párrafo con barras que la interfaz nunca pintará
 * como grilla; se mantienen sincronizados con
 * `apps/web/src/components/chat/chat-response-tables.ts`.
 */

const MAX_TABLE_CELL_CHARS = 180;
const MAX_TABLE_COLUMNS = 4;
const MAX_TABLE_ROWS = 6;
const MAX_EXCERPT_CHARS = 200;
const TABLE_SEPARATOR_CELL = /^:?-{3,}:?$/u;

function tableCells(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return null;

  const withoutOuterPipes = trimmed.replace(/^\|/u, '').replace(/\|$/u, '');
  const cells = withoutOuterPipes.split('|').map((cell) => cell.trim());

  if (
    cells.length < 2 ||
    cells.length > MAX_TABLE_COLUMNS ||
    cells.some((cell) => cell.length > MAX_TABLE_CELL_CHARS)
  ) {
    return null;
  }
  return cells;
}

/**
 * Filas de tabla Markdown que no citan ninguna fuente entregada. Devuelve el
 * texto de cada fila (acotado) en orden de aparición; lista vacía si todas las
 * filas están sustentadas o si no hay ninguna tabla reconocible.
 */
export function unbackedTableRows(
  answer: string,
  sourceCount: number,
): string[] {
  if (sourceCount <= 0) return [];

  const lines = answer.split(/\r?\n/u);
  const unbacked: string[] = [];

  for (let index = 0; index + 1 < lines.length;) {
    const headers = tableCells(lines[index] ?? '');
    const separator = tableCells(lines[index + 1] ?? '');
    if (
      !headers ||
      !separator ||
      headers.some((header) => !header) ||
      separator.length !== headers.length ||
      !separator.every((cell) => TABLE_SEPARATOR_CELL.test(cell))
    ) {
      index += 1;
      continue;
    }

    let rowIndex = index + 2;
    let rowCount = 0;
    while (rowIndex < lines.length && rowCount < MAX_TABLE_ROWS) {
      const row = tableCells(lines[rowIndex] ?? '');
      if (!row || row.length !== headers.length) break;

      const text = row.join(' ').replace(/\s+/gu, ' ').trim();
      if (!citesAnySource(text, sourceCount)) {
        unbacked.push(text.slice(0, MAX_EXCERPT_CHARS));
      }
      rowCount += 1;
      rowIndex += 1;
    }
    index = rowIndex;
  }

  return unbacked;
}
