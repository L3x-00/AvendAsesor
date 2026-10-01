"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { documentTypeLabel } from "@/lib/admin-api/document-taxonomy";
import { getDocumentTechnicalStatusContent } from "@/lib/admin-api/labels";
import {
  annexNumber,
  CONTENT_SECTION_CODES,
  CONTENT_SECTION_HINTS,
  CONTENT_SECTION_TITLES,
  currentLimaYear,
  documentContentSection,
  titleStartsWithAnnexNumber,
  type ContentSectionCode,
  type ContextualUploadDefaults,
} from "@/lib/admin-api/module-content";
import type {
  DocumentLibraryItem,
  DocumentSuggestions,
} from "@/lib/admin-api/types";
import {
  ContextualUploadDialog,
  type ContextualUploadResult,
} from "./contextual-upload-dialog";
import styles from "./contextual-upload-dialog.module.css";

/** Duración del parpadeo del documento nuevo (3 ciclos de 900 ms). */
const HIGHLIGHT_MS = 2800;
/** Si el documento no aparece tras la recarga, el resaltado se abandona. */
const HIGHLIGHT_GIVE_UP_MS = 10_000;

const emptySuggestions: DocumentSuggestions = {
  additionalDetails: [],
  specificDependencies: [],
};

function situationText(document: DocumentLibraryItem): string {
  if (document.situation === "current") return "Vigente";
  if (document.situation === "replaced") return "Reemplazado / sin vigencia";
  return "Archivado";
}

function sortedItems(
  code: ContentSectionCode | "OTROS",
  items: DocumentLibraryItem[],
): DocumentLibraryItem[] {
  if (code === "ANEXO") {
    return [...items].sort(
      (left, right) =>
        (annexNumber(left) ?? Number.POSITIVE_INFINITY) -
          (annexNumber(right) ?? Number.POSITIVE_INFINITY) ||
        (right.issuanceYear ?? 0) - (left.issuanceYear ?? 0) ||
        left.title.localeCompare(right.title, "es"),
    );
  }
  return [...items].sort(
    (left, right) =>
      (right.issuanceYear ?? 0) - (left.issuanceYear ?? 0) ||
      left.title.localeCompare(right.title, "es"),
  );
}

function typeText(document: DocumentLibraryItem): string {
  return document.documentType === "OTRO" && document.documentTypeOther?.trim()
    ? document.documentTypeOther.trim()
    : documentTypeLabel(document.documentType);
}

const quickActionClass =
  "inline-flex min-h-11 items-center rounded-md px-2 font-semibold text-avend-accent-strong underline";

function DocumentQuickActions({ document }: { document: DocumentLibraryItem }) {
  return (
    <p className="mt-1 flex flex-wrap gap-x-2 text-base">
      <Link className={quickActionClass} href={`/admin/documents/${document.id}`}>
        Ver y editar
      </Link>
      <Link
        className={quickActionClass}
        href={`/admin/documents/${document.id}#new-version`}
      >
        Nueva versión
      </Link>
      <Link
        className={quickActionClass}
        href={`/admin/documents/${document.id}#document-lifecycle`}
      >
        Archivar o desactivar
      </Link>
    </p>
  );
}

function DocumentLine({
  code,
  document,
  highlighted,
}: {
  code: ContentSectionCode | "OTROS";
  document: DocumentLibraryItem;
  highlighted: boolean;
}) {
  const number = code === "ANEXO" ? annexNumber(document) : null;
  const showNumber = number !== null && !titleStartsWithAnnexNumber(document.title);
  return (
    <li
      className={`rounded-md bg-avend-surface-muted p-3${
        highlighted ? ` ${styles.itemNew}` : ""
      }`}
      data-document-id={document.id}
    >
      <p className="text-base font-semibold">
        {showNumber ? `Anexo ${number}: ` : ""}
        {document.title}
      </p>
      <p className="text-base text-avend-text-muted">
        {typeText(document)}
        {document.issuanceYear ? ` · ${document.issuanceYear}` : ""} ·{" "}
        {situationText(document)}
      </p>
      {document.technicalStatus !== "ready" ? (
        <p className="mt-1 text-base font-semibold text-amber-900">
          {getDocumentTechnicalStatusContent(document.technicalStatus).label}
          {document.technicalStatus === "pending_approval"
            ? ": el asistente aún no lo usa. Apruébalo desde «Ver y editar»."
            : ": revisa el documento desde «Ver y editar»."}
        </p>
      ) : null}
      <DocumentQuickActions document={document} />
    </li>
  );
}

interface Highlight {
  documentId?: string;
  section: ContentSectionCode;
  /** Ya se desplazó la vista hasta el documento (o la sección). */
  scrolled: boolean;
}

/** Documentos visibles por sección antes de «Ver todos» (evita un scroll largo). */
export const SECTION_PREVIEW_COUNT = 5;

/**
 * Lista de una sección: los primeros documentos y, si hay más, «Ver todos».
 * Si el documento recién cargado queda fuera de los primeros, la sección se
 * despliega sola para que se vea parpadear en su sitio.
 */
function SectionDocuments({
  code,
  documents,
  highlightedId,
  listId,
  revealId,
  title,
}: {
  code: ContentSectionCode | "OTROS";
  documents: DocumentLibraryItem[];
  highlightedId: string | null;
  listId: string;
  /** Documento recién cargado: si queda oculto, la sección se despliega. */
  revealId: string | null;
  title: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [autoExpandedFor, setAutoExpandedFor] = useState<string | null>(null);
  const revealIndex = revealId
    ? documents.findIndex((document) => document.id === revealId)
    : -1;
  if (
    revealId &&
    revealId !== autoExpandedFor &&
    revealIndex >= SECTION_PREVIEW_COUNT
  ) {
    setAutoExpandedFor(revealId);
    setExpanded(true);
  }

  const hasMore = documents.length > SECTION_PREVIEW_COUNT;
  const visible =
    expanded || !hasMore ? documents : documents.slice(0, SECTION_PREVIEW_COUNT);

  return (
    <>
      <ul className="mt-2 space-y-2" id={listId}>
        {visible.map((document) => (
          <DocumentLine
            code={code}
            document={document}
            highlighted={highlightedId === document.id}
            key={document.id}
          />
        ))}
      </ul>
      {hasMore ? (
        <button
          aria-controls={listId}
          aria-expanded={expanded}
          aria-label={
            expanded
              ? `Ver menos documentos de ${title}`
              : `Ver todos los documentos de ${title} (${documents.length})`
          }
          className="avend-button avend-button--secondary mt-3"
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
          {expanded ? "Ver menos" : `Ver todos (${documents.length})`}
        </button>
      ) : null}
    </>
  );
}

function scrollBehavior(): ScrollBehavior {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

export interface ModuleContentSectionsProps {
  apiBaseUrl?: string;
  canUpload: boolean;
  /** `false` si el tema tiene más documentos de los que se muestran. */
  complete?: boolean;
  documents: DocumentLibraryItem[];
  /** Abre la ventana de carga al llegar con `?cargar=1&tipo=…`. */
  initialUploadSection?: ContentSectionCode;
  moduleId: string;
  moduleName?: string;
  suggestions?: DocumentSuggestions;
  /** Motivo visible cuando no se puede subir (p. ej., módulo inactivo). */
  uploadBlockedReason?: string;
  uploadDefaults?: ContextualUploadDefaults;
}

/**
 * Contenido del tema ordenado por secciones estándar (normativa, cronograma,
 * anexos numerados y preguntas frecuentes) con acciones directas por
 * documento. «+ Subir …» abre una ventana con el formulario resumido, sin
 * recargar la página; al terminar, lleva la vista a la sección y hace parpadear
 * el documento nuevo.
 */
export function ModuleContentSections({
  apiBaseUrl = "",
  canUpload,
  complete = true,
  documents,
  initialUploadSection,
  moduleId,
  moduleName = "",
  suggestions = emptySuggestions,
  uploadBlockedReason,
  uploadDefaults,
}: ModuleContentSectionsProps) {
  const [uploadSection, setUploadSection] = useState<ContentSectionCode | null>(
    canUpload ? (initialUploadSection ?? null) : null,
  );
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const containerRef = useRef<HTMLElement>(null);
  const closeUpload = useCallback(() => setUploadSection(null), []);

  const sections = CONTENT_SECTION_CODES.map((code) => ({
    code,
    items: sortedItems(
      code,
      documents.filter((document) => documentContentSection(document) === code),
    ),
  }));
  const others = sortedItems(
    "OTROS",
    documents.filter((document) => documentContentSection(document) === null),
  );

  // La fila parpadea cuando la vista ya llegó a ella.
  const highlightedId =
    highlight?.documentId && highlight.scrolled ? highlight.documentId : null;
  // Para desplegar una sección antes de llegar a la fila basta con saber cuál
  // es el documento nuevo; el desplazamiento ocurre después.
  const pendingDocumentId = highlight?.documentId ?? null;
  const highlightedDocumentPresent = Boolean(
    highlight?.documentId &&
      documents.some((document) => document.id === highlight.documentId),
  );

  // Tras la carga: primero se lleva la vista a la sección; cuando la recarga
  // trae el documento, a su fila, que parpadea y luego vuelve a la normalidad.
  useEffect(() => {
    if (!highlight || highlight.scrolled) return;
    const container = containerRef.current;
    if (!container) return;
    const row = highlight.documentId
      ? container.querySelector<HTMLElement>(
          `[data-document-id="${highlight.documentId}"]`,
        )
      : null;
    const target =
      row ??
      container.querySelector<HTMLElement>(
        `[data-section="${highlight.section}"]`,
      );
    target?.scrollIntoView?.({ behavior: scrollBehavior(), block: "center" });
    if (row || !highlight.documentId) {
      setHighlight({ ...highlight, scrolled: true });
    }
  }, [highlight, highlightedDocumentPresent]);

  useEffect(() => {
    if (!highlight) return;
    const done =
      highlight.scrolled &&
      (highlightedDocumentPresent || !highlight.documentId);
    const timer = globalThis.setTimeout(
      () => setHighlight(null),
      done ? HIGHLIGHT_MS : HIGHLIGHT_GIVE_UP_MS,
    );
    return () => globalThis.clearTimeout(timer);
  }, [highlight, highlightedDocumentPresent]);

  const handleUploaded = useCallback(
    ({ created, section }: ContextualUploadResult) => {
      setUploadSection(null);
      setHighlight({ documentId: created?.id, scrolled: false, section });
      const name = created?.title ? `«${created.title}»` : "El documento";
      setAnnouncement(
        `${name} se cargó en ${CONTENT_SECTION_TITLES[section]}.`,
      );
    },
    [],
  );

  return (
    <section
      aria-labelledby="module-content-title"
      className="rounded-xl border border-avend-border bg-avend-surface p-5"
      ref={containerRef}
    >
      <h2 className="text-xl font-bold" id="module-content-title">
        Contenido del tema
      </h2>
      <p className="mt-1 text-base leading-7 text-avend-text-muted">
        Todos los documentos de este tema, ordenados en normativa, cronograma,
        anexos y preguntas frecuentes. Los anexos se ordenan por su número.
      </p>
      {!complete ? (
        <p className="mt-2 text-base text-avend-text-muted">
          Este tema tiene muchos documentos: aquí se muestran los primeros. Usa
          «Documentos cargados» para buscar el resto.
        </p>
      ) : null}
      {!canUpload && uploadBlockedReason ? (
        <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-base text-amber-900">
          {uploadBlockedReason}
        </p>
      ) : null}
      <p aria-live="polite" className="sr-only" role="status">
        {announcement}
      </p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {sections.map((section) => {
          const title = CONTENT_SECTION_TITLES[section.code];
          const sectionHighlighted =
            highlight?.section === section.code &&
            highlight.scrolled &&
            !highlightedDocumentPresent;
          return (
            <article
              className={`rounded-lg border border-avend-border p-4${
                sectionHighlighted ? ` ${styles.sectionNew}` : ""
              }`}
              data-section={section.code}
              key={section.code}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-bold">
                  {title} ({section.items.length})
                </h3>
                {canUpload ? (
                  <button
                    aria-haspopup="dialog"
                    className="avend-button avend-button--secondary"
                    onClick={() => setUploadSection(section.code)}
                    type="button"
                  >
                    + Subir {title.toLowerCase()}
                  </button>
                ) : null}
              </div>
              <p className="mt-1 text-base text-avend-text-muted">
                {CONTENT_SECTION_HINTS[section.code]}
              </p>
              {section.items.length === 0 ? (
                <p className="mt-2 text-base text-avend-text-muted">
                  Sin {title.toLowerCase()} todavía.
                </p>
              ) : (
                <SectionDocuments
                  code={section.code}
                  documents={section.items}
                  highlightedId={highlightedId}
                  listId={`module-content-${section.code.toLowerCase()}`}
                  revealId={pendingDocumentId}
                  title={title}
                />
              )}
            </article>
          );
        })}
        {others.length ? (
          <article className="rounded-lg border border-avend-border p-4">
            <h3 className="text-base font-bold">
              Otros documentos ({others.length})
            </h3>
            <p className="mt-1 text-base text-avend-text-muted">
              Otros tipos cargados en este tema.
            </p>
            <SectionDocuments
              code="OTROS"
              documents={others}
              highlightedId={highlightedId}
              listId="module-content-otros"
              revealId={pendingDocumentId}
              title="Otros documentos"
            />
          </article>
        ) : null}
      </div>
      {uploadSection ? (
        <ContextualUploadDialog
          apiBaseUrl={apiBaseUrl}
          defaults={uploadDefaults ?? { issuanceYear: currentLimaYear() }}
          moduleId={moduleId}
          moduleName={moduleName}
          onClose={closeUpload}
          onUploaded={handleUploaded}
          section={uploadSection}
          suggestions={suggestions}
        />
      ) : null}
    </section>
  );
}
