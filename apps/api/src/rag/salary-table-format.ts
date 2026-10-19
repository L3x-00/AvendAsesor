/**
 * Algunos modelos responden una escala salarial como una lista de filas con
 * campos separados por «;» en lugar de una tabla Markdown, aunque la fuente sea
 * una tabla. Esta transformación determinista conserva todos los valores y
 * citas, pero devuelve la grilla que la web y la ficha de orientación saben
 * presentar.
 */

const FIELD_SEPARATOR = /\s*;\s*/u;
const FIELD_PATTERN = /^([^:;]{2,80}):\s*(.+)$/u;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/u;
const SALARY_COLUMN = /\b(?:remuneraci[oó]n|monto|sueldo|salario|haber)\b/iu;
const AMOUNT =
  /(?:s\/|\b\d{1,3}(?:[ .,]\d{3})+(?:[.,]\d{1,2})?\b|\b\d+[.,]\d{2}\b)/iu;
const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+(.+)$/u;
const STRUCTURED_SALARY_MARKER = '<!-- avend:structured-salary-table -->';

interface ParsedRow {
  fields: Map<string, string>;
}

function parseRow(line: string): ParsedRow | null {
  const bullet = BULLET.exec(line);
  const content = (bullet?.[1] ?? line).trim();
  if (!content) return null;
  const fields = new Map<string, string>();
  for (const segment of content.split(FIELD_SEPARATOR)) {
    const match = FIELD_PATTERN.exec(segment.trim());
    if (!match?.[1] || !match[2]) continue;
    fields.set(match[1].trim(), match[2].trim());
  }
  if (fields.size < 2) return null;
  return { fields };
}

function escapeCell(value: string): string {
  return value.replace(/\|/gu, '\\|').replace(/\s+/gu, ' ').trim();
}

/**
 * Convierte un bloque de viñetas «Campo: valor; Campo: valor» en una tabla
 * Markdown. Conserva las citas exactamente donde llegaron: una referencia de
 * bloque no demuestra por sí sola qué rango sustenta cada fila. Si el texto ya
 * tiene una tabla, o el bloque no parece una escala salarial, lo deja intacto.
 */
export function formatSalaryBulletsAsTable(answer: string): string {
  if (!answer.trim() || TABLE_SEPARATOR.test(answer)) return answer;

  const lines = answer.replace(/\r\n?/gu, '\n').split('\n');
  const output: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const first = parseRow(lines[index] ?? '');
    if (!first) {
      output.push(lines[index] ?? '');
      index += 1;
      continue;
    }

    const rows: ParsedRow[] = [];
    let cursor = index;
    while (cursor < lines.length) {
      if (!lines[cursor]?.trim()) {
        cursor += 1;
        continue;
      }
      const row = parseRow(lines[cursor] ?? '');
      if (!row) break;
      rows.push(row);
      cursor += 1;
    }

    const columns = [...new Set(rows.flatMap((row) => [...row.fields.keys()]))];
    const looksLikeSalary =
      columns.some((column) => SALARY_COLUMN.test(column)) &&
      rows.some((row) =>
        [...row.fields.values()].some((value) => AMOUNT.test(value)),
      );
    if (
      rows.length < 2 ||
      columns.length < 2 ||
      columns.length > 6 ||
      rows.length > 12 ||
      !looksLikeSalary
    ) {
      output.push(...lines.slice(index, cursor));
      index = cursor;
      continue;
    }

    output.push(
      `| ${columns.map(escapeCell).join(' | ')} |`,
      `| ${columns.map(() => '---').join(' | ')} |`,
      ...rows.map((row) => {
        const values = columns.map((column) =>
          escapeCell(row.fields.get(column) ?? '—'),
        );
        return `| ${values.join(' | ')} |`;
      }),
      STRUCTURED_SALARY_MARKER,
    );
    index = cursor;
  }

  return output.join('\n');
}
