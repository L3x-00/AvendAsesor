/**
 * Tablas Markdown acotadas que puede emitir el RAG. No usamos un renderizador
 * Markdown general: solo se reconoce una tabla con separador válido, para que
 * una barra en una oración nunca cambie la presentación del chat.
 */
export interface MarkdownTableBlock {
  endIndex: number;
  headers: string[];
  rows: string[][];
}

interface TableLimits {
  cellChars: number;
  columns: number;
  rows: number;
}

/*
 * El prompt pide de dos a cuatro columnas y seis filas, pero el modelo las
 * excede cuando la escala real las tiene (modalidad, nivel, jornada, monto y una
 * columna de cita). Una tabla rechazada por tamaño caía a párrafo y mostraba las
 * barras crudas en una sola línea, así que el tope de la grilla es más holgado
 * que el de la instrucción. La evidencia no se relaja: cada fila sigue
 * necesitando su cita para pintarse como tabla.
 */
const GRID_LIMITS: TableLimits = { cellChars: 180, columns: 6, rows: 12 };
/** Lo que aún se reconoce como tabla para leerla por filas si no cabe en la grilla. */
const READABLE_LIMITS: TableLimits = { cellChars: 1_000, columns: 12, rows: 60 };
const TABLE_SEPARATOR_CELL = /^:?-{3,}:?$/u;
const TABLE_CITATION = /\[\[?\s*(\d+)\s*\]\]?/gu;

function tableCells(line: string, limits: TableLimits): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return null;

  const withoutOuterPipes = trimmed
    .replace(/^\|/u, "")
    .replace(/\|$/u, "");
  const cells = withoutOuterPipes.split("|").map((cell) => cell.trim());

  if (
    cells.length < 2 ||
    cells.length > limits.columns ||
    cells.some((cell) => cell.length > limits.cellChars)
  ) {
    return null;
  }
  return cells;
}

function parseTableAt(
  lines: readonly string[],
  startIndex: number,
  limits: TableLimits,
): MarkdownTableBlock | null {
  const headers = tableCells(lines[startIndex] ?? "", limits);
  const separator = tableCells(lines[startIndex + 1] ?? "", limits);
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
    const row = tableCells(lines[index] ?? "", limits);
    if (!row || row.length !== headers.length) break;
    if (rows.length === limits.rows) return null;
    rows.push(row);
    index += 1;
  }

  return rows.length ? { endIndex: index, headers, rows } : null;
}

/**
 * Reconoce una tabla Markdown completa desde una línea, dentro de los topes de
 * la grilla. Las filas se limitan para mantener la respuesta concisa y evitar
 * que un contenido no previsto convierta el chat en una grilla extensa.
 */
export function markdownTableAt(
  lines: readonly string[],
  startIndex: number,
): MarkdownTableBlock | null {
  return parseTableAt(lines, startIndex, GRID_LIMITS);
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

/**
 * Recupera la presentación de una tabla de una sola fila cuando el modelo deja
 * su única cita en la frase explicativa que sigue a la tabla. Se admite únicamente
 * la primera línea no vacía posterior y una fuente que acompaña al mensaje:
 * una tabla de varias filas conserva la regla más estricta de una cita por fila.
 */
export function singleRowTableHasAdjacentKnownCitation(
  lines: readonly string[],
  table: MarkdownTableBlock,
  sourceRanks: readonly number[],
): boolean {
  if (table.rows.length !== 1) return false;

  const followingLine = lines
    .slice(table.endIndex)
    .find((candidate) => candidate.trim());
  if (!followingLine) return false;

  const knownRanks = new Set(sourceRanks);
  return [...followingLine.matchAll(TABLE_CITATION)].some((match) =>
    knownRanks.has(Number(match[1])),
  );
}

export interface ClassifiedTable {
  /** `true` si se pinta como grilla; `false` si solo se lee fila por fila. */
  asGrid: boolean;
  table: MarkdownTableBlock;
}

/**
 * Decide cómo se presenta la tabla que empieza en `startIndex`. Es la única
 * regla de la pantalla y de «Copiar respuesta», para que ambas coincidan.
 * Es grilla solo si cabe en los topes, no quedó truncada por una celda
 * demasiado larga y cada fila (o la única fila, por la frase contigua) cita una
 * fuente del mensaje. Cualquier otra tabla bien formada se lee por filas en vez
 * de mostrar las barras Markdown unidas en un párrafo.
 */
export function classifyTableAt(
  lines: readonly string[],
  startIndex: number,
  sourceRanks: readonly number[],
): ClassifiedTable | null {
  const readable = parseTableAt(lines, startIndex, READABLE_LIMITS);
  if (!readable) return null;

  const grid = markdownTableAt(lines, startIndex);
  const fitsGrid = grid !== null && grid.endIndex === readable.endIndex;
  const isEvidenced =
    sourceRanks.length > 0 &&
    (tableRowsCiteKnownSources(readable, sourceRanks) ||
      singleRowTableHasAdjacentKnownCitation(lines, readable, sourceRanks));

  return { asGrid: fitsGrid && isEvidenced, table: readable };
}

/** Una celda vacía o un guion solo indican «sin dato»: no aportan a la lectura. */
const EMPTY_CELL = /^[-–—]?$/u;

/**
 * Lectura de una tabla que no se pinta como grilla: una línea por fila,
 * «Encabezado: valor». Una primera celda vacía continúa el grupo de la fila
 * anterior (así escribe el modelo las celdas combinadas), porque sin ella la
 * línea no diría a qué grupo pertenece. Las demás celdas vacías o con guion se
 * omiten y las citas de cada celda se conservan.
 */
export function markdownTableRowsAsText(table: MarkdownTableBlock): string[] {
  let group = "";
  return table.rows
    .map((row) => {
      const [first = "", ...rest] = row;
      if (!EMPTY_CELL.test(first)) group = first;
      const continuesGroup =
        EMPTY_CELL.test(first) &&
        group !== "" &&
        rest.some((cell) => !EMPTY_CELL.test(cell));
      const cells = continuesGroup ? [group, ...rest] : row;
      return cells
        .map((cell, column) =>
          EMPTY_CELL.test(cell) ? null : `${table.headers[column]}: ${cell}`,
        )
        .filter((part): part is string => part !== null)
        .join("; ");
    })
    .filter(Boolean);
}

/**
 * Versión para «Copiar respuesta», igual a lo que se lee en pantalla: la grilla
 * se copia tabulada, sin la fila Markdown de guiones, y la tabla que no es
 * grilla, una línea por fila.
 */
export function markdownTablesToPlainText(
  content: string,
  sourceRanks: readonly number[] = [],
): string {
  const lines = content.split(/\r?\n/u);
  const plain: string[] = [];

  for (let index = 0; index < lines.length; ) {
    const classified = classifyTableAt(lines, index, sourceRanks);
    if (!classified) {
      plain.push(lines[index]);
      index += 1;
      continue;
    }

    const { asGrid, table } = classified;
    if (asGrid) {
      plain.push(table.headers.join("\t"));
      plain.push(...table.rows.map((row) => row.join("\t")));
    } else {
      plain.push(...markdownTableRowsAsText(table));
    }
    index = table.endIndex;
  }

  return plain.join("\n");
}
