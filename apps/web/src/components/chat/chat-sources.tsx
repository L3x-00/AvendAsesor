"use client";

import {
  type MouseEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
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
  /**
   * Hacia dónde se despliega la tabla: «up» la abre por encima del botón (chat,
   * que queda al pie de la respuesta) y «down» por debajo, como la ficha.
   */
  direction?: "down" | "up";
  sources: ChatSource[];
}

/** Duración de la transición del panel (ver `.disclosurePanel`) más un margen. */
const PANEL_MOTION_MS = 420;
/** Tope de fotogramas corregidos: cubre la transición hasta en pantallas de 240 Hz. */
const MAX_HOLD_FRAMES = 120;

function scrollContainerOf(element: HTMLElement): HTMLElement | null {
  for (
    let parent = element.parentElement;
    parent;
    parent = parent.parentElement
  ) {
    const { overflowY } = window.getComputedStyle(parent);
    if (
      /^(?:auto|scroll|overlay)$/u.test(overflowY) &&
      parent.scrollHeight > parent.clientHeight
    ) {
      return parent;
    }
  }
  return null;
}

/**
 * Con el panel por encima del botón, al crecer empuja el botón hacia abajo y la
 * tabla parecería abrirse hacia abajo. Durante la transición se corrige, en cada
 * fotograma, el desplazamiento de la página: el botón queda donde la persona lo
 * tocó y es la tabla la que se despliega hacia arriba. Devuelve la función que
 * detiene la corrección.
 */
export function holdPosition(
  element: HTMLElement,
  durationMs: number,
): () => void {
  const scroller = scrollContainerOf(element);
  const startTop = element.getBoundingClientRect().top;
  let startedAt: number | null = null;
  let frame = 0;
  let frames = 0;

  const step = (now: number) => {
    startedAt ??= now;
    frames += 1;
    const drift = element.getBoundingClientRect().top - startTop;
    if (Math.abs(drift) >= 0.5) {
      // `instant`: la página declara `scroll-behavior: smooth` y un desplazamiento
      // suave por fotograma iría siempre un paso por detrás del panel.
      if (scroller) {
        scroller.scrollTo({
          behavior: "instant",
          top: scroller.scrollTop + drift,
        });
      } else {
        window.scrollBy({ behavior: "instant", top: drift });
      }
    }
    if (frames < MAX_HOLD_FRAMES && now - startedAt < durationMs) {
      frame = window.requestAnimationFrame(step);
    }
  };

  frame = window.requestAnimationFrame(step);
  return () => window.cancelAnimationFrame(frame);
}

function uniqueDocuments(sources: ChatSource[]): ChatSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    // La identidad de versión evita ocultar homónimos. En historiales antiguos
    // sin ese campo, cada cita queda visible en vez de deduplicar por metadatos.
    const key = source.documentVersionId ?? source.id;
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
  const documentKey = (source: ChatSource) =>
    source.documentVersionId ?? source.id;
  return cited.every((source) => documentKey(source) === documentKey(first))
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
          {sources.map((source) => {
            // Se abre en la página citada (los PDF se ven en el navegador).
            const downloadPath = `/api/chat/sources/${encodeURIComponent(source.id)}/download?pagina=${source.pageStart}`;
            const sectionTitle = locationSectionTitle(source);

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
                <td data-label="Tipo">
                  <strong className={styles.documentType}>
                    {source.documentType
                      ? documentTypeLabel(source.documentType)
                      : "Documento"}
                  </strong>
                  {source.resolutionNumber ? (
                    <span className={styles.documentMeta}>
                      {source.resolutionNumber}
                    </span>
                  ) : null}
                </td>
                <td data-label="Documento">
                  <strong className={styles.documentTitle}>
                    {source.documentTitle}
                  </strong>
                  <span className={styles.documentMeta}>
                    Proceso: {source.moduleName ?? "No especificado"}
                  </span>
                </td>
                <td data-label="Ubicación">
                  {sectionTitle ? (
                    <span className={styles.referenceLine}>
                      <strong>Sección o subtítulo:</strong> {sectionTitle}
                    </span>
                  ) : null}
                  {source.articleReference ? (
                    <span className={styles.referenceLine}>
                      <strong>Artículo:</strong> {source.articleReference}
                    </span>
                  ) : null}
                  {source.numeralReference ? (
                    <span className={styles.referenceLine}>
                      <strong>Numeral o literal:</strong>{" "}
                      {source.numeralReference}
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
                </td>
                <td data-label="Pág.">
                  {hasPdfPagination(source) ? (
                    <>
                      <span className={styles.mobileCellLabel}>
                        {source.pageStart === source.pageEnd
                          ? "Página PDF: "
                          : "Páginas PDF: "}
                      </span>
                      <span
                        aria-label={
                          source.pageStart === source.pageEnd
                            ? "Página PDF"
                            : "Páginas PDF"
                        }
                      >
                        {pageRange(source)}
                        {source.pdfPageCount
                          ? ` de ${source.pdfPageCount}`
                          : null}
                      </span>
                    </>
                  ) : (
                    <span>Fragmento interno · sin paginación PDF</span>
                  )}
                </td>
                <td data-label="Estado">
                  <strong className={styles.situation}>
                    {situationLabel(source)}
                  </strong>
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

/** Archivos visibles de la respuesta, separados de las citas y sin duplicados. */
export function ChatDownloads({ sources }: { sources: ChatSource[] }) {
  const documents = newestSourcesFirst(uniqueDocuments(sources));
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
  direction = "down",
  messageId,
  sources,
}: ChatSourcesProps) {
  const contentId = useId();
  const toggleId = useId();
  const [isOpen, setIsOpen] = useState(defaultOpen);
  // Una cita [n] abre el panel por código: sin animación, para que el destino de
  // su desplazamiento ya sea el definitivo.
  const [instant, setInstant] = useState(false);
  const releaseHold = useRef<(() => void) | null>(null);
  useEffect(() => () => releaseHold.current?.(), []);

  function handleToggle(event: MouseEvent<HTMLButtonElement>) {
    const button = event.currentTarget;
    const opensFromCitation = button.hasAttribute("data-instant");
    button.removeAttribute("data-instant");
    releaseHold.current?.();
    releaseHold.current = null;
    setInstant(opensFromCitation);
    // Solo se ancla el botón cuando la persona lo toca: una cita [n] ya decide
    // hacia dónde se desplaza la vista.
    if (direction === "up" && !opensFromCitation) {
      releaseHold.current = holdPosition(button, PANEL_MOTION_MS);
    }
    setIsOpen((current) => !current);
  }

  const cited = citedRanks?.length
    ? sources.filter((source) => citedRanks.includes(source.rank))
    : [];
  const hasCitations = cited.length > 0;
  const primary = hasCitations ? cited : sources;
  const others = hasCitations
    ? sources.filter((source) => !citedRanks?.includes(source.rank))
    : [];
  const documents = uniqueDocuments(sources);

  // Plegadas por defecto: la respuesta se lee primero y el sustento se abre
  // a pedido ("Ver fuentes disponibles"), como en los asistentes de IA. Una cita [n]
  // del texto las abre sola y lleva a su fila. Con `direction="up"` el panel se
  // pinta por encima del botón (solo CSS): el orden del DOM sigue siendo botón →
  // panel, así el lector de pantalla y el teclado entran al panel tras activarlo.
  return (
    <section
      aria-label="Referencias verificables"
      className={`avend-chat-sources ${styles.disclosure}`}
      data-direction={direction}
      data-motion={instant ? "instant" : undefined}
      data-open={isOpen ? "true" : "false"}
      data-source-disclosure=""
    >
      <button
        aria-controls={contentId}
        aria-expanded={isOpen}
        className={styles.toggle}
        data-source-toggle=""
        id={toggleId}
        onClick={handleToggle}
        type="button"
      >
        <span aria-hidden="true" className={styles.folderIcon}>
          <span className={styles.folderBack} />
          <span className={styles.folderPaper} />
          <span className={styles.folderFront} />
        </span>
        <span className={styles.toggleCopy}>
          <strong>
            {isOpen ? "Ocultar fuentes" : "Ver fuentes disponibles"}
          </strong>
          <span>
            {primary.length}{" "}
            {primary.length === 1 ? "referencia" : "referencias"}
            {" · "}
            {documents.length}{" "}
            {documents.length === 1 ? "documento" : "documentos"}
          </span>
        </span>
        <svg
          aria-hidden="true"
          className={styles.chevron}
          fill="none"
          viewBox="0 0 24 24"
        >
          {/* Apunta hacia donde se mueve el panel; al abrirse gira 180°. */}
          <path d={direction === "up" ? "m6 15 6-6 6 6" : "m6 9 6 6 6-6"} />
        </svg>
      </button>

      <div
        aria-hidden={!isOpen}
        aria-labelledby={toggleId}
        className={styles.disclosurePanel}
        data-open={isOpen ? "true" : "false"}
        id={contentId}
        inert={!isOpen}
        role="region"
      >
        <div className={styles.disclosurePanelInner}>
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

          {others.length ? (
            <details className={styles.others}>
              <summary>Otros fragmentos revisados ({others.length})</summary>
              <SourceTable
                caption="Fragmentos revisados no citados"
                messageId={messageId}
                sources={others}
              />
            </details>
          ) : null}

          <ChatDownloads sources={sources} />
        </div>
      </div>
    </section>
  );
}
