"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { documentTypeLabel } from "@/lib/admin-api/document-taxonomy";
import {
  formatDocumentSituation,
  getDocumentTechnicalStatusContent,
} from "@/lib/admin-api/labels";
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
import blinkStyles from "./contextual-upload-dialog.module.css";
import libraryStyles from "./document-library-view.module.css";
import { DocumentRowActions } from "./document-row-actions";
import styles from "./submodule-content-view.module.css";

/** Documentos visibles por sección antes de «Ver todos». */
export const SECTION_PREVIEW_COUNT = 5;

const HIGHLIGHT_MS = 2800;
const HIGHLIGHT_GIVE_UP_MS = 10_000;
const emptySuggestions: DocumentSuggestions = {
  additionalDetails: [],
  specificDependencies: [],
};

type SectionCode = ContentSectionCode | "OTROS";
type ViewMode = "list" | "grid";
type SituationFilter = DocumentLibraryItem["situation"];

interface Highlight {
  documentId?: string;
  section: SectionCode;
  scrolled: boolean;
}

export interface SubmoduleContentViewProps {
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
  uploadBlockedReason?: string;
  uploadDefaults?: ContextualUploadDefaults;
}

function typeText(document: DocumentLibraryItem): string {
  return document.documentType === "OTRO" && document.documentTypeOther?.trim()
    ? document.documentTypeOther.trim()
    : documentTypeLabel(document.documentType);
}

interface SectionGroup {
  code: SectionCode;
  items: DocumentLibraryItem[];
}

function sortedItems(
  code: SectionCode,
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

function SectionIcon({ code }: { code: SectionCode }) {
  if (code === "NORMATIVA") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M6 3.5h8L19 8.5v12H6z" />
        <path d="M9 12h7M9 15.5h7M9 19h4" />
      </svg>
    );
  }
  if (code === "CRONOGRAMA") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <rect height="15" rx="2" width="16" x="4" y="5" />
        <path d="M8 3v4M16 3v4M4 10h16M8 13.5h3M8 17h7" />
      </svg>
    );
  }
  if (code === "ANEXO") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M15.5 5.5 8 13a3 3 0 0 0 4.2 4.2l7-7a4.5 4.5 0 0 0-6.4-6.4l-7 7" />
      </svg>
    );
  }
  if (code === "PREGUNTAS_FRECUENTES") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M9.8 9.4a2.3 2.3 0 1 1 3.4 2.1c-.8.5-1.2 1-1.2 1.9M12 16.4v.2" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H11l2.5 2.5H17A2.5 2.5 0 0 1 20 9v8.5A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5z" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M7 3.5h7l4 4v13H7z" />
      <path d="M14 3.5v4h4" />
      <path d="M9.5 12h5M9.5 15.5h5" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="10.75" cy="10.75" r="6.75" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect height="7" width="7" x="4" y="4" rx="1" />
      <rect height="7" width="7" x="13" y="4" rx="1" />
      <rect height="7" width="7" x="4" y="13" rx="1" />
      <rect height="7" width="7" x="13" y="13" rx="1" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </svg>
  );
}

function StatusPill({ document }: { document: DocumentLibraryItem }) {
  const tone =
    document.situation === "current"
      ? styles.statusCurrent
      : document.situation === "replaced"
        ? styles.statusReplaced
        : styles.statusArchived;
  return (
    <span className={`${styles.statusPill} ${tone}`}>
      <span aria-hidden="true" className={styles.statusDot} />
      <span className="sr-only">Estado: </span>
      {formatDocumentSituation(document.situation)}
    </span>
  );
}

function DocumentActions({ document }: { document: DocumentLibraryItem }) {
  return (
    <div className={`${styles.actions} ${libraryStyles.actionsTable}`}>
      <Link
        aria-label={`Ver detalle: ${document.title}`}
        className={styles.actionButton}
        href={`/admin/documents/${document.id}`}
        title="Ver detalle"
      >
        <EyeIcon />
      </Link>
      <Link
        aria-label={`Editar: ${document.title}`}
        className={`${styles.actionButton} ${styles.actionEdit}`}
        href={`/admin/documents/${document.id}#edit-document`}
        title="Editar"
      >
        <PencilIcon />
      </Link>
      <DocumentRowActions document={document} />
    </div>
  );
}

function DocumentTitle({
  document,
  code,
}: {
  document: DocumentLibraryItem;
  code: SectionCode;
}) {
  const number = code === "ANEXO" ? annexNumber(document) : null;
  const showNumber = number !== null && !titleStartsWithAnnexNumber(document.title);
  return (
    <div className={styles.docCell}>
      <span aria-hidden="true" className={styles.docIcon}>
        <FileIcon />
      </span>
      <span>
        <Link
          className={styles.docTitle}
          href={`/admin/documents/${document.id}`}
          title={document.title}
        >
          {showNumber ? `Anexo ${number}: ` : ""}
          {document.title}
        </Link>
        <span className={styles.docMeta}>
          {typeText(document)}
          {document.issuanceYear ? ` · ${document.issuanceYear}` : ""}
        </span>
        {document.technicalStatus !== "ready" ? (
          <span className={styles.docStatus}>
            {getDocumentTechnicalStatusContent(document.technicalStatus).label}
            : revisa el documento desde «Ver y editar».
          </span>
        ) : null}
      </span>
    </div>
  );
}

function scrollBehavior(): ScrollBehavior {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/**
 * Vista de los documentos de un submódulo organizada por secciones: tarjetas
 * que seleccionan la sección activa y una tabla con búsqueda, filtro por
 * situación y vista de lista o cuadrícula. Las acciones abren los mismos
 * formularios y Server Actions que el resto de la administración.
 */
export function SubmoduleContentView({
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
}: SubmoduleContentViewProps) {
  const [activeSection, setActiveSection] = useState<SectionCode>(
    initialUploadSection ?? "NORMATIVA",
  );
  const [search, setSearch] = useState("");
  const [situations, setSituations] = useState<SituationFilter[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [expanded, setExpanded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [uploadSection, setUploadSection] = useState<ContentSectionCode | null>(
    canUpload ? (initialUploadSection ?? null) : null,
  );
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const containerRef = useRef<HTMLElement>(null);
  const closeUpload = useCallback(() => setUploadSection(null), []);

  const sections = useMemo<SectionGroup[]>(() => {
    const groups: SectionGroup[] = CONTENT_SECTION_CODES.map((code) => ({
      code,
      items: sortedItems(
        code,
        documents.filter(
          (document) => documentContentSection(document) === code,
        ),
      ),
    }));
    const others = sortedItems(
      "OTROS",
      documents.filter(
        (document) => documentContentSection(document) === null,
      ),
    );
    if (others.length > 0) {
      groups.push({ code: "OTROS", items: others });
    }
    return groups;
  }, [documents]);

  const active = sections.find((section) => section.code === activeSection);
  const uploadableSection =
    activeSection === "OTROS" ? null : activeSection;
  const activeTitle =
    activeSection === "OTROS"
      ? "Otros documentos"
      : CONTENT_SECTION_TITLES[activeSection];
  const activeHint =
    activeSection === "OTROS"
      ? "Otros tipos cargados en este submódulo."
      : CONTENT_SECTION_HINTS[activeSection];

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es-PE");
    return (active?.items ?? []).filter((document) => {
      if (situations.length > 0 && !situations.includes(document.situation)) {
        return false;
      }
      if (!query) return true;
      return [document.title, typeText(document), String(document.issuanceYear ?? "")]
        .join(" ")
        .toLocaleLowerCase("es-PE")
        .includes(query);
    });
  }, [active, search, situations]);

  const visible =
    expanded || filtered.length <= SECTION_PREVIEW_COUNT
      ? filtered
      : filtered.slice(0, SECTION_PREVIEW_COUNT);
  const visibleIds = visible.map((document) => document.id);
  const allVisibleSelected =
    visibleIds.length > 0 &&
    visibleIds.every((id) => selectedIds.includes(id));

  const highlightedId =
    highlight?.documentId && highlight.scrolled ? highlight.documentId : null;
  const highlightedDocumentPresent = Boolean(
    highlight?.documentId &&
      documents.some((document) => document.id === highlight.documentId),
  );

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
      setActiveSection(section);
      setSearch("");
      setSituations([]);
      setHighlight({ documentId: created?.id, scrolled: false, section });
      const name = created?.title ? `«${created.title}»` : "El documento";
      setAnnouncement(
        `${name} se cargó en ${CONTENT_SECTION_TITLES[section]}.`,
      );
    },
    [],
  );

  const toggleSituation = (situation: SituationFilter) => {
    setSituations((current) =>
      current.includes(situation)
        ? current.filter((value) => value !== situation)
        : [...current, situation],
    );
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  };

  const toggleAll = () => {
    setSelectedIds((current) =>
      allVisibleSelected
        ? current.filter((id) => !visibleIds.includes(id))
        : [...new Set([...current, ...visibleIds])],
    );
  };

  return (
    <section aria-labelledby="submodule-content-title" className={styles.view} ref={containerRef}>
      <div
        aria-label="Secciones del submódulo"
        className={styles.tabs}
        onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
          if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
          event.preventDefault();
          const index = sections.findIndex(
            (section) => section.code === activeSection,
          );
          const direction = event.key === "ArrowRight" ? 1 : -1;
          const next =
            sections[
              (index + direction + sections.length) % sections.length
            ];
          setActiveSection(next.code);
          document
            .getElementById(`submodule-tab-${next.code.toLowerCase()}`)
            ?.focus();
        }}
        role="tablist"
      >
        {sections.map((section) => {
          const title =
            section.code === "OTROS"
              ? "Otros documentos"
              : CONTENT_SECTION_TITLES[section.code];
          const selected = section.code === activeSection;
          return (
            <button
              aria-controls="submodule-section-panel"
              aria-selected={selected}
              className={`${styles.tab}${selected ? ` ${styles.tabSelected}` : ""}`}
              id={`submodule-tab-${section.code.toLowerCase()}`}
              key={section.code}
              onClick={() => {
                setActiveSection(section.code);
                setExpanded(false);
                setSearch("");
                setSituations([]);
                setSelectedIds([]);
              }}
              role="tab"
              type="button"
            >
              <span aria-hidden="true" className={styles.tabIcon}>
                <SectionIcon code={section.code} />
              </span>
              <span className={styles.tabText}>
                <span className={styles.tabTitle}>{title}</span>
                <span className={styles.tabCount}>
                  {section.items.length}{" "}
                  {section.items.length === 1 ? "documento" : "documentos"}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div
        aria-labelledby={`submodule-tab-${activeSection.toLowerCase()}`}
        className={styles.panel}
        data-section={activeSection}
        id="submodule-section-panel"
        role="tabpanel"
      >
        <header className={styles.panelHeader}>
          <div className={styles.panelHeading}>
            <span aria-hidden="true" className={styles.panelIcon}>
              <SectionIcon code={activeSection} />
            </span>
            <div>
              <h2 className={styles.panelTitle} id="submodule-content-title">
                {activeTitle} ({active?.items.length ?? 0})
              </h2>
              <p className={styles.panelHint}>{activeHint}</p>
            </div>
          </div>
          {canUpload && uploadableSection ? (
            <button
              aria-haspopup="dialog"
              className={styles.uploadButton}
              onClick={() => setUploadSection(uploadableSection)}
              type="button"
            >
              + Subir {activeTitle.toLowerCase()}
            </button>
          ) : null}
        </header>

        {!complete ? (
          <p className={styles.warning}>
            Este tema tiene muchos documentos: usa «Documentos cargados» para
            buscar el resto.
          </p>
        ) : null}
        {!canUpload && uploadBlockedReason ? (
          <p className={styles.warning}>{uploadBlockedReason}</p>
        ) : null}
        <p aria-live="polite" className={styles.announcement} role="status">
          {announcement}
        </p>

        <div className={styles.toolbar}>
          <label className={styles.searchField}>
            <span aria-hidden="true" className={styles.searchIcon}>
              <SearchIcon />
            </span>
            <span className="sr-only">Buscar documento por nombre</span>
            <input
              className="submodule-search"
              onChange={(event) => {
                setSearch(event.target.value);
                setExpanded(false);
              }}
              placeholder="Buscar documento por nombre..."
              type="search"
              value={search}
            />
          </label>
          <details className={styles.filter}>
            <summary>
              <span aria-hidden="true" className={styles.filterIcon}>
                <FilterIcon />
              </span>
              Filtrar
              <svg aria-hidden="true" className={styles.chevron} viewBox="0 0 24 24">
                <path d="m6 9 6 6 6-6" />
              </svg>
              {situations.length > 0 ? (
                <span className="sr-only">
                  {` (${situations.length} activos)`}
                </span>
              ) : null}
            </summary>
            <fieldset className={styles.filterMenu}>
              <legend>Situación</legend>
              {(["current", "replaced", "archived"] as const).map(
                (situation) => (
                  <label key={situation}>
                    <input
                      checked={situations.includes(situation)}
                      onChange={() => toggleSituation(situation)}
                      type="checkbox"
                    />
                    {formatDocumentSituation(situation)}
                  </label>
                ),
              )}
              {situations.length > 0 ? (
                <button
                  className={styles.showAll}
                  onClick={() => setSituations([])}
                  type="button"
                >
                  Limpiar filtro
                </button>
              ) : null}
            </fieldset>
          </details>
          <div aria-label="Vista de documentos" className={styles.viewToggle} role="group">
            <button
              aria-label="Vista de lista"
              aria-pressed={viewMode === "list"}
              className={`${styles.viewButton}${viewMode === "list" ? ` ${styles.viewButtonActive}` : ""}`}
              onClick={() => setViewMode("list")}
              type="button"
            >
              <span aria-hidden="true" className={styles.viewIcon}>
                <ListIcon />
              </span>
            </button>
            <button
              aria-label="Vista de cuadrícula"
              aria-pressed={viewMode === "grid"}
              className={`${styles.viewButton}${viewMode === "grid" ? ` ${styles.viewButtonActive}` : ""}`}
              onClick={() => setViewMode("grid")}
              type="button"
            >
              <span aria-hidden="true" className={styles.viewIcon}>
                <GridIcon />
              </span>
            </button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className={styles.empty}>
            {active?.items.length === 0
              ? `Sin ${activeTitle.toLowerCase()} todavía.`
              : "No encontramos documentos con esos criterios."}
          </p>
        ) : viewMode === "list" ? (
          <div className={styles.tableRegion}>
            <table className={styles.table} id="submodule-documents-table">
              <thead>
                <tr>
                  <th scope="col">
                    <input
                      aria-label="Seleccionar todos los documentos visibles"
                      checked={allVisibleSelected}
                      className={styles.selectAll}
                      onChange={toggleAll}
                      type="checkbox"
                    />
                  </th>
                  <th scope="col">Documento</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Año</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((document) => (
                  <tr
                    className={
                      highlightedId === document.id ? styles.rowNew : undefined
                    }
                    data-document-id={document.id}
                    key={document.id}
                  >
                    <td>
                      <input
                        aria-label={`Seleccionar ${document.title}`}
                        checked={selectedIds.includes(document.id)}
                        className={styles.rowCheckbox}
                        onChange={() => toggleSelection(document.id)}
                        type="checkbox"
                      />
                    </td>
                    <td>
                      <DocumentTitle code={activeSection} document={document} />
                    </td>
                    <td>
                      <span className={styles.typePill}>{typeText(document)}</span>
                    </td>
                    <td>{document.issuanceYear ?? "—"}</td>
                    <td>
                      <StatusPill document={document} />
                    </td>
                    <td>
                      <DocumentActions document={document} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ul className={styles.grid} id="submodule-documents-table" role="list">
            {visible.map((document) => (
              <li
                className={`${styles.gridCard}${highlightedId === document.id ? ` ${blinkStyles.itemNew}` : ""}`}
                data-document-id={document.id}
                key={document.id}
              >
                <div className={styles.gridCardTop}>
                  <span aria-hidden="true" className={styles.docIcon}>
                    <FileIcon />
                  </span>
                  <DocumentTitle code={activeSection} document={document} />
                </div>
                <div className={styles.gridMeta}>
                  <span className={styles.typePill}>{typeText(document)}</span>
                  <StatusPill document={document} />
                </div>
                <div className={styles.gridFooter}>
                  <span className={styles.tabCount}>
                    {document.issuanceYear ?? "—"}
                  </span>
                  <DocumentActions document={document} />
                </div>
              </li>
            ))}
          </ul>
        )}

        <footer className={styles.panelFooter}>
          <span>
            Mostrando {visible.length} de {filtered.length} documentos
            {selectedIds.length > 0
              ? ` · ${selectedIds.length} seleccionados`
              : ""}
          </span>
          {filtered.length > SECTION_PREVIEW_COUNT ? (
            <button
              aria-controls="submodule-documents-table"
              aria-expanded={expanded}
              className={styles.showAll}
              onClick={() => setExpanded((current) => !current)}
              type="button"
            >
              {expanded
                ? "Ver menos"
                : `Ver todos (${filtered.length})`}
              <span className="sr-only">{` en ${activeTitle}`}</span>
            </button>
          ) : null}
        </footer>
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
