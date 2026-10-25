"use client";

import Image from "next/image";
import { type ReactNode } from "react";
import { documentTypeLabel } from "@/lib/admin-api/document-taxonomy";
import type { ChatSource } from "@/lib/chat-api/types";
import styles from "./chat-sources.module.css";

interface ChatSourcesProps {
  /** Números [n] citados en el texto de la respuesta; si faltan, se listan todas. */
  citedRanks?: number[];
  /** Mensaje al que pertenecen: permite enlazar cada cita [n] con su fila. */
  messageId?: string;
  sources: ChatSource[];
}

/** La versión identifica un documento real; sin ella, el historial es ambiguo. */
function sourceDocumentKey(source: ChatSource): string {
  return source.documentVersionId
    ? `version:${source.documentVersionId}`
    : `source:${source.id}`;
}

function uniqueDocuments(sources: ChatSource[]): ChatSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    // La identidad de versión evita ocultar homónimos. En historiales antiguos
    // sin ese campo, cada cita queda visible en vez de deduplicar por metadatos.
    const key = sourceDocumentKey(source);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

interface ReferenceSourceGroup {
  /** Primer fragmento: conserva el número y enlace que ya veía la persona. */
  source: ChatSource;
  /** Todos los fragmentos de la misma versión documental. */
  sources: ChatSource[];
}

/**
 * Una misma versión puede aparecer varias veces cuando el RAG cita distintas
 * páginas. Se presenta una sola referencia, pero nunca se mezclan versiones
 * distintas ni historiales antiguos que carecen de esa identidad.
 */
export function groupReferenceSources(
  sources: readonly ChatSource[],
): ReferenceSourceGroup[] {
  const groups = new Map<string, ReferenceSourceGroup>();
  for (const source of sources) {
    const key = sourceDocumentKey(source);
    const group = groups.get(key);
    if (group) {
      group.sources.push(source);
    } else {
      groups.set(key, { source, sources: [source] });
    }
  }
  return [...groups.values()];
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

/**
 * Fuente única de una respuesta. Si todas las citas del texto apuntan al mismo
 * documento, basta mostrarla una vez (bajo la tabla o al final) en lugar de
 * repetirla en cada párrafo, viñeta o fila. Devuelve la fuente de la primera
 * cita, la que enlaza con su fila en «Referencias». Con citas a documentos
 * distintos, o sin citas conocidas, devuelve `undefined` y cada cita se queda
 * donde la escribió el modelo.
 */
export function singleCitedSource(
  content: string,
  sources: readonly ChatSource[],
): ChatSource | undefined {
  const ranks = citedSourceRanks(content);
  const cited = ranks
    .map((rank) => sources.find((source) => source.rank === rank))
    .filter((source): source is ChatSource => source !== undefined);
  if (cited.length !== ranks.length) return undefined;
  const [first] = cited;
  if (!first) return undefined;
  // Misma identidad que `uniqueDocuments`: en historiales sin versión cada
  // fuente cuenta como un documento distinto y no se agrupa.
  return cited.every(
    (source) => sourceDocumentKey(source) === sourceDocumentKey(first),
  )
    ? first
    : undefined;
}

function pageRange(source: ChatSource): string {
  return source.pageStart === source.pageEnd
    ? `${source.pageStart}`
    : `${source.pageStart}–${source.pageEnd}`;
}

function hasPdfPagination(source: ChatSource): boolean {
  // Las conversaciones antiguas no guardaban MIME y eran mayoritariamente PDF.
  return source.mimeType == null || source.mimeType === "application/pdf";
}

interface GroupedPageRange {
  end: number;
  start: number;
}

interface GroupedPages {
  pageCount?: number;
  ranges: GroupedPageRange[];
}

/** Páginas físicas únicas, en su orden natural dentro del PDF. */
function groupedPages(group: ReferenceSourceGroup): GroupedPages | undefined {
  if (!group.sources.every(hasPdfPagination)) return undefined;

  const ranges = new Map<string, GroupedPageRange>();
  for (const source of group.sources) {
    const key = `${source.pageStart}:${source.pageEnd}`;
    if (!ranges.has(key)) {
      ranges.set(key, {
        end: source.pageEnd,
        start: source.pageStart,
      });
    }
  }

  const sortedRanges = [...ranges.values()].sort(
    (left, right) => left.start - right.start || left.end - right.end,
  );
  const pageCounts = new Set(
    group.sources
      .map((source) => source.pdfPageCount)
      .filter((count): count is number => count != null),
  );
  return {
    pageCount: pageCounts.size === 1 ? [...pageCounts][0] : undefined,
    ranges: sortedRanges,
  };
}

function groupedPageLabel(pages: GroupedPages): string {
  const ranges = pages.ranges
    .map((range) =>
      range.start === range.end ? `${range.start}` : `${range.start}–${range.end}`,
    )
    .join(", ");
  return `${ranges}${pages.pageCount ? ` de ${pages.pageCount}` : ""}`;
}

function groupedLocationFallback(pages: GroupedPages): string {
  const isSinglePage =
    pages.ranges.length === 1 &&
    pages.ranges[0]?.start === pages.ranges[0]?.end;
  return `${isSinglePage ? "Página" : "Páginas"} ${groupedPageLabel(pages)} del PDF · Sin sección o artículo identificado`;
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

/**
 * Los PDF de El Peruano suelen repetir la cabecera de página como si fuera una
 * sección («7 NORMAS LEGALES · Domingo…»). No ayuda a localizar la afirmación
 * y, junto a un artículo o literal, aparenta una precisión que el fragmento no
 * ofrece. Las conversaciones históricas ya guardadas se corrigen al renderizar.
 */
const GENERIC_SECTION_TITLE =
  /\b(?:normas legales|el peruano|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/iu;
const DOCUMENT_NAME_AS_SECTION =
  /^\s*(?:ley|decreto|resoluci[oó]n|directiva|norma)\b.{0,180}\bn[.°º]/iu;

function locationSectionTitle(source: ChatSource): string | null {
  let title = source.sectionTitle?.replace(/\s+/gu, " ").trim();
  if (!title) return null;
  if (GENERIC_SECTION_TITLE.test(title)) return null;

  // El título completo de la norma no es una sección. Si existe una ubicación
  // jurídica concreta, se muestra esa referencia y se evita repetir el nombre
  // del documento en la columna de ubicación.
  if (
    (source.articleReference || source.numeralReference) &&
    DOCUMENT_NAME_AS_SECTION.test(title)
  ) {
    return null;
  }

  // Si el extractor identificó un subtítulo como «Artículo 3.-
  // Implementación…», la referencia jurídica ya aparece en su propia línea.
  // Se conserva solo el nombre del apartado, que es lo que permite ubicar el
  // pasaje sin repetir «Artículo 3» dos veces.
  const articleReference = source.articleReference
    ?.replace(/\s+/gu, " ")
    .trim();
  if (
    articleReference &&
    title
      .toLocaleLowerCase("es")
      .startsWith(articleReference.toLocaleLowerCase("es"))
  ) {
    title = title
      .slice(articleReference.length)
      .replace(/^[\s:–—-]+/u, "")
      .trim();
  }

  return title || null;
}

function structuredLocation(source: ChatSource): string | null {
  const sectionTitle = locationSectionTitle(source);
  const parts = [
    sectionTitle ? `Sección o subtítulo: ${sectionTitle}` : null,
    source.articleReference ? `Artículo: ${source.articleReference}` : null,
    source.numeralReference
      ? `Numeral o literal: ${source.numeralReference}`
      : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(" · ") : null;
}

function SourceLocation({ group }: { group: ReferenceSourceGroup }) {
  const { source } = group;
  const sectionTitle = locationSectionTitle(source);
  if (group.sources.length === 1) {
    return (
      <>
        {sectionTitle ? (
          <span className={styles.referenceLine}>
            <span>Sección o subtítulo:</span> {sectionTitle}
          </span>
        ) : null}
        {source.articleReference ? (
          <span className={styles.referenceLine}>
            <span>Artículo:</span> {source.articleReference}
          </span>
        ) : null}
        {source.numeralReference ? (
          <span className={styles.referenceLine}>
            <span>Numeral o literal:</span> {source.numeralReference}
          </span>
        ) : null}
        {!sectionTitle &&
        !source.articleReference &&
        !source.numeralReference ? (
          <span className={styles.referenceLine}>
            {hasPdfPagination(source)
              ? `${source.pageStart === source.pageEnd ? "Página" : "Páginas"} ${pageRange(source)} del PDF · Sin sección o artículo identificado`
              : "Fragmento del documento · Sin sección o artículo identificado"}
          </span>
        ) : null}
      </>
    );
  }

  const locations = [
    ...new Set(
      group.sources
        .map(structuredLocation)
        .filter((location): location is string => location != null),
    ),
  ];
  const hasUnspecifiedLocation = group.sources.some(
    (groupedSource) => structuredLocation(groupedSource) == null,
  );
  // Si ningún fragmento aporta una ubicación estructural, el único dato útil
  // para localizarlo son las mismas páginas ya consolidadas en «Pág.».
  const unspecifiedLocationPages =
    locations.length === 0 ? groupedPages(group) : undefined;

  return (
    <>
      {locations.map((location) => (
        <span className={styles.referenceLine} key={location}>
          {location}
        </span>
      ))}
      {hasUnspecifiedLocation ? (
        <span className={styles.referenceLine}>
          {unspecifiedLocationPages
            ? groupedLocationFallback(unspecifiedLocationPages)
            : "Sin sección o artículo identificado"}
        </span>
      ) : null}
    </>
  );
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
  const groups = groupReferenceSources(sources);

  return (
    <div className={styles.tableViewport}>
      <table className={styles.table}>
        <caption className={styles.caption}>{caption}</caption>
        <colgroup>
          <col className={styles.rankColumn} />
          <col className={styles.typeColumn} />
          <col className={styles.documentColumn} />
          <col className={styles.referenceColumn} />
          <col className={styles.pageColumn} />
          <col className={styles.statusColumn} />
          <col className={styles.actionColumn} />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Tipo</th>
            <th scope="col">Documento</th>
            <th scope="col">Ubicación</th>
            <th scope="col">Pág.</th>
            <th scope="col">Estado</th>
            <th scope="col">Ver</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => {
            const { source } = group;
            // Se abre en la página citada (los PDF se ven en el navegador).
            const downloadPath = `/api/chat/sources/${encodeURIComponent(source.id)}/download?pagina=${source.pageStart}`;
            const pages = groupedPages(group);

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
                  {messageId
                    ? group.sources.slice(1).map((groupedSource) => (
                        <span
                          className={styles.srOnly}
                          id={sourceAnchorId(messageId, groupedSource.rank)}
                          key={groupedSource.id}
                          tabIndex={-1}
                        >
                          Fuente {groupedSource.rank} incluida en esta referencia
                        </span>
                      ))
                    : null}
                </td>
                <td data-label="Tipo">
                  <span className={styles.documentType}>
                    {source.documentType
                      ? documentTypeLabel(source.documentType)
                      : "Documento"}
                  </span>
                  {source.resolutionNumber ? (
                    <span className={styles.documentMeta}>
                      {source.resolutionNumber}
                    </span>
                  ) : null}
                </td>
                <td data-label="Documento">
                  <span className={styles.documentTitle}>
                    {source.documentTitle}
                  </span>
                  <span className={styles.documentMeta}>
                    Proceso: {source.moduleName ?? "No especificado"}
                  </span>
                </td>
                <td data-label="Ubicación">
                  <SourceLocation group={group} />
                </td>
                <td data-label="Pág.">
                  {pages ? (
                    <>
                      <span className={styles.mobileCellLabel}>
                        {pages.ranges.length === 1 &&
                        pages.ranges[0]?.start === pages.ranges[0]?.end
                          ? "Página PDF: "
                          : "Páginas PDF: "}
                      </span>
                      <span
                        aria-label={
                          pages.ranges.length === 1 &&
                          pages.ranges[0]?.start === pages.ranges[0]?.end
                            ? "Página PDF"
                            : "Páginas PDF"
                        }
                      >
                        {groupedPageLabel(pages)}
                      </span>
                    </>
                  ) : (
                    <span>Fragmento interno · sin paginación PDF</span>
                  )}
                </td>
                <td data-label="Estado">
                  <span className={styles.situation}>
                    {situationLabel(source)}
                  </span>
                  <span className={styles.documentMeta}>
                    Versión {source.versionNumber}
                  </span>
                </td>
                <td data-label="Ver">
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

/**
 * Del documento más nuevo al más antiguo; sin año al final. El orden de
 * entrada es el de relevancia, y `sort` es estable, así que los documentos del
 * mismo año conservan ese orden.
 */
function newestSourcesFirst(sources: ChatSource[]): ChatSource[] {
  return [...sources].sort(
    (left, right) =>
      (right.issuanceYear ?? Number.NEGATIVE_INFINITY) -
        (left.issuanceYear ?? Number.NEGATIVE_INFINITY) || 0,
  );
}

/**
 * Cabecera de un bloque plegable secundario: icono, nombre, cuántos elementos
 * trae y una flecha que gira al abrir. Sigue siendo el `<summary>` nativo de un
 * `<details>`: teclado, foco y lector de pantalla no cambian.
 */
function FoldSummary({
  count,
  icon,
  label,
}: {
  count: number;
  icon: ReactNode;
  label: string;
}) {
  return (
    <summary aria-label={`${label} (${count})`} className={styles.foldToggle}>
      <span aria-hidden="true" className={styles.foldIcon}>
        {icon}
      </span>
      <span className={styles.foldLabel}>{label}</span>
      <span className={styles.foldCount}>{count}</span>
      <svg
        aria-hidden="true"
        className={styles.foldChevron}
        fill="none"
        viewBox="0 0 24 24"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </summary>
  );
}

/** Archivos visibles de la respuesta, separados de las citas y sin duplicados. */
export function ChatDownloads({ sources }: { sources: ChatSource[] }) {
  const documents = newestSourcesFirst(uniqueDocuments(sources));
  if (!documents.length) return null;

  return (
    <details className={`${styles.others} ${styles.downloads}`}>
      <FoldSummary
        count={documents.length}
        icon={
          <Image
            alt=""
            height={37}
            src="/microsoft-word.svg"
            unoptimized
            width={36}
          />
        }
        label="Documentos disponibles"
      />
      <section aria-label="Documentos disponibles para descargar">
        <h2 className="avend-visually-hidden">Documentos disponibles</h2>
        <p className={styles.downloadsDescription}>
          Descarga los archivos usados para preparar esta respuesta.
        </p>
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
                title="Descargar"
              >
                <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                  <path d="M12 3v12m0 0-4-4m4 4 4-4M5 20h14" />
                </svg>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </details>
  );
}

/** Muestra las fuentes citadas y conserva los archivos disponibles para descargar. */
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

  return (
    <section
      aria-label="Referencias verificables"
      className={`avend-chat-sources ${styles.disclosure}`}
    >
      <header className={styles.heading}>
        <div>
          <h2>Referencias</h2>
          <p className={styles.sourceHint}>
            {hasCitations
              ? "Toca [1], [2] para ver la fuente."
              : "Fuentes consultadas."}
          </p>
        </div>
      </header>
      <SourceTable
        caption="Fuentes documentales, ubicación y descarga"
        messageId={messageId}
        sources={primary}
      />
      <ChatDownloads sources={sources} />
    </section>
  );
}
