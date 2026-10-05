import { documentTypeLabel } from "@/lib/admin-api/document-taxonomy";
import type { ChatSource } from "@/lib/chat-api/types";
import styles from "./chat-sources.module.css";

interface ChatSourcesProps {
  /** Números [n] citados en el texto de la respuesta; si faltan, se listan todas. */
  citedRanks?: number[];
  /** Mensaje al que pertenecen: permite enlazar cada cita [n] con su fila. */
  messageId?: string;
  /** Abiertas desde el inicio (p. ej. en la ficha de orientación imprimible). */
  defaultOpen?: boolean;
  sources: ChatSource[];
}

function uniqueDocuments(sources: ChatSource[]): ChatSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = [
      source.documentTitle,
      source.documentType ?? "",
      source.resolutionNumber ?? "",
      source.versionNumber,
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

const DOCUMENT_TYPE_ABBREVIATIONS: Record<string, string> = {
  DECRETO_LEGISLATIVO: "DL",
  DECRETO_SUPREMO: "DS",
  MEMORANDUM: "M",
  RESOLUCION_DIRECTORAL: "RD",
  RESOLUCION_MINISTERIAL: "RM",
  RESOLUCION_VICEMINISTERIAL: "RVM",
};

/** Abreviatura visible junto al número de la cita cuando la fuente la tiene. */
export function sourceCitationLabel(source: ChatSource): string {
  const abbreviation = source.documentType
    ? DOCUMENT_TYPE_ABBREVIATIONS[source.documentType]
    : undefined;
  return abbreviation ? `[${source.rank}] ${abbreviation}` : `[${source.rank}]`;
}

/** «Resolución Ministerial · RM-123-2024 · 2024» cuando hay datos. */
function normReference(source: ChatSource): string | null {
  const parts = [
    source.documentType
      ? `${documentTypeLabel(source.documentType)}${DOCUMENT_TYPE_ABBREVIATIONS[source.documentType] ? ` (${DOCUMENT_TYPE_ABBREVIATIONS[source.documentType]})` : ""}`
      : null,
    source.resolutionNumber,
    source.issuanceYear ? String(source.issuanceYear) : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(" · ") : null;
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
            <th scope="col">Página PDF</th>
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
                  {normReference(source) ? (
                    <span className={styles.documentMeta}>
                      Norma: {normReference(source)}
                    </span>
                  ) : null}
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
                    <strong>Numeral o literal:</strong>{" "}
                    {source.numeralReference ?? "No especificado"}
                  </span>
                </td>
                <td
                  data-label={
                    source.pageStart === source.pageEnd
                      ? "Página PDF"
                      : "Páginas PDF"
                  }
                >
                  <span className={styles.mobileCellLabel}>
                    {source.pageStart === source.pageEnd
                      ? "Página PDF: "
                      : "Páginas PDF: "}
                  </span>
                  {pageRange(source)}
                  {source.pdfPageCount
                    ? ` de ${source.pdfPageCount}`
                    : null}
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
                    title="Ver documento"
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
                    <span className={styles.srOnly}>Ver documento</span>
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

/** Archivos visibles de la respuesta, separados de las citas y sin duplicados. */
export function ChatDownloads({ sources }: { sources: ChatSource[] }) {
  const documents = uniqueDocuments(sources);
  if (!documents.length) return null;

  return (
    <section
      aria-label="Documentos disponibles para descargar"
      className={styles.downloads}
    >
      <div className={styles.downloadsHeading}>
        <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
          <path d="M7 3.75h7L18 7.7v12.55H7z" />
          <path d="M14 3.75V8h4M12.5 11v5m0 0-2-2m2 2 2-2" />
        </svg>
        <div>
          <h2>Documentos disponibles</h2>
          <p>Descarga los archivos usados para preparar esta respuesta.</p>
        </div>
      </div>
      <ul className={styles.downloadList}>
        {documents.map((source) => (
          <li key={source.id}>
            <span>
              <strong>{source.documentTitle}</strong>
              <small>
                {normReference(source) ?? `Versión ${source.versionNumber}`}
              </small>
            </span>
            <a
              aria-label={`Descargar ${source.documentTitle}`}
              href={`/api/chat/sources/${encodeURIComponent(source.id)}/download?descargar=1`}
              rel="noopener noreferrer"
              target="_blank"
            >
              <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                <path d="M12 3v12m0 0-4-4m4 4 4-4M5 20h14" />
              </svg>
              Descargar
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Referencias de una respuesta (Hito 3, punto 8). Primero las fuentes que la
 * respuesta cita con [n] —las que sustentan lo afirmado—; los demás fragmentos
 * revisados quedan plegados para no presentarse como sustento.
 */
export function ChatSources({
  citedRanks,
  defaultOpen = false,
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

  // Plegadas por defecto: la respuesta se lee primero y el sustento se abre
  // a pedido ("Ver referencias"), como en los asistentes de IA. Una cita [n]
  // del texto las abre sola y lleva a su fila.
  return (
    <details
      aria-label="Referencias verificables"
      className={`avend-chat-sources ${styles.disclosure}`}
      open={defaultOpen || undefined}
    >
      <summary className={styles.toggle}>
        <svg aria-hidden="true" className={styles.toggleIcon} fill="none" viewBox="0 0 24 24">
          <path d="M7 3.75h7L18 7.7v12.55H7z" />
          <path d="M14 3.75V8h4M10 12h5M10 15.5h5" />
        </svg>
        <span>Ver referencias</span>
        <span className={styles.count}>
          {primary.length} {primary.length === 1 ? "fuente" : "fuentes"}
        </span>
        <svg aria-hidden="true" className={styles.chevron} fill="none" viewBox="0 0 24 24">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <header className={styles.heading}>
        <div>
          <h2>Referencias</h2>
          <p>
            {hasCitations
              ? "Documentos citados en la respuesta. Toca un número [n] del texto para ir a su fuente."
              : "Documentos consultados para esta respuesta."}
          </p>
        </div>
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
    </details>
  );
}
