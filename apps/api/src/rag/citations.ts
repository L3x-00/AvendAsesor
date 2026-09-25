/**
 * Cita a las fuentes numeradas del prompt: [n], [[n]] o agrupada —[1, 2],
 * [1-3], [1 y 2]—. El modelo agrupa citas aunque el prompt pida [1][2]; leer
 * solo [n] cerraba como «sin evidencia» respuestas bien sustentadas.
 */
export const CITATION_GROUP =
  /\[\[?\s*(\d+(?:\s*(?:[,;–-]|y)\s*\d+)*)\s*\]\]?/gu;

/** Un rango absurdo ([1-2012]) no se expande. */
const MAX_RANGE = 20;

/** Números citados en un grupo ya capturado («1, 2», «1-3»). */
function groupIndexes(group: string): number[] {
  const indexes: number[] = [];
  for (const part of group.split(/\s*(?:[,;]|\by\b)\s*/u)) {
    const range = /^(\d+)\s*[–-]\s*(\d+)$/u.exec(part.trim());
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (to >= from && to - from <= MAX_RANGE) {
        for (let index = from; index <= to; index += 1) indexes.push(index);
      } else {
        indexes.push(from, to);
      }
      continue;
    }
    const value = Number(part.trim());
    if (Number.isInteger(value)) indexes.push(value);
  }
  return indexes;
}

/** Números de fuente citados en el texto, en orden de aparición. */
export function citedIndexes(text: string): number[] {
  return [...text.matchAll(CITATION_GROUP)].flatMap((match) =>
    groupIndexes(match[1]),
  );
}

/**
 * El texto cita al menos una fuente existente. Un año entre corchetes
 * ([2012]) o una fuente inventada ([7] con tres fuentes) no cuentan.
 */
export function citesAnySource(text: string, sourceCount: number): boolean {
  return citedIndexes(text).some((index) => index >= 1 && index <= sourceCount);
}

/** Texto sin sus citas (para medir la sustancia de una afirmación). */
export function withoutCitations(text: string): string {
  return text.replace(CITATION_GROUP, ' ');
}
