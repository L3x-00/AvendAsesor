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
  { pattern: /\bds\b/giu, replacement: 'decreto supremo' },
  { pattern: /\bdl\b/giu, replacement: 'decreto legislativo' },
  { pattern: /\bmemo\b/giu, replacement: 'memorándum' },
];

const COMMON_TYPOS: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\brenumeraciones\b/giu, replacement: 'remuneraciones' },
  { pattern: /\brenumeracion\b/giu, replacement: 'remuneración' },
  { pattern: /\blicensia(s)?\b/giu, replacement: 'licencia$1' },
  { pattern: /\bnombramineto(s)?\b/giu, replacement: 'nombramiento$1' },
  { pattern: /\bratificasiones\b/giu, replacement: 'ratificaciones' },
  { pattern: /\bratificasion\b/giu, replacement: 'ratificación' },
  { pattern: /\bencargatura?z?\b/giu, replacement: 'encargatura' },
];

export function normalizeDomainQuery(question: string): string {
  let normalized = question;
  for (const { pattern, replacement } of COMMON_TYPOS) {
    normalized = normalized.replace(pattern, replacement);
  }
  for (const { pattern, replacement } of ABBREVIATIONS) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized;
}
