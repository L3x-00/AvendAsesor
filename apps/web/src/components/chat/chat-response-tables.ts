/**
 * Tablas Markdown acotadas que puede emitir el RAG. No usamos un renderizador
 * Markdown general: solo se reconoce una tabla con separador válido, para que
 * una barra en una oración nunca cambie la presentación del chat.
 */
export type ColumnAlignment = "left" | "center" | "right";

export interface MarkdownTableBlock {
  /** Alineación escrita en el separador (`:---`, `:---:`, `---:`); null si no hay. */
  alignments: Array<ColumnAlignment | null>;
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
const READABLE_LIMITS: TableLimits = {
  cellChars: 1_000,
  columns: 12,
  rows: 60,
};
const TABLE_SEPARATOR_CELL = /^:?-{3,}:?$/u;
const TABLE_CITATION = /\[\[?\s*(\d+)\s*\]\]?/gu;
const STRUCTURED_FIELD_SEPARATOR = /\s*;\s*/u;
const STRUCTURED_FIELD = /^([^:;]{2,80}):\s*(.+)$/u;
const STRUCTURED_SALARY_COLUMN =
  /\b(?:remuneraci[oó]n|monto|sueldo|salario|haber)\b/iu;
const STRUCTURED_AMOUNT =
  /(?:s\/|\b\d{1,3}(?:[ .,]\d{3})+(?:[.,]\d{1,2})?\b|\b\d+[.,]\d{2}\b)/iu;
const STRUCTURED_BULLET = /^\s*(?:[-*•]|\d+[.)])\s+(.+)$/u;
export const STRUCTURED_SALARY_MARKER =
  "<!-- avend:structured-salary-table -->";

interface StructuredRow {
  fields: Map<string, string>;
}

function structuredRow(line: string): StructuredRow | null {
  const bullet = STRUCTURED_BULLET.exec(line);
  const content = (bullet?.[1] ?? line).trim();
  if (!content) return null;

  const fields = new Map<string, string>();
  for (const segment of content.split(STRUCTURED_FIELD_SEPARATOR)) {
    const match = STRUCTURED_FIELD.exec(segment.trim());
    if (!match?.[1] || !match[2]) continue;
    fields.set(match[1].trim(), match[2].trim());
  }
  return fields.size >= 2 ? { fields } : null;
}

function escapeStructuredCell(value: string): string {
  return value.replace(/\|/gu, "\\|").replace(/\s+/gu, " ").trim();
}

/**
 * Salvaguarda visual para respuestas salariales ya guardadas o transmitidas
 * como «Campo: valor; Campo: valor». La API aplica la misma normalización antes
 * de persistir; esta copia acotada evita que el chat, la ficha y sus descargas
 * vuelvan a mostrar viñetas cuando abren contenido anterior. Las citas no se
 * reasignan: permanecen en la fila o bloque donde las produjo el modelo.
 */
export function structuredSalaryRowsToMarkdown(answer: string): string {
  if (!answer.trim()) return answer;

  const lines = answer.replace(/\r\n?/gu, "\n").split("\n");
  const output: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const first = structuredRow(lines[index] ?? "");
    if (!first) {
      output.push(lines[index] ?? "");
      index += 1;
      continue;
    }

    const rows: StructuredRow[] = [];
    let cursor = index;
    while (cursor < lines.length) {
      if (!lines[cursor]?.trim()) {
        cursor += 1;
        continue;
      }
      const row = structuredRow(lines[cursor] ?? "");
      if (!row) break;
      rows.push(row);
      cursor += 1;
    }

    const columns = [...new Set(rows.flatMap((row) => [...row.fields.keys()]))];
    const looksLikeSalary =
      columns.some((column) => STRUCTURED_SALARY_COLUMN.test(column)) &&
      rows.some((row) =>
        [...row.fields.values()].some((value) => STRUCTURED_AMOUNT.test(value)),
      );
    if (
      rows.length < 2 ||
      columns.length < 2 ||
      columns.length > GRID_LIMITS.columns ||
      rows.length > GRID_LIMITS.rows ||
      !looksLikeSalary
    ) {
      output.push(...lines.slice(index, cursor));
      index = cursor;
      continue;
    }

    output.push(
      `| ${columns.map(escapeStructuredCell).join(" | ")} |`,
      `| ${columns.map(() => "---").join(" | ")} |`,
      ...rows.map((row) => {
        const values = columns.map((column) =>
          escapeStructuredCell(row.fields.get(column) ?? "—"),
        );
        return `| ${values.join(" | ")} |`;
      }),
      STRUCTURED_SALARY_MARKER,
    );
    index = cursor;
  }

  return output.join("\n");
}

function separatorAlignment(cell: string): ColumnAlignment | null {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  return left ? "left" : null;
}

function tableCells(line: string, limits: TableLimits): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return null;

  const withoutOuterPipes = trimmed.replace(/^\|/u, "").replace(/\|$/u, "");
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

  return rows.length
    ? {
        alignments: separator.map(separatorAlignment),
        endIndex: index,
        headers,
        rows,
      }
    : null;
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
  consolidatedSourceRank?: number,
): ClassifiedTable | null {
  const readable = parseTableAt(lines, startIndex, READABLE_LIMITS);
  if (!readable) return null;

  const grid = markdownTableAt(lines, startIndex);
  const fitsGrid = grid !== null && grid.endIndex === readable.endIndex;
  const isEvidenced =
    sourceRanks.length > 0 &&
    (tableRowsCiteKnownSources(readable, sourceRanks) ||
      singleRowTableHasAdjacentKnownCitation(lines, readable, sourceRanks) ||
      (consolidatedSourceRank !== undefined &&
        sourceRanks.includes(consolidatedSourceRank) &&
        lines[readable.endIndex]?.trim() === STRUCTURED_SALARY_MARKER));

  return { asGrid: fitsGrid && isEvidenced, table: readable };
}

/** Una celda que solo trae citas: «[2]», «[1] [2]», «[1, 2]». */
const CITATION_ONLY_CELL =
  /^(?:\[\[?\s*\d+(?:\s*(?:[,;–-]|y)\s*\d+)*\s*\]\]?\s*)+$/u;

/**
 * Columnas (sin contar la primera, que nombra la fila) que solo contienen
 * citas: la «Cita» que el modelo añade a cada fila.
 */
function citationColumns(table: MarkdownTableBlock): number[] {
  return table.headers
    .map((_, column) => column)
    .filter((column) => {
      if (column === 0) return false;
      const cells = table.rows.map((row) => (row[column] ?? "").trim());
      return (
        cells.some((cell) => CITATION_ONLY_CELL.test(cell)) &&
        cells.every(
          (cell) => isBlankCell(cell) || CITATION_ONLY_CELL.test(cell),
        )
      );
    });
}

/** `true` si alguna columna de la tabla solo trae citas. */
export function hasCitationColumn(table: MarkdownTableBlock): boolean {
  return citationColumns(table).length > 0;
}

/**
 * Quita las columnas que solo contienen citas. Se usa cuando la cita se muestra
 * una vez bajo la tabla y en «Copiar», donde las citas no se copian y la
 * columna quedaría vacía. Si no quedarían al menos dos columnas, la tabla se
 * deja intacta para no romper su estructura.
 */
export function withoutCitationColumns(
  table: MarkdownTableBlock,
): MarkdownTableBlock {
  const dropped = new Set(citationColumns(table));
  const keep = table.headers
    .map((_, column) => column)
    .filter((column) => !dropped.has(column));
  if (!dropped.size || keep.length < 2) return table;
  return {
    ...table,
    alignments: keep.map((column) => table.alignments[column] ?? null),
    headers: keep.map((column) => table.headers[column]),
    rows: table.rows.map((row) => keep.map((column) => row[column])),
  };
}

/** Una celda vacía o un guion solo indican «sin dato»: no aportan a la lectura. */
const EMPTY_CELL = /^[-–—]?$/u;

/** `true` si la celda no trae dato (vacía o solo un guion). */
export function isBlankCell(cell: string): boolean {
  return EMPTY_CELL.test(cell.trim());
}

/** Marcas que el chat interpreta (negrita, citas [n], [1, 2], [1-2]); no son texto. */
const CELL_MARKS = /\*\*|__|\s*\[\[?\s*\d+(?:\s*[,;–-]\s*\d+)*\s*\]\]?/gu;

/** Texto de una celda sin negrita ni citas, para repetirlo como etiqueta. */
function plainCellText(cell: string): string {
  return cell.replace(CELL_MARKS, "").trim();
}

export interface FirstColumnLabel {
  /** El texto viene del grupo de una fila anterior, no de la celda de esta fila. */
  inherited: boolean;
  /**
   * Texto de la celda. Si es heredado va sin negrita ni citas: la cita sustenta
   * la fila donde está escrita, y repetirla en otra la haría pasar por sustento.
   */
  label: string;
}

/**
 * Etiqueta de cada fila en su primera columna. Una primera celda VACÍA continúa
 * el grupo de la fila anterior (así escribe el modelo las celdas combinadas):
 * sin ella la fila no diría a qué grupo pertenece. Un guion no hereda: puede
 * significar «no aplica». Solo se hereda si la fila tiene otro dato; una fila
 * vacía no inventa contenido.
 */
export function firstColumnLabels(
  rows: readonly string[][],
): FirstColumnLabel[] {
  let group = "";
  return rows.map((row) => {
    const [first = "", ...rest] = row;
    if (first !== "") {
      if (!isBlankCell(first)) group = plainCellText(first);
      return { inherited: false, label: first };
    }
    const continuesGroup =
      group !== "" && rest.some((cell) => !isBlankCell(cell));
    return continuesGroup
      ? { inherited: true, label: group }
      : { inherited: false, label: first };
  });
}

/**
 * Lectura de una tabla que no se pinta como grilla: una línea por fila,
 * «Encabezado: valor». Las celdas vacías o con guion se omiten, la primera
 * celda vacía continúa el grupo anterior y las citas de cada celda se conservan.
 */
export function markdownTableRowsAsText(table: MarkdownTableBlock): string[] {
  const labels = firstColumnLabels(table.rows);
  return table.rows
    .map((row, rowIndex) => {
      const { inherited, label } = labels[rowIndex];
      const cells = inherited ? [label, ...row.slice(1)] : row;
      return cells
        .map((cell, column) =>
          isBlankCell(cell) ? null : `${table.headers[column]}: ${cell}`,
        )
        .filter((part): part is string => part !== null)
        .join("; ");
    })
    .filter(Boolean);
}

/**
 * Cifra o monto suelto, con su moneda y signo opcionales: «30», «3,300.60»,
 * «3 300,60», «1.200,50», «S/ 2 666,80», «S/ -100», «12 %». Los miles van en
 * grupos de tres dígitos, así que una fecha («15.03.2025»), un teléfono
 * («01 615 5800») o dos números juntos («30 40») no cuentan como cifra.
 */
const NUMERIC_CELL =
  /^(?:(?:S\/\.?|US\$|\$)\s*)?[+\-−]?\s?(?:\d{1,3}(?:[\s.,]\d{3})*(?:[.,]\d+)?|\d+(?:[.,]\d+)?)\s*%?$/u;

function isNumericColumn(rows: readonly string[][], column: number): boolean {
  let numbers = 0;
  for (const row of rows) {
    const cell = plainCellText(row[column] ?? "");
    if (isBlankCell(cell)) continue;
    if (!NUMERIC_CELL.test(cell)) return false;
    numbers += 1;
  }
  return numbers > 0;
}

/**
 * Alineación de cada columna. Gana la que el modelo escribió en el separador;
 * si no escribió ninguna, una columna de solo cifras o montos se alinea a la
 * derecha para comparar unidades y decimales de un vistazo. La primera columna
 * nombra la fila, así que no se infiere. `undefined` = alineación normal.
 */
export function columnAlignments(
  table: MarkdownTableBlock,
): Array<ColumnAlignment | undefined> {
  return table.headers.map(
    (_, column) =>
      table.alignments[column] ??
      (column > 0 && isNumericColumn(table.rows, column) ? "right" : undefined),
  );
}

/**
 * Versión para «Copiar respuesta», igual a lo que se lee en pantalla: la grilla
 * se copia tabulada, sin la fila Markdown de guiones, y la tabla que no es
 * grilla, una línea por fila.
 */
export function markdownTablesToPlainText(
  content: string,
  sourceRanks: readonly number[] = [],
  consolidatedSourceRank?: number,
): string {
  const lines = content.split(/\r?\n/u);
  const plain: string[] = [];

  for (let index = 0; index < lines.length;) {
    if (lines[index]?.trim() === STRUCTURED_SALARY_MARKER) {
      index += 1;
      continue;
    }
    const classified = classifyTableAt(
      lines,
      index,
      sourceRanks,
      consolidatedSourceRank,
    );
    if (!classified) {
      plain.push(lines[index]);
      index += 1;
      continue;
    }

    const { asGrid, table } = classified;
    // Las citas no se copian: una columna que solo las trae quedaría vacía.
    const copied = withoutCitationColumns(table);
    if (asGrid) {
      plain.push(copied.headers.join("\t"));
      plain.push(...copied.rows.map((row) => row.join("\t")));
    } else {
      plain.push(...markdownTableRowsAsText(copied));
    }
    index = table.endIndex;
  }

  return plain.join("\n");
}
