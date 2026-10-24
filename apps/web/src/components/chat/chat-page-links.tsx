import type { ReactNode } from "react";
import type { ChatSource } from "@/lib/chat-api/types";

/** «Página 17 de 41», «Páginas 10-12 de 20» o «Página 3». */
const PAGE_REFERENCE =
  /\b(Páginas?)\s+(\d{1,4})(?:\s*[-–]\s*(\d{1,4}))?(?:\s+de\s+(\d{1,4}))?\b/giu;

function sourceForRank(
  sources: readonly ChatSource[],
  rank: number | undefined,
): ChatSource | undefined {
  if (rank !== undefined) {
    const exact = sources.find((source) => source.rank === rank);
    if (exact) return exact;
  }
  // Sin una cita concreta solo se enlaza si la respuesta tiene una única
  // fuente; con varias, atribuir la página a una de ellas sería adivinar.
  return sources.length === 1 ? sources[0] : undefined;
}

/**
 * Convierte una referencia de página escrita en la respuesta («Página 17 de
 * 41») en un enlace a esa página del documento citado. La fuente sale de la
 * cita [n] de la misma frase o de la fuente única consolidada; si no se puede
 * identificar, el texto queda intacto. El enlace abre el visor en la página
 * indicada, igual que el botón «Ver» de Referencias.
 */
export function linkPageReferences(
  text: string,
  sources: readonly ChatSource[],
  preferredRank: number | undefined,
  keyPrefix: string,
): ReactNode[] {
  const source = sourceForRank(sources, preferredRank);
  if (!source) return [text];
  // El visor abre la página en PDF; en Word u otros formatos no hay página.
  if (source.mimeType && source.mimeType !== "application/pdf") return [text];

  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(PAGE_REFERENCE)) {
    const [reference, label, startRaw, endRaw, totalRaw] = match;
    const start = Number(startRaw);
    const end = endRaw ? Number(endRaw) : start;
    const declaredTotal = totalRaw ? Number(totalRaw) : undefined;
    if (
      !label ||
      !Number.isInteger(start) ||
      start < 1 ||
      !Number.isInteger(end) ||
      end < start ||
      (declaredTotal !== undefined &&
        (!Number.isInteger(declaredTotal) ||
          start > declaredTotal ||
          end > declaredTotal))
    ) {
      continue;
    }

    // La página impresa del documento no siempre coincide con la página física
    // del PDF (el fragmento puede empezar en la 22 aunque el pie diga 17). Si
    // la referencia cae dentro del fragmento se usa esa página; si no, la
    // página donde está el fragmento, que es la que abrirá el contenido.
    const targetPage =
      start >= source.pageStart && start <= source.pageEnd
        ? start
        : source.pageStart;
    if (source.pdfPageCount && targetPage > source.pdfPageCount) continue;
    const targetNote =
      targetPage === start ? "" : ` (página ${targetPage} del PDF)`;

    const index = match.index ?? 0;
    if (index > cursor) parts.push(text.slice(cursor, index));
    parts.push(
      <a
        aria-label={`Abrir ${reference} de la fuente ${source.rank}: ${source.documentTitle}${targetNote} (se abre en una pestaña nueva)`}
        className="avend-chat-page-link"
        href={`/api/chat/sources/${encodeURIComponent(source.id)}/download?pagina=${targetPage}`}
        key={`${keyPrefix}-${index}`}
        rel="noopener noreferrer"
        target="_blank"
      >
        {reference}
      </a>,
    );
    cursor = index + reference.length;
  }

  if (cursor === 0) return [text];
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}
