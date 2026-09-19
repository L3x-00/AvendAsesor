/**
 * Normaliza texto en español para emparejar contra léxicos de patrones:
 * minúsculas, sin tildes y espacios colapsados (el público 30+ suele omitir
 * tildes). Fuente ÚNICA compartida por el clasificador de intención del chat y
 * la detección de alcance de recuperación (evita que dos copias divergan).
 */
export function normalizeSpanishText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es')
    .replace(/\s+/g, ' ')
    .trim();
}
