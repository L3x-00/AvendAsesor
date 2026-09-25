import type { ChatSource } from "@/lib/chat-api/types";
import styles from "./chat-sources.module.css";

interface ChatSourcesProps {
  /** Números [n] citados en el texto de la respuesta; si faltan, se listan todas. */
  citedRanks?: number[];
  /** Mensaje al que pertenecen: permite enlazar cada cita [n] con su fila. */
  messageId?: string;
  sources: ChatSource[];
}

/** Ancla estable de la fila n de las referencias de un mensaje. */
export function sourceAnchorId(messageId: string, rank: number): string {
  return `fuente-${messageId}-${rank}`;
}

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
    for (let rank = from; rank <= to; rank += 1) ranks.push(rank);
  }
  return ranks;
}

/** Números de fuente citados en el texto de una respuesta. */
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

function pageRange(source: ChatSource): string {
  return source.pageStart === source.pageEnd
    ? `${source.pageStart}`
    : `${source.pageStart}–${source.pageEnd}`;
}

function situationLabel(source: ChatSource): string {
  switch (source.documentSituation) {
    case "current":
      return "Vigente";
    case "replaced":
      return "Reemplazado / sin vigencia · Histórico";
    case "archived":
      return "Archivado · Antecedente histórico";
  }
}

function SourceTable({
  caption,
  messageId,
  sources,
}: {
  caption: string;
  messageId?: string;
  sources: ChatSource[];
}) {
  return (
    <div
      aria-label={caption}
      className={styles.tableViewport}
      role="region"
      tabIndex={0}
    >
      <table className={styles.table}>
        <caption className={styles.caption}>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Documento</th>
            <th scope="col">Referencia</th>
            <th scope="col">Página</th>
            <th scope="col">Versión</th>
            <th scope="col">Acción</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((source) => {
            // Se abre en la página citada (los PDF se ven en el navegador).
            const downloadPath = `/api/chat/sources/${encodeURIComponent(source.id)}/download?pagina=${source.pageStart}`;

            return (
              <tr
                id={
                  messageId ? sourceAnchorId(messageId, source.rank) : undefined
                }
                key={source.id}
                tabIndex={messageId ? -1 : undefined}
              >
                <td data-label="#">
                  <span className={styles.mobileCellLabel}>
                    Fuente número:{" "}
                  </span>
                  <span className={styles.rank}>{source.rank}</span>
                </td>
                <td data-label="Documento">
                  <strong className={styles.documentTitle}>
                    {source.documentTitle}
                  </strong>
                  <span className={styles.documentMeta}>
                    Proceso: {source.moduleName ?? "No especificado"}
                  </span>
                  <span className={styles.documentMeta}>
                    Situación: <strong>{situationLabel(source)}</strong>
                  </span>
                </td>
                <td data-label="Referencia">
                  <span className={styles.referenceLine}>
                    <strong>Sección:</strong>{" "}
                    {source.sectionTitle ?? "No especificada"}
                  </span>
                  <span className={styles.referenceLine}>
                    <strong>Artículo:</strong>{" "}
                    {source.articleReference ?? "No especificado"}
                  </span>
                  <span className={styles.referenceLine}>
                    <strong>Numeral:</strong>{" "}
                    {source.numeralReference ?? "No especificado"}
                  </span>
                </td>
                <td
                  data-label={
                    source.pageStart === source.pageEnd ? "Página" : "Páginas"
                  }
                >
                  <span className={styles.mobileCellLabel}>
                    {source.pageStart === source.pageEnd
                      ? "Página: "
                      : "Páginas: "}
                  </span>
                  {pageRange(source)}
                </td>
                <td data-label="Versión">
                  <span className={styles.mobileCellLabel}>Versión: </span>
                  {source.versionNumber}
                </td>
                <td data-label="Acción">
                  <a
                    aria-label={`Abrir fuente [${source.rank}]: ${source.documentTitle} (se abre en una pestaña nueva)`}
                    className={styles.sourceLink}
                    href={downloadPath}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <svg
                      aria-hidden="true"
                      className={styles.linkIcon}
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <path d="M14 4h6v6M20 4l-9 9" />
                      <path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />
                    </svg>
                    Ver documento
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Referencias de una respuesta (Hito 3, punto 8). Primero las fuentes que la
 * respuesta cita con [n] —las que sustentan lo afirmado—; los demás fragmentos
 * revisados quedan plegados para no presentarse como sustento.
 */
export function ChatSources({
  citedRanks,
  messageId,
  sources,
}: ChatSourcesProps) {
  const cited = citedRanks?.length
    ? sources.filter((source) => citedRanks.includes(source.rank))
    : [];
  const hasCitations = cited.length > 0;
  const primary = hasCitations ? cited : sources;
  const others = hasCitations
    ? sources.filter((source) => !citedRanks?.includes(source.rank))
    : [];

  return (
    <section
      aria-label="Referencias verificables"
      className="avend-chat-sources"
    >
      <header className={styles.heading}>
        <div>
          <h2>Referencias</h2>
          <p>
            {hasCitations
              ? "Documentos citados en la respuesta. Toca un número [n] del texto para ir a su fuente."
              : "Documentos consultados para esta respuesta."}
          </p>
        </div>
        <span className={styles.count}>
          {primary.length} {primary.length === 1 ? "fuente" : "fuentes"}
        </span>
      </header>

      <SourceTable
        caption="Fuentes documentales, ubicación y descarga"
        messageId={messageId}
        sources={primary}
      />

      {others.length ? (
        <details className={styles.others}>
          <summary>
            Otros fragmentos revisados, no citados en la respuesta (
            {others.length})
          </summary>
          <SourceTable
            caption="Fragmentos revisados no citados"
            messageId={messageId}
            sources={others}
          />
        </details>
      ) : null}
    </section>
  );
}
