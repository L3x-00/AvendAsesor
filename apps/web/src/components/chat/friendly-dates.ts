const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/**
 * Fecha numérica «13.01.2026» o «13/01/2026». No se toca si forma parte de una
 * dirección o de un nombre de archivo («…/13.01.2026.pdf») ni de una cadena de
 * números más larga.
 */
const NUMERIC_DATE =
  /(?<![\w/.\-=?&#%@])(\d{1,2})[./](\d{1,2})[./]((?:19|20)\d{2})(?![\w/-]|\.\w)/gu;

const MONTH_NAMES = MONTHS.join("|");
const DATE_RANGE = new RegExp(
  `\\b([Dd]el) (\\d{1,2}) de (${MONTH_NAMES}) de (\\d{4}) al (\\d{1,2}) de (${MONTH_NAMES}) de (\\d{4})\\b`,
  "gu",
);

function isRealDate(day: number, month: number, year: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Escribe las fechas como se dicen en voz alta: «del 14 al 15 de enero de
 * 2026», «el 16 de enero de 2026». Las fuentes traen «14.01.2026» y el modelo
 * suele copiarlas así. Solo cambia la forma: el día, el mes y el año son los
 * mismos, y una fecha imposible (31.02.2026) queda como estaba.
 */
export function friendlyDates(text: string): string {
  const spelledOut = text.replace(
    NUMERIC_DATE,
    (match, dayText: string, monthText: string, yearText: string) => {
      const day = Number(dayText);
      const month = Number(monthText);
      const year = Number(yearText);
      return isRealDate(day, month, year)
        ? `${day} de ${MONTHS[month - 1]} de ${year}`
        : match;
    },
  );

  return spelledOut.replace(
    DATE_RANGE,
    (
      match,
      article: string,
      fromDay: string,
      fromMonth: string,
      fromYear: string,
      toDay: string,
      toMonth: string,
      toYear: string,
    ) => {
      if (fromYear !== toYear) return match;
      return fromMonth === toMonth
        ? `${article} ${fromDay} al ${toDay} de ${toMonth} de ${toYear}`
        : `${article} ${fromDay} de ${fromMonth} al ${toDay} de ${toMonth} de ${toYear}`;
    },
  );
}
