/**
 * Tablas Markdown acotadas que puede emitir el RAG. No usamos un renderizador
 * Markdown general: solo se reconoce una tabla pequeña, con separador válido,
 * para que una barra en una oración nunca cambie la presentación del chat.
 */
export interface MarkdownTableBlock {
  endIndex: number;
  headers: string[];
  rows: string[][];
}

const MAX_TABLE_CELL_CHARS = 180;
const MAX_TABLE_COLUMNS = 4;
const MAX_TABLE_ROWS = 6;
const TABLE_SEPARATOR_CELL = /^:?-{3,}:?$/u;
const TABLE_CITATION = /\[\[?\s*(\d+)\s*\]\]?/gu;

function tableCells(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return null;

  const withoutOuterPipes = trimmed
    .replace(/^\|/u, "")
    .replace(/\|$/u, "");
  const cells = withoutOuterPipes.split("|").map((cell) => cell.trim());

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
 * Reconoce una tabla Markdown completa desde una línea. Las filas se limitan
 * para mantener la respuesta concisa y evitar que un contenido no previsto
 * convierta el chat en una grilla extensa.
 */
export function markdownTableAt(
  lines: readonly string[],
  startIndex: number,
): MarkdownTableBlock | null {
  const headers = tableCells(lines[startIndex] ?? "");
  const separator = tableCells(lines[startIndex + 1] ?? "");
  if (
    !headers ||
    !separator ||
    headers.some((header) => !header) ||
    separator.length !== headers.length ||
    !separator.every((cell) => TABLE_SEPARATOR_CELL.test(cell))
  ) {
    return null;
  }

  const rows: string[][] = [];
  let index = startIndex + 2;
  while (index < lines.length) {
    const row = tableCells(lines[index] ?? "");
    if (!row || row.length !== headers.length) break;
    if (rows.length === MAX_TABLE_ROWS) return null;
    rows.push(row);
    index += 1;
  }

  return rows.length ? { endIndex: index, headers, rows } : null;
}

/** Cada fila debe apuntar a una fuente que realmente acompaña al mensaje. */
export function tableRowsCiteKnownSources(
  table: MarkdownTableBlock,
  sourceRanks: readonly number[],
): boolean {
  const knownRanks = new Set(sourceRanks);
  return table.rows.every((row) =>
    [...row.join(" ").matchAll(TABLE_CITATION)].some((match) =>
      knownRanks.has(Number(match[1])),
    ),
  );
}

/** Versión tabulada para «Copiar respuesta», sin la fila Markdown de guiones. */
export function markdownTablesToPlainText(
  content: string,
  isSupported?: (table: MarkdownTableBlock) => boolean,
): string {
  const lines = content.split(/\r?\n/u);
  const plain: string[] = [];

  for (let index = 0; index < lines.length; ) {
    const table = markdownTableAt(lines, index);
    if (!table || (isSupported && !isSupported(table))) {
      plain.push(lines[index]);
      index += 1;
      continue;
    }

    plain.push(table.headers.join("\t"));
    plain.push(...table.rows.map((row) => row.join("\t")));
    index = table.endIndex;
  }

  return plain.join("\n");
}
