/**
 * Lectura determinista de la escala salarial del profesor contratado cuando el
 * PDF llega aplanado: el texto conserva el orden de las celdas
 * («Modalidad / Forma Nivel / Ciclo Jornada laboral Remuneración mensual S/
 * Educación Básica Regular - EBR Inicial 30 3 500,70 …») pero pierde las líneas
 * de la tabla. Esta lectura solo reconoce la estructura completa y devuelve
 * `null` ante cualquier ambigüedad; el llamador debe conservar entonces el
 * extracto literal. No completa cifras, no deduce importes y no reordena filas.
 */

export interface SalaryScheduleRow {
  /** Importe tal como figura en la fuente, con prefijo «S/». */
  amount: string;
  /** Jornada en horas; la fuente la escribe junto al nivel. */
  hours: number;
  /** Nivel o ciclo de la fila («Inicial», «Inicial / Intermedio»…). */
  level: string;
  /** Modalidad o forma vigente para la fila. */
  modality: string;
}

export interface SalarySchedule {
  rows: SalaryScheduleRow[];
  /** Texto que sigue a la última fila leída, para conservar sus condiciones. */
  remaining: string;
}

const TABLE_HEADER =
  /Modalidad\s*\/\s*Forma\s+Nivel\s*\/\s*Ciclo\s+Jornada\s+laboral\s+Remuneraci[oó]n\s+mensual(?:\s+S\/)?/u;

const MODALITY =
  /^(Educaci[oó]n\s+B[áa]sica\s+Regular\s*[-–—]\s*EBR|Educaci[oó]n\s+B[áa]sica\s+Especial\s*[-–—]\s*EBE|Educaci[oó]n\s+B[áa]sica\s+Alternativa\s*[-–—]\s*EBA|Educaci[oó]n\s+T[ée]cnico\s+Productiva\s*[-–—]\s*ETP)/u;

/** «Inicial / Intermedio» y «Básico y Medio» antes que sus palabras sueltas. */
const LEVEL =
  /^(Inicial\s*\/\s*Intermedio|B[áa]sico\s+y\s+Medio|Inicial|Primaria|Secundaria|Avanzado)/u;

/** Horas de la jornada: el número va seguido de otro campo, nunca de un punto. */
const HOURS = /^(\d{1,2})(?=\s)/u;

/**
 * Importe con separador de miles o al menos tres dígitos enteros. Excluye los
 * numerales («2.2») y los números de artículo que siguen a la tabla.
 */
const AMOUNT =
  /^(?:S\/\s*)?(\d{1,3}(?:[ .,]\d{3})+(?:[.,]\d{1,2})?|\d{3,}(?:[.,]\d{1,2})?)/u;

/** Una fila reconocible que quedó sin leer invalida toda la tabla. */
const UNPARSED_ROW =
  /(?:Inicial|Primaria|Secundaria|Avanzado|B[áa]sico\s+y\s+Medio|Inicial\s*\/\s*Intermedio)\s+\d{1,2}\s+(?:S\/\s*)?(?:\d{1,3}(?:[ .,]\d{3})+(?:[.,]\d{1,2})?|\d{3,})/u;
/** Un nivel no catalogado (una o varias palabras, con o sin ciclo) deja la tabla incompleta. */
const UNKNOWN_ROW =
  /^\s*(?:[a-záéíóúñ]+\s+){0,3}\d{1,2}\s+(?:s\/\s*)?(?:\d{1,3}(?:[ .,]\d{3})+(?:[.,]\d{1,2})?|\d{3,})/iu;

const MAX_ROWS = 12;

function cleanLabel(value: string): string {
  return value
    .replace(/\s+/gu, ' ')
    .replace(/\s*[-–—]\s*/gu, ' – ')
    .trim();
}

function displayAmount(raw: string): string {
  const value = raw.replace(/^S\/\s*/u, '').trim();
  return `S/ ${value}`;
}

/**
 * Devuelve las filas de la escala solo si el texto contiene el encabezado
 * completo y todas las filas se leen de principio a fin sin residuos. Cualquier
 * corte intermedio (una fila que no se reconoce, una modalidad ausente, un
 * número fuera de la jornada) devuelve `null` para no publicar una tabla
 * incompleta.
 */
export function parseSalarySchedule(text: string): SalarySchedule | null {
  const normalized = text.replace(/\s+/gu, ' ').trim();
  const header = TABLE_HEADER.exec(normalized);
  if (!header) return null;

  let rest = normalized.slice(header.index + header[0].length).trimStart();
  let modality: string | null = null;
  let level: string | null = null;
  let hours: number | null = null;
  const rows: SalaryScheduleRow[] = [];

  while (rest) {
    const modalityMatch = MODALITY.exec(rest);
    if (modalityMatch) {
      modality = cleanLabel(modalityMatch[1]);
      level = null;
      hours = null;
      rest = rest.slice(modalityMatch[0].length).trimStart();
      continue;
    }

    const levelMatch = LEVEL.exec(rest);
    if (levelMatch) {
      if (!modality) return null;
      level = cleanLabel(levelMatch[1]);
      hours = null;
      rest = rest.slice(levelMatch[0].length).trimStart();
      continue;
    }

    if (level && hours === null) {
      const hoursMatch = HOURS.exec(rest);
      if (hoursMatch) {
        const value = Number(hoursMatch[1]);
        // La jornada de esta tabla es semanal y no de unas pocas horas. Un
        // valor menor evita leer «3 500,70» como «3 horas, S/ 500,70».
        if (!Number.isInteger(value) || value < 10 || value > 60) return null;
        hours = value;
        rest = rest.slice(hoursMatch[0].length).trimStart();
        continue;
      }
    }

    if (level && hours !== null) {
      const amountMatch = AMOUNT.exec(rest);
      if (amountMatch) {
        const rawAmount = amountMatch[0].trim();
        // «12 500,00» con la celda de jornada perdida se leería como 12 horas
        // y S/ 500,00. Sin el prefijo «S/» no hay forma de distinguirlo; se
        // prefiere el extracto literal a inventar una jornada.
        if (/^\d{3}[.,]\d{2}$/u.test(rawAmount) && hours >= 10) return null;
        rows.push({
          amount: displayAmount(rawAmount),
          hours,
          level,
          modality: modality ?? '',
        });
        level = null;
        hours = null;
        rest = rest.slice(amountMatch[0].length).trimStart();
        continue;
      }
    }

    break;
  }

  if (rows.length < 2 || rows.length > MAX_ROWS) return null;
  if (rows.some((row) => !row.modality || !row.level)) return null;
  // Una fila empezada y no terminada (un nivel sin jornada, una jornada sin
  // importe) invalida la tabla: no se publica un recorte.
  if (level !== null || hours !== null) return null;
  // Si en cualquier punto posterior aparece otra fila reconocible, la lectura
  // se detuvo antes de terminar y no se puede presentar como tabla íntegra.
  if (UNPARSED_ROW.test(rest)) return null;
  if (UNKNOWN_ROW.test(rest)) return null;

  return { remaining: rest, rows };
}
