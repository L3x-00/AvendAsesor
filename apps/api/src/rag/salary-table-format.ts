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

interface ParsedRow {
  fields: Map<string, string>;
  raw: string;
}

function parseRow(line: string): ParsedRow | null {
  const bullet = BULLET.exec(line);
  if (!bullet?.[1]) return null;
  const fields = new Map<string, string>();
  for (const segment of bullet[1].split(FIELD_SEPARATOR)) {
    const match = FIELD_PATTERN.exec(segment.trim());
    if (!match?.[1] || !match[2]) continue;
    fields.set(match[1].trim(), match[2].trim());
  }
  if (fields.size < 2) return null;
  return { fields, raw: bullet[1].trim() };
}

function escapeCell(value: string): string {
  return value.replace(/\|/gu, '\\|').replace(/\s+/gu, ' ').trim();
}

/**
 * Convierte un bloque de viñetas «Campo: valor; Campo: valor» en una tabla
 * Markdown. Si el texto ya tiene una tabla, o el bloque no parece una escala
 * salarial, devuelve el texto intacto.
 */
export function formatSalaryBulletsAsTable(answer: string): string {
  if (!answer.trim() || TABLE_SEPARATOR.test(answer)) return answer;

  const lines = answer.replace(/\r\n?/gu, '\n').split('\n');
  const fallbackCitation = answer.match(/\[(\d+)\]/u)?.[0] ?? null;
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
      output.push(lines[index] ?? '');
      index += 1;
      continue;
    }

    output.push(
      `| ${columns.map(escapeCell).join(' | ')} |`,
      `| ${columns.map(() => '---').join(' | ')} |`,
      ...rows.map((row) => {
        const values = columns.map((column) =>
          escapeCell(row.fields.get(column) ?? '—'),
        );
        if (
          fallbackCitation &&
          !values.some((value) => /\[\d+\]/u.test(value))
        ) {
          values[values.length - 1] = `${values.at(-1)} ${fallbackCitation}`;
        }
        return `| ${values.join(' | ')} |`;
      }),
    );
    index = cursor;
  }

  return output.join('\n');
}
