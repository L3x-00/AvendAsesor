import { normalizeSpanishText } from './text-normalization';

/**
 * Normalización de la consulta para búsqueda y clasificación: expande
 * abreviaturas del ámbito («RM» → «resolución ministerial») y corrige errores
 * frecuentes que el vocabulario dinámico no cubre. El texto que se guarda en el
 * historial sigue siendo el que escribió la persona.
 */
const ABBREVIATIONS: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\brm\b/giu, replacement: 'resolución ministerial' },
  { pattern: /\brd\b/giu, replacement: 'resolución directoral' },
  { pattern: /\brv\b/giu, replacement: 'resolución viceministerial' },
  { pattern: /\brvm\b/giu, replacement: 'resolución viceministerial' },
  {
    pattern: /\brsg\b/giu,
    replacement: 'resolución de secretaría general',
  },
  { pattern: /\bds\b/giu, replacement: 'decreto supremo' },
  { pattern: /\bdl\b/giu, replacement: 'decreto legislativo' },
  { pattern: /\bmemo\b/giu, replacement: 'memorándum' },
];

/**
 * Errores frecuentes demostrados por la campaña real o por pruebas
 * explícitas. Se comparan sin tildes —la gente escribe «renumeración» con
 * tilde y sin ella— y siempre por palabra completa: una corrección difusa
 * cambiaría números de norma, años, siglas, nombres propios o términos
 * jurídicos válidos («numeración» no es «remuneración»). Las claves van sin
 * tilde porque la comparación usa `normalizeSpanishText`.
 */
const COMMON_WORD_TYPOS: ReadonlyMap<string, string> = new Map([
  ['renumeracion', 'remuneración'],
  ['renumeraciones', 'remuneraciones'],
  ['licensia', 'licencia'],
  ['licensias', 'licencias'],
  ['nombramineto', 'nombramiento'],
  ['nombraminetos', 'nombramientos'],
  ['ratificasion', 'ratificación'],
  ['ratificasiones', 'ratificaciones'],
  ['encargatur', 'encargatura'],
  ['encargaturaz', 'encargatura'],
  ['encargaturz', 'encargatura'],
]);

/** Conserva la capitalización original (inicio de oración o palabra en mayúsculas). */
function matchWordCase(original: string, replacement: string): string {
  const upper = original.toLocaleUpperCase('es');
  const lower = original.toLocaleLowerCase('es');
  if (original === upper && original !== lower) {
    return replacement.toLocaleUpperCase('es');
  }
  const first = original[0];
  if (first && first === upper[0] && first !== lower[0]) {
    return `${replacement.charAt(0).toLocaleUpperCase('es')}${replacement.slice(1)}`;
  }
  return replacement;
}

/** Solo corrige palabras completas del mapa: no toca cifras ni siglas. */
function correctCommonTypos(text: string): string {
  return text.replace(/[\p{L}]+/gu, (word) => {
    const replacement = COMMON_WORD_TYPOS.get(normalizeSpanishText(word));
    return replacement ? matchWordCase(word, replacement) : word;
  });
}

export function normalizeDomainQuery(question: string): string {
  let normalized = correctCommonTypos(question);
  for (const { pattern, replacement } of ABBREVIATIONS) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized;
}
