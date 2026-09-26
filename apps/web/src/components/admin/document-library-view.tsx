import Link from "next/link";
import {
  clearedLibraryFiltersHref,
  documentLibraryHref,
  type ParsedDocumentLibraryQuery,
} from "@/lib/admin-api/document-library-query";
import {
  formatDocumentSituation,
  formatDocumentType,
  getDocumentTechnicalStatusContent,
} from "@/lib/admin-api/labels";
import type {
  DocumentLibraryItem,
  DocumentLibraryPage,
  DocumentModuleAssociation,
  DocumentUploader,
  ManagedModule,
} from "@/lib/admin-api/types";
import {
  DOCUMENT_TYPE_OPTIONS,
  ISSUING_ENTITY_OPTIONS,
  documentYears,
  issuingEntityLabel,
} from "@/lib/admin-api/document-taxonomy";
import styles from "./document-library-view.module.css";

interface DocumentLibraryViewProps {
  activeFilterCount: number;
  basePath?: string;
  library: DocumentLibraryPage;
  lockLocation?: boolean;
  modules: ManagedModule[];
  query: ParsedDocumentLibraryQuery;
  resultsTitle?: string;
  uploaders?: DocumentUploader[];
}

const dateFormatter = new Intl.DateTimeFormat("es-PE", {
  dateStyle: "medium",
  timeZone: "America/Lima",
});

const situationClasses = {
  archived: "border-slate-300 bg-slate-100 text-slate-800",
  current: "border-emerald-300 bg-emerald-50 text-emerald-800",
  replaced: "border-amber-300 bg-amber-50 text-amber-900",
} as const;

const technicalClasses = {
  error: "border-red-300 bg-red-50 text-red-800",
  pending_approval: "border-amber-300 bg-amber-50 text-amber-900",
  ready: "border-emerald-300 bg-emerald-50 text-emerald-800",
} as const;

const fieldClass =
  "mt-1 min-h-11 w-full rounded-md border border-avend-border bg-white px-3 text-base";

function AssociationList({
  associations,
}: {
  associations: DocumentModuleAssociation[];
}) {
  if (associations.length === 0) {
    return <span className="text-avend-text-muted">Sin asociación</span>;
  }

  const groups = new Map<string, { name: string; submodules: Set<string> }>();
  for (const association of associations) {
    const group = groups.get(association.moduleId) ?? {
      name: association.moduleName,
      submodules: new Set<string>(),
    };
    if (association.submoduleName) {
      group.submodules.add(association.submoduleName);
    }
    groups.set(association.moduleId, group);
  }

  return (
    <ul className="space-y-1" role="list">
      {[...groups.entries()].map(([moduleId, group]) => (
        <li key={moduleId}>
          <span className="font-medium">{group.name}</span>
          {group.submodules.size > 0 ? (
            <span className="block text-avend-text-muted">
              {[...group.submodules].join(", ")}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * Situación y estado técnico son conceptos distintos que caen en columnas
 * contiguas. Compartían color y forma, así que un documento Vigente + Listo
 * mostraba dos píldoras verdes gemelas imposibles de distinguir de un vistazo.
 * La situación conserva la píldora redonda; el estado técnico usa un chip
 * rectangular con símbolo. El texto va a 16px, el mínimo del proyecto.
 */
function SituationBadge({ document }: { document: DocumentLibraryItem }) {
  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-base font-semibold ${situationClasses[document.situation]}`}
    >
      <span aria-hidden="true" className="mr-1.5">
        ●
      </span>
      <span className="sr-only">Situación: </span>
      {formatDocumentSituation(document.situation)}
    </span>
  );
}

const technicalSymbols = {
  error: "!",
  pending_approval: "…",
  ready: "✓",
} as const;

function TechnicalBadge({ document }: { document: DocumentLibraryItem }) {
  const content = getDocumentTechnicalStatusContent(document.technicalStatus);
  return (
    <span
      className={`inline-flex rounded-md border px-3 py-1 text-base font-semibold ${technicalClasses[document.technicalStatus]}`}
      title={content.description}
    >
      <span aria-hidden="true" className="mr-1.5 font-bold">
        {technicalSymbols[document.technicalStatus]}
      </span>
      <span className="sr-only">Estado técnico: </span>
      {content.label}
      <span className="sr-only">. {content.description}</span>
    </span>
  );
}

/**
 * El orden por defecto («Más recientes») usa la fecha de la última versión, un
 * dato que la tabla no mostraba: el listado parecía desordenado respecto de la
 * única fecha visible. Se muestra cuando difiere de la fecha de registro.
 */
function LastVersionDate({ document }: { document: DocumentLibraryItem }) {
  const uploadedAt = document.currentVersionUploadedAt;
  if (!uploadedAt) return null;

  const sameDay =
    dateFormatter.format(new Date(uploadedAt)) ===
    dateFormatter.format(new Date(document.createdAt));
  if (sameDay) return null;

  return (
    <span className="mt-1 block break-words text-avend-text-muted">
      Última versión:{" "}
      <time dateTime={uploadedAt}>
        {dateFormatter.format(new Date(uploadedAt))}
      </time>
    </span>
  );
}

function displayedDocumentType(document: DocumentLibraryItem): string {
  return document.documentType === "OTRO" && document.documentTypeOther
    ? document.documentTypeOther
    : formatDocumentType(document.documentType);
}

function displayedIssuingEntity(document: DocumentLibraryItem): string {
  if (!document.issuingEntity) return "—";
  return document.issuingEntity === "OTRA_INSTITUCION" &&
    document.issuingEntityOther
    ? document.issuingEntityOther
    : issuingEntityLabel(document.issuingEntity);
}

function MissingPdfNote({ document }: { document: DocumentLibraryItem }) {
  if (document.currentVersionId) return null;
  return <span className="block text-avend-text-muted">Sin PDF disponible</span>;
}

function EyeIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </svg>
  );
}

/**
 * Acciones compactas: ojo = ver detalle, lápiz = editar.
 * - En la tabla solo se ve el ícono; el nombre completo aparece como etiqueta
 *   flotante al pasar el mouse o al llegar con el teclado, sin mover nada.
 * - En las tarjetas (pantallas pequeñas y táctiles) el nombre se ve siempre.
 * Cada enlace conserva su nombre accesible para lectores de pantalla.
 */
function DocumentActions({
  document,
  variant = "table",
}: {
  document: DocumentLibraryItem;
  variant?: "card" | "table";
}) {
  return (
    <div className={`${styles.actions} ${variant === "card" ? styles.actionsCard : styles.actionsTable}`}>
      <Link
        aria-label={`Ver detalle: ${document.title}`}
        className={styles.action}
        href={`/admin/documents/${document.id}`}
        title="Ver detalle"
      >
        <EyeIcon />
        <span aria-hidden="true" className={styles.actionLabel}>
          Ver detalle
        </span>
      </Link>
      <Link
        aria-label={`Editar: ${document.title}`}
        className={styles.action}
        href={`/admin/documents/${document.id}#edit-document`}
        title="Editar"
      >
        <PencilIcon />
        <span aria-hidden="true" className={styles.actionLabel}>
          Editar
        </span>
      </Link>
    </div>
  );
}

function FilterIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <circle cx="10.75" cy="10.75" r="6.75" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

export function DocumentLibraryView({
  activeFilterCount,
  basePath = "/admin/documents",
  library,
  lockLocation = false,
  modules,
  query,
  resultsTitle = "Biblioteca documental",
  uploaders = [],
}: DocumentLibraryViewProps) {
  const visibleModules = modules.filter((module) => !module.isDeleted);
  const rootModules = visibleModules.filter((module) => !module.parentModuleId);
  const submodules = visibleModules.filter((module) => module.parentModuleId);
  const selectedModule = query.moduleId
    ? visibleModules.find((module) => module.id === query.moduleId)
    : undefined;
  const visibleSubmodules = selectedModule
    ? submodules.filter((module) => module.parentModuleId === selectedModule.id)
    : submodules;
  // Sin módulo elegido la lista mezcla submódulos de los siete módulos. Se
  // agrupan por su módulo padre para que el administrador sepa cuál elige.
  const submodulesByParent = rootModules
    .map((parent) => ({
      parent,
      children: visibleSubmodules.filter(
        (module) => module.parentModuleId === parent.id,
      ),
    }))
    .filter((group) => group.children.length > 0);
  const totalPages = Math.max(1, Math.ceil(library.total / library.limit));
  // La búsqueda por nombre ya está a la vista: no cuenta como "filtro
  // avanzado". (La ubicación fija de un módulo ya la descuenta su página.)
  const advancedFilterCount = Math.max(
    0,
    activeFilterCount - (query.q !== undefined ? 1 : 0),
  );

  return (
    <div className="space-y-6">
      {/*
        Vista minimalista: a la vista solo queda la búsqueda. El resto de los
        filtros vive en un panel plegable, así la pantalla no se satura ni se
        alarga. Al estar dentro del mismo formulario, los filtros elegidos se
        conservan aunque el panel esté cerrado.
      */}
      <form action={basePath} className={styles.searchCard} method="get">
        {lockLocation && query.moduleId ? (
          <input name="moduleId" type="hidden" value={query.moduleId} />
        ) : null}
        {lockLocation && query.submoduleId ? (
          <input name="submoduleId" type="hidden" value={query.submoduleId} />
        ) : null}

        <div className={styles.searchRow}>
          <label className={styles.searchField} htmlFor="library-search">
            <span className="sr-only">Buscar documentos por nombre</span>
            <span aria-hidden="true" className={styles.searchIcon}>
              <SearchIcon />
            </span>
            <input
              defaultValue={query.q}
              id="library-search"
              maxLength={200}
              name="q"
              placeholder="Buscar documentos por nombre"
              type="search"
            />
          </label>
          <button className="avend-button avend-button--primary" type="submit">
            Buscar
          </button>
        </div>

        <details className={styles.advanced}>
          <summary className={styles.advancedToggle}>
            <FilterIcon />
            <span>Filtros avanzados</span>
            {advancedFilterCount > 0 ? (
              <span className={styles.badge}>
                {advancedFilterCount}
                <span className="sr-only">
                  {advancedFilterCount === 1 ? " filtro activo" : " filtros activos"}
                </span>
              </span>
            ) : null}
            <svg aria-hidden="true" className={styles.chevron} fill="none" viewBox="0 0 24 24">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </summary>

          <fieldset className={styles.filtersGrid}>
            <legend className="sr-only">Filtros de documentos</legend>
            <label htmlFor="library-year">
              <span className="text-base font-semibold">Año</span>
              <input
                className={fieldClass}
                defaultValue={query.issuanceYear ?? ""}
                id="library-year"
                inputMode="numeric"
                list="library-year-options"
                // Sin min/max del navegador: con el panel plegado, un año fuera
                // de rango bloqueaba "Buscar" sin mostrar por qué. El servidor
                // ya descarta los años inválidos.
                name="issuanceYear"
                placeholder="Todos (ej. 2026 o 2009)"
                type="number"
              />
            </label>
            <datalist id="library-year-options">
              {documentYears().map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </datalist>
            <label htmlFor="library-type">
              <span className="text-base font-semibold">Tipo documental</span>
              <select
                className={fieldClass}
                defaultValue={query.documentType}
                id="library-type"
                name="documentType"
              >
                <option value="">Todos</option>
                {DOCUMENT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="library-entity">
              <span className="text-base font-semibold">Entidad</span>
              <select
                className={fieldClass}
                defaultValue={query.issuingEntity}
                id="library-entity"
                name="issuingEntity"
              >
                <option value="">Todas</option>
                {ISSUING_ENTITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {!lockLocation ? (
              <label htmlFor="library-module">
                <span className="text-base font-semibold">Módulo</span>
                <select
                  className={fieldClass}
                  defaultValue={query.moduleId ?? ""}
                  id="library-module"
                  name="moduleId"
                >
                  <option value="">Todos</option>
                  {rootModules.map((module) => (
                    <option key={module.id} value={module.id}>
                      {module.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {!lockLocation ? (
              <label htmlFor="library-submodule">
                <span className="text-base font-semibold">Submódulo</span>
                <select
                  className={fieldClass}
                  defaultValue={query.submoduleId ?? ""}
                  id="library-submodule"
                  name="submoduleId"
                >
                  <option value="">Todos</option>
                  {submodulesByParent.map((group) => (
                    <optgroup key={group.parent.id} label={group.parent.name}>
                      {group.children.map((module) => (
                        <option key={module.id} value={module.id}>
                          {module.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            ) : null}
            <label htmlFor="library-situation">
              <span className="text-base font-semibold">Situación</span>
              <select
                className={fieldClass}
                defaultValue={query.situation ?? ""}
                id="library-situation"
                name="situation"
              >
                <option value="">Todas</option>
                <option value="current">Vigente</option>
                <option value="replaced">Reemplazado / Sin vigencia</option>
                <option value="archived">Archivado</option>
              </select>
            </label>
            <label htmlFor="library-technical">
              <span className="text-base font-semibold">Estado técnico</span>
              <select
                className={fieldClass}
                defaultValue={query.technicalStatus ?? ""}
                id="library-technical"
                name="technicalStatus"
              >
                <option value="">Todos</option>
                <option value="ready">Listo</option>
                <option value="pending_approval">Pendiente de aprobación</option>
                <option value="error">Error</option>
              </select>
            </label>
            <label htmlFor="library-created-from">
              <span className="text-base font-semibold">Cargado desde</span>
              <input
                className={fieldClass}
                defaultValue={query.createdFrom ?? ""}
                id="library-created-from"
                name="createdFrom"
                type="date"
              />
            </label>
            <label htmlFor="library-created-to">
              <span className="text-base font-semibold">Cargado hasta</span>
              <input
                className={fieldClass}
                defaultValue={query.createdTo ?? ""}
                id="library-created-to"
                name="createdTo"
                type="date"
              />
            </label>
            {uploaders.length > 0 ? (
              <label htmlFor="library-created-by">
                <span className="text-base font-semibold">
                  Administrador que lo cargó
                </span>
                <select
                  className={fieldClass}
                  defaultValue={query.createdBy ?? ""}
                  id="library-created-by"
                  name="createdBy"
                >
                  <option value="">Todos</option>
                  {uploaders.map((uploader) => (
                    <option key={uploader.id} value={uploader.id}>
                      {uploader.fullName} ({uploader.documentCount})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label htmlFor="library-sort">
              <span className="text-base font-semibold">Ordenar por</span>
              <select
                className={fieldClass}
                defaultValue={query.sort}
                id="library-sort"
                name="sort"
              >
                <option value="newest">Más recientes (última versión)</option>
                <option value="oldest">Más antiguos (última versión)</option>
                <option value="year">Año (más reciente primero)</option>
                <option value="title">Título (A–Z)</option>
                <option value="upload_date">
                  Fecha de carga (más reciente primero)
                </option>
                <option value="document_type">Tipo documental (A–Z)</option>
                <option value="issuing_entity">Entidad emisora (A–Z)</option>
                <option value="situation">Situación (Vigente → Archivado)</option>
                <option value="technical_status">
                  Estado técnico (Error primero)
                </option>
                <option value="module">Módulo / submódulo</option>
              </select>
            </label>
          </fieldset>

          <div className={styles.advancedActions}>
            <button className="avend-button avend-button--primary" type="submit">
              Aplicar filtros
            </button>
          </div>
        </details>

        {activeFilterCount > 0 ? (
          <p className={styles.activeSummary}>
            <span>
              {`${activeFilterCount} ${activeFilterCount === 1 ? "filtro activo" : "filtros activos"}`}
            </span>
            <Link href={clearedLibraryFiltersHref(query, basePath)}>
              Limpiar filtros
            </Link>
          </p>
        ) : null}
      </form>

      <section aria-labelledby="document-library-results" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-xl font-bold" id="document-library-results">
            {resultsTitle}
          </h2>
          <p aria-live="polite" className="text-base text-avend-text-muted">
            {library.total} {library.total === 1 ? "documento" : "documentos"}
          </p>
        </div>

        {library.items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-avend-border bg-avend-surface p-6">
            <h3 className="text-lg font-bold">
              {activeFilterCount > 0
                ? "No encontramos coincidencias"
                : "Aún no hay documentos registrados"}
            </h3>
            <p className="mt-2 text-base leading-7 text-avend-text-muted">
              {activeFilterCount > 0
                ? "Prueba con menos filtros, revisa la ortografía o usa una palabra más general."
                : "La carga se realiza desde Módulos, dentro del módulo o submódulo correspondiente."}
            </p>
            {activeFilterCount === 0 ? (
              <Link
                className="mt-4 inline-flex min-h-11 items-center rounded-md bg-avend-navy px-4 text-base font-semibold text-white"
                href="/admin/modules"
              >
                Ir a Módulos
              </Link>
            ) : null}
          </div>
        ) : (
          <>
            {/*
              Cada documento ocupa dos filas: el título a lo ancho de toda la
              tabla (una sola línea; el texto completo va en el tooltip y en el
              detalle) y debajo sus datos. Antes el título vivía en una columna
              angosta y un nombre largo estiraba cada fila hacia abajo.
            */}
            <div
              aria-label="Tabla de documentos, desplazable horizontalmente"
              className="hidden overflow-x-auto rounded-xl border border-avend-border bg-avend-surface lg:block"
              role="region"
              tabIndex={0}
            >
              <table className={`${styles.table} w-full min-w-[60rem] border-collapse text-left text-base`}>
                <thead className="bg-avend-surface-muted text-avend-navy">
                  <tr>
                    <th className="px-4 py-3 font-bold" scope="col">
                      Tipo / número
                    </th>
                    <th className="px-3 py-3 font-bold" scope="col">
                      Año
                    </th>
                    <th className="px-3 py-3 font-bold" scope="col">
                      Entidad
                    </th>
                    <th className="px-3 py-3 font-bold" scope="col">
                      Módulo / Submódulo
                    </th>
                    <th className="px-3 py-3 font-bold" scope="col">
                      Situación
                    </th>
                    <th className="px-3 py-3 font-bold" scope="col">
                      Estado
                    </th>
                    <th className="px-3 py-3 font-bold" scope="col">
                      Fecha de carga
                    </th>
                    <th className={`${styles.actionsCell} px-3 py-3 text-right font-bold`} scope="col">
                      Acciones
                    </th>
                  </tr>
                </thead>
                {library.items.map((document) => (
                  <tbody className={styles.documentGroup} key={document.id}>
                    <tr>
                      <th className={styles.titleCell} colSpan={8} scope="rowgroup">
                        <Link
                          className={styles.titleLink}
                          href={`/admin/documents/${document.id}`}
                          title={document.title}
                        >
                          {document.title}
                        </Link>
                      </th>
                    </tr>
                    <tr className="align-top">
                      <td className="px-4 pb-4 pt-1 text-avend-text-muted">
                        {displayedDocumentType(document)}
                        {document.resolutionNumber
                          ? ` · ${document.resolutionNumber}`
                          : ""}
                        <MissingPdfNote document={document} />
                      </td>
                      <td className="px-3 pb-4 pt-1">
                        {document.issuanceYear ?? "—"}
                      </td>
                      <td className="px-3 pb-4 pt-1">
                        {displayedIssuingEntity(document)}
                      </td>
                      <td className="px-3 pb-4 pt-1">
                        <AssociationList
                          associations={document.moduleAssociations}
                        />
                      </td>
                      <td className="px-3 pb-4 pt-1">
                        <SituationBadge document={document} />
                      </td>
                      <td className="px-3 pb-4 pt-1">
                        <TechnicalBadge document={document} />
                      </td>
                      <td className="px-3 pb-4 pt-1">
                        <time dateTime={document.createdAt}>
                          {dateFormatter.format(new Date(document.createdAt))}
                        </time>
                        <span className="mt-1 block break-words text-avend-text-muted">
                          {document.createdByName ?? "Cuenta no disponible"}
                        </span>
                        <LastVersionDate document={document} />
                      </td>
                      <td className={`${styles.actionsCell} px-3 pb-4 pt-1`}>
                        <DocumentActions document={document} />
                      </td>
                    </tr>
                  </tbody>
                ))}
              </table>
            </div>

            <ul className="space-y-4 lg:hidden" role="list">
              {library.items.map((document) => (
                <li
                  className="rounded-xl border border-avend-border bg-avend-surface p-5 shadow-sm"
                  key={document.id}
                >
                  <Link
                    className={`${styles.cardTitle} text-lg`}
                    href={`/admin/documents/${document.id}`}
                    title={document.title}
                  >
                    {document.title}
                  </Link>
                  <p className="mt-1 text-base text-avend-text-muted">
                    {displayedDocumentType(document)}
                    {document.resolutionNumber
                      ? ` · ${document.resolutionNumber}`
                      : ""}
                  </p>
                  <MissingPdfNote document={document} />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <SituationBadge document={document} />
                    <TechnicalBadge document={document} />
                  </div>
                  <dl className="mt-4 grid gap-3 text-base">
                    <div>
                      <dt className="font-semibold">Año / entidad</dt>
                      <dd>
                        {document.issuanceYear ?? "—"} ·{" "}
                        {displayedIssuingEntity(document)}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold">Módulo / Submódulo</dt>
                      <dd>
                        <AssociationList
                          associations={document.moduleAssociations}
                        />
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold">
                        Fecha y responsable de carga
                      </dt>
                      <dd>
                        <time dateTime={document.createdAt}>
                          {dateFormatter.format(new Date(document.createdAt))}
                        </time>{" "}
                        · {document.createdByName ?? "Cuenta no disponible"}
                        <LastVersionDate document={document} />
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-5">
                    <DocumentActions document={document} variant="card" />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        {totalPages > 1 ? (
          <nav
            aria-label="Paginación de documentos"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-avend-border bg-avend-surface p-3"
          >
            <span className="text-base text-avend-text-muted">
              Página {query.page} de {totalPages}
            </span>
            <div className="flex gap-2">
              {query.page > 1 ? (
                <Link
                  className="inline-flex min-h-11 items-center rounded-md border border-avend-border px-4 text-base font-semibold"
                  href={documentLibraryHref(query, query.page - 1, basePath)}
                >
                  Anterior
                </Link>
              ) : null}
              {query.page < totalPages ? (
                <Link
                  className="inline-flex min-h-11 items-center rounded-md border border-avend-border px-4 text-base font-semibold"
                  href={documentLibraryHref(query, query.page + 1, basePath)}
                >
                  Siguiente
                </Link>
              ) : null}
            </div>
          </nav>
        ) : null}
      </section>
    </div>
  );
}
