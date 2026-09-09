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

function accessHref(
  documentId: string,
  disposition: "attachment" | "inline",
  versionId?: string | null,
): string {
  const params = new URLSearchParams({ disposition });
  if (versionId) params.set("versionId", versionId);
  return `/api/admin/documents/${documentId}/access?${params.toString()}`;
}

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

function DocumentActions({
  compact = false,
  document,
}: {
  compact?: boolean;
  document: DocumentLibraryItem;
}) {
  const actionClass = `inline-flex min-h-11 items-center justify-center rounded-md border border-avend-border bg-white px-3 py-2 text-base font-semibold text-avend-navy hover:bg-avend-soft-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-avend-accent ${compact ? "w-full" : ""}`;

  return (
    <div className={compact ? "grid gap-2" : "flex flex-wrap gap-2"}>
      <Link className={actionClass} href={`/admin/documents/${document.id}`}>
        Ver detalle
      </Link>
      {document.currentVersionId ? (
        <>
          <Link
            className={actionClass}
            href={`/admin/documents/${document.id}#pdf-viewer`}
          >
            Ver PDF
          </Link>
          <a
            className={actionClass}
            href={accessHref(
              document.id,
              "attachment",
              document.currentVersionId,
            )}
          >
            Descargar PDF
          </a>
        </>
      ) : (
        <span className="inline-flex min-h-11 items-center px-2 text-base font-medium text-avend-text-muted">
          Sin PDF disponible
        </span>
      )}
    </div>
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

  return (
    <div className="space-y-6">
      <form
        action={basePath}
        className="avend-elevated rounded-xl border border-avend-border bg-avend-surface p-5"
        method="get"
      >
        {lockLocation && query.moduleId ? (
          <input name="moduleId" type="hidden" value={query.moduleId} />
        ) : null}
        {lockLocation && query.submoduleId ? (
          <input name="submoduleId" type="hidden" value={query.submoduleId} />
        ) : null}
        <div className="grid gap-4 lg:grid-cols-12">
          <label className="block lg:col-span-8" htmlFor="library-search">
            <span className="text-base font-semibold">Buscar documento</span>
            <input
              className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
              defaultValue={query.q}
              id="library-search"
              maxLength={200}
              name="q"
              placeholder="Buscar documento..."
              type="search"
            />
            <span className="mt-1 block text-base text-avend-text-muted">
              Busca por título, número, entidad o palabras clave.
            </span>
          </label>
          <label className="block lg:col-span-4" htmlFor="library-sort">
            <span className="text-base font-semibold">Ordenar por</span>
            <select
              className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
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
              <option value="situation">
                Situación (Vigente → Archivado)
              </option>
              <option value="technical_status">
                Estado técnico (Error primero)
              </option>
              <option value="module">Módulo / submódulo</option>
            </select>
            <span className="mt-1 block text-base text-avend-text-muted">
              «Más recientes» usa la fecha de la última versión subida; «Fecha
              de carga» usa la fecha en que se registró el documento.
            </span>
          </label>

          <fieldset className="contents">
            <legend className="sr-only">Filtros de documentos</legend>
            <label className="block lg:col-span-2" htmlFor="library-year">
              <span className="text-base font-semibold">Año</span>
              <input
                className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
                defaultValue={query.issuanceYear ?? ""}
                id="library-year"
                inputMode="numeric"
                list="library-year-options"
                max={new Date().getFullYear()}
                min={1800}
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
            <label className="block lg:col-span-3" htmlFor="library-type">
              <span className="text-base font-semibold">Tipo documental</span>
              <select
                className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
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
            <label className="block lg:col-span-3" htmlFor="library-entity">
              <span className="text-base font-semibold">Entidad</span>
              <select
                className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
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
              <label className="block lg:col-span-4" htmlFor="library-module">
                <span className="text-base font-semibold">Módulo</span>
                <select
                  className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
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
              <label
                className="block lg:col-span-4"
                htmlFor="library-submodule"
              >
                <span className="text-base font-semibold">Submódulo</span>
                <select
                  className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
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
            <label className="block lg:col-span-4" htmlFor="library-situation">
              <span className="text-base font-semibold">Situación</span>
              <select
                className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
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
            <label className="block lg:col-span-4" htmlFor="library-technical">
              <span className="text-base font-semibold">Estado técnico</span>
              <select
                className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
                defaultValue={query.technicalStatus ?? ""}
                id="library-technical"
                name="technicalStatus"
              >
                <option value="">Todos</option>
                <option value="ready">Listo</option>
                <option value="pending_approval">
                  Pendiente de aprobación
                </option>
                <option value="error">Error</option>
              </select>
            </label>
            <label className="block lg:col-span-3" htmlFor="library-created-from">
              <span className="text-base font-semibold">
                Cargado desde
              </span>
              <input
                className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
                defaultValue={query.createdFrom ?? ""}
                id="library-created-from"
                name="createdFrom"
                type="date"
              />
            </label>
            <label className="block lg:col-span-3" htmlFor="library-created-to">
              <span className="text-base font-semibold">Cargado hasta</span>
              <input
                className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
                defaultValue={query.createdTo ?? ""}
                id="library-created-to"
                name="createdTo"
                type="date"
              />
            </label>
            {uploaders.length > 0 ? (
              <label
                className="block lg:col-span-6"
                htmlFor="library-created-by"
              >
                <span className="text-base font-semibold">
                  Administrador que lo cargó
                </span>
                <select
                  className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
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
          </fieldset>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            className="avend-button avend-button--primary inline-flex min-h-11 items-center justify-center rounded-md px-5 text-base font-semibold text-white"
            type="submit"
          >
            Aplicar búsqueda y filtros
          </button>
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-avend-border px-4 text-base font-semibold text-avend-navy hover:bg-avend-soft-blue"
            href={clearedLibraryFiltersHref(query, basePath)}
          >
            Limpiar filtros
          </Link>
          <span className="text-base text-avend-text-muted">
            {activeFilterCount === 0
              ? "Sin filtros activos"
              : `${activeFilterCount} ${activeFilterCount === 1 ? "filtro activo" : "filtros activos"}`}
          </span>
        </div>
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
            {/* La tabla desborda a propósito (min-w 64rem): el contenedor debe
                ser enfocable para poder desplazarlo solo con teclado. */}
            <div
              aria-label="Tabla de documentos, desplazable horizontalmente"
              className="hidden overflow-x-auto rounded-xl border border-avend-border bg-avend-surface lg:block"
              role="region"
              tabIndex={0}
            >
              <table className="w-full min-w-[64rem] table-fixed border-collapse text-left text-base">
                <thead className="bg-avend-surface-muted text-avend-navy">
                  <tr>
                    <th className="w-40 px-4 py-3 font-bold" scope="col">
                      Documento
                    </th>
                    <th className="w-16 px-3 py-3 font-bold" scope="col">
                      Año
                    </th>
                    <th className="w-24 px-3 py-3 font-bold" scope="col">
                      Entidad
                    </th>
                    <th className="w-32 px-3 py-3 font-bold" scope="col">
                      Módulo / Submódulo
                    </th>
                    <th className="w-32 px-3 py-3 font-bold" scope="col">
                      Situación
                    </th>
                    <th className="w-32 px-3 py-3 font-bold" scope="col">
                      Estado
                    </th>
                    <th className="w-32 px-3 py-3 font-bold" scope="col">
                      Fecha de carga
                    </th>
                    <th
                      className="sticky right-0 z-10 w-40 border-l border-avend-border bg-avend-surface-muted px-3 py-3 font-bold"
                      scope="col"
                    >
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {library.items.map((document) => (
                    <tr
                      className="border-t border-avend-border align-top"
                      key={document.id}
                    >
                      <th className="px-4 py-4 font-normal" scope="row">
                        <Link
                          className="font-bold text-avend-navy hover:underline"
                          href={`/admin/documents/${document.id}`}
                        >
                          {document.title}
                        </Link>
                        <span className="mt-1 block break-words text-avend-text-muted">
                          {displayedDocumentType(document)}
                          {document.resolutionNumber
                            ? ` · ${document.resolutionNumber}`
                            : ""}
                        </span>
                      </th>
                      <td className="px-3 py-4">
                        {document.issuanceYear ?? "—"}
                      </td>
                      <td className="px-3 py-4">
                        {displayedIssuingEntity(document)}
                      </td>
                      <td className="px-3 py-4">
                        <AssociationList
                          associations={document.moduleAssociations}
                        />
                      </td>
                      <td className="px-3 py-4">
                        <SituationBadge document={document} />
                      </td>
                      <td className="px-3 py-4">
                        <TechnicalBadge document={document} />
                      </td>
                      <td className="px-3 py-4">
                        <time dateTime={document.createdAt}>
                          {dateFormatter.format(new Date(document.createdAt))}
                        </time>
                        <span className="mt-1 block break-words text-avend-text-muted">
                          {document.createdByName ?? "Cuenta no disponible"}
                        </span>
                        <LastVersionDate document={document} />
                      </td>
                      <td className="sticky right-0 w-40 border-l border-avend-border bg-avend-surface px-3 py-4">
                        <DocumentActions compact document={document} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="space-y-4 lg:hidden" role="list">
              {library.items.map((document) => (
                <li
                  className="rounded-xl border border-avend-border bg-avend-surface p-5 shadow-sm"
                  key={document.id}
                >
                  <Link
                    className="text-lg font-bold text-avend-navy hover:underline"
                    href={`/admin/documents/${document.id}`}
                  >
                    {document.title}
                  </Link>
                  <p className="mt-1 text-base text-avend-text-muted">
                    {displayedDocumentType(document)}
                    {document.resolutionNumber
                      ? ` · ${document.resolutionNumber}`
                      : ""}
                  </p>
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
                    <DocumentActions document={document} />
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
