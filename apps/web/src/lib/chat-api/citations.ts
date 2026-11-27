/**
 * Citas del modelo en el texto de una respuesta. Este módulo es puro (sin
 * "use client" ni "server-only") porque la misma regla decide qué se ve en el
 * chat, qué se imprime en la ficha y qué se escribe en el DOCX/PDF: si las tres
 * copias divergen, el archivo y la pantalla dejan de mostrar lo mismo.
 */

/**
 * Cita del modelo: [n], [[n]] o agrupada ([1, 2], [1-3], [1 y 2]). Con el
 * grupo de captura sirve para partir el texto conservando las citas.
 */
export const CITATION_TOKEN =
  /(\[\[?\s*\d+(?:\s*(?:[,;–-]|y)\s*\d+)*\s*\]\]?)/u;
const CITATION_ONLY = new RegExp(`^${CITATION_TOKEN.source}$`, "u");
const MAX_CITATION_RANGE = 20;

/** Números de fuente de una cita («[1, 2]» → 1, 2; «[1-3]» → 1, 2, 3). */
export function citationRanks(citation: string): number[] {
  if (!CITATION_ONLY.test(citation)) return [];
  const ranks: number[] = [];
  const inner = citation.replace(/[[\]\s]/gu, "");
  for (const part of inner.split(/[,;]|y/u)) {
    const bounds = part.split(/[–-]/u).map(Number);
    const [from, to] = bounds;
    if (bounds.length === 1 && Number.isInteger(from)) {
      ranks.push(from);
      continue;
    }
    // Una fecha ([12-05-2024]) o un rango absurdo queda como texto literal.
    if (bounds.length !== 2 || to < from || to - from > MAX_CITATION_RANGE) {
      return [];
    }
    for (let rank = from!; rank <= to!; rank += 1) ranks.push(rank);
  }
  return ranks;
}

/** Números citados en un texto, en el orden en que aparecen y sin repetir. */
export function citedSourceRanks(content: string): number[] {
  return [
    ...new Set(
      content
        .split(CITATION_TOKEN)
        .filter((_, index) => index % 2 === 1)
        .flatMap(citationRanks),
    ),
  ];
}

/** Lo que basta para reconocer una fuente citada: número e identidad. */
export interface CitedSourceIdentity {
  documentVersionId?: string | null;
  id: string;
  rank: number;
}

/** La versión identifica un documento real; sin ella, el historial es ambiguo. */
export function sourceDocumentKey(source: CitedSourceIdentity): string {
  return source.documentVersionId
    ? `version:${source.documentVersionId}`
    : `source:${source.id}`;
}

/**
 * Fuente única de una respuesta. Si todas las citas del texto apuntan al mismo
 * documento, basta mostrarla una vez (bajo la tabla o al final) en lugar de
 * repetirla en cada párrafo, viñeta o fila. Devuelve la fuente de la primera
 * cita, la que enlaza con su fila en «Referencias».
 */
export function singleCitedSource<T extends CitedSourceIdentity>(
  content: string,
  sources: readonly T[],
): T | undefined {
  const ranks = citedSourceRanks(content);
  const cited = ranks
    .map((rank) => sources.find((source) => source.rank === rank))
    .filter((source): source is T => source !== undefined);
  if (cited.length !== ranks.length) return undefined;
  const [first] = cited;
  if (!first) return undefined;
  return cited.every(
    (source) => sourceDocumentKey(source) === sourceDocumentKey(first),
  )
    ? first
    : undefined;
}

/**
 * Texto sin las citas que ya se muestran una sola vez. Un corchete que no es
 * una cita válida (una fecha, un rango de años) se conserva: borrarlo sería
 * perder contenido del documento.
 */
export function withoutCitationTokens(text: string): string {
  return text
    .split(CITATION_TOKEN)
    .filter(
      (part, index) => index % 2 === 0 || citationRanks(part).length === 0,
    )
    .join("")
    .replace(/[ \t]+([.,;:])/gu, "$1")
    .replace(/[ \t]{2,}/gu, " ")
    .trim();
}
