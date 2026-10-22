import type { RetrievedChunk } from './retrieval.gateway';

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];
/** «Setiembre» es la forma oficial que usan las normas peruanas. */
const MONTH_NAMES = [...MONTHS, 'setiembre'];
const MONTH_PATTERN = MONTH_NAMES.join('|');
const SEPTEMBER = '(?:septiembre|setiembre)';

export interface DateMention {
  day: number;
  month: number;
  year: number;
}

function monthNumber(name: string): number {
  const lower = name.toLocaleLowerCase('es');
  return lower === 'setiembre' ? 9 : MONTHS.indexOf(lower) + 1;
}

/**
 * Formas en que una respuesta escribe fechas completas, de la más específica a
 * la más simple: periodos «del 30 de diciembre de 2025 al 5 de enero de 2026»,
 * «del 30 de enero al 2 de febrero de 2026», «del 14 al 15 de enero de 2026»,
 * una fecha «13 de enero de 2026» o «13.01.2026».
 */
const DATE_FORMS: Array<{
  pattern: RegExp;
  /** Recibe la coincidencia completa y sus grupos, como `String.replace`. */
  read: (m: string[]) => DateMention[];
}> = [
  {
    pattern: new RegExp(
      `(?<!\\d)(\\d{1,2}) de (${MONTH_PATTERN}) (?:de|del) (\\d{4}) al (\\d{1,2}) de (${MONTH_PATTERN}) (?:de|del) (\\d{4})`,
      'giu',
    ),
    read: (m) => [
      { day: +m[1], month: monthNumber(m[2]), year: +m[3] },
      { day: +m[4], month: monthNumber(m[5]), year: +m[6] },
    ],
  },
  {
    pattern: new RegExp(
      `(?<!\\d)(\\d{1,2}) de (${MONTH_PATTERN}) al (\\d{1,2}) de (${MONTH_PATTERN}) (?:de|del) (\\d{4})`,
      'giu',
    ),
    read: (m) => [
      { day: +m[1], month: monthNumber(m[2]), year: +m[5] },
      { day: +m[3], month: monthNumber(m[4]), year: +m[5] },
    ],
  },
  {
    pattern: new RegExp(
      `(?<!\\d)(\\d{1,2}) (?:al|a|y) (\\d{1,2}) de (${MONTH_PATTERN}) (?:de|del) (\\d{4})`,
      'giu',
    ),
    read: (m) => [
      { day: +m[1], month: monthNumber(m[3]), year: +m[4] },
      { day: +m[2], month: monthNumber(m[3]), year: +m[4] },
    ],
  },
  {
    pattern: new RegExp(
      `(?<!\\d)(\\d{1,2}) de (${MONTH_PATTERN}) (?:de|del) (\\d{4})`,
      'giu',
    ),
    read: (m) => [{ day: +m[1], month: monthNumber(m[2]), year: +m[3] }],
  },
  {
    pattern: /(?<!\d)(\d{1,2})[./-](\d{1,2})[./-]((?:19|20)\d{2})(?!\d)/gu,
    read: (m) => [{ day: +m[1], month: +m[2], year: +m[3] }],
  },
];

/** Fechas completas del texto y el texto restante, sin ellas. */
export function extractDates(text: string): {
  dates: DateMention[];
  rest: string;
} {
  const dates: DateMention[] = [];
  let rest = text;
  for (const { pattern, read } of DATE_FORMS) {
    rest = rest.replace(pattern, (...args: string[]) => {
      // Los dos últimos argumentos son la posición y el texto completo.
      dates.push(...read(args.slice(0, -2)));
      return ' ';
    });
  }
  return { dates, rest };
}

const MONTH_NAME = new RegExp(`\\b(?:${MONTH_PATTERN})\\b`, 'iu');

/**
 * Quedan nombres de mes que no forman parte de una fecha completa («en enero»,
 * «13 de enero»): el mes no se puede comprobar contra la fuente.
 */
export function mentionsUnparsedMonth(rest: string): boolean {
  return MONTH_NAME.test(rest);
}

/**
 * La fuente trae la fecha completa (día, mes y año) como «13.01.2026» o como
 * «13 de enero de 2026». Comprobar solo los números sueltos aceptaba «5 de
 * marzo» porque «5» está dentro de «15.01.2026».
 */
export function sourceHasDate(
  source: RetrievedChunk,
  { day, month, year }: DateMention,
): boolean {
  const monthName = month === 9 ? SEPTEMBER : (MONTHS[month - 1] ?? '');
  const numeric = new RegExp(
    `(?<!\\d)0?${day}[./-]0?${month}[./-]${year}(?!\\d)`,
  );
  const spelled = new RegExp(
    `(?<!\\d)0?${day}\\s+(?:de\\s+)?${monthName}(?:\\s+(?:de|del))?\\s+${year}(?!\\d)`,
    'iu',
  );
  return numeric.test(source.chunkContent) || spelled.test(source.chunkContent);
}
