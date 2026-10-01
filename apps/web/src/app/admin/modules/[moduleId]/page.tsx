import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminPage } from "@/components/admin/admin-page";
import { DocumentLibraryView } from "@/components/admin/document-library-view";
import { ModuleContentSections } from "@/components/admin/module-content-sections";
import { DocumentUploadPanel } from "@/components/admin/document-upload-panel";
import {
  ModuleManageDetails,
  ModulesExplorer,
} from "@/components/admin/modules-explorer";
import { createAuthorizedAdminApiContext } from "@/lib/admin-api/authorized-client";
import { getAdminApiUrl } from "@/lib/admin-api/config";
import {
  countDocumentLibraryFilters,
  documentLibraryHref,
  parseDocumentLibraryQuery,
  type DocumentLibrarySearchParams,
} from "@/lib/admin-api/document-library-query";
import {
  childModuleViews,
  findVisibleModule,
  parentOptions,
  toModuleView,
} from "@/lib/admin-api/module-hierarchy";
import {
  contextualUploadDefaults,
  currentLimaYear,
  libraryPageCoversModule,
  listModuleContentDocuments,
  parseContentSectionParam,
  type ModuleContentDocuments,
} from "@/lib/admin-api/module-content";
import { listReplacementDocumentCandidates } from "@/lib/admin-api/replacement-candidates";

interface ModuleDetailPageProps {
  params: Promise<{ moduleId: string }>;
  searchParams: Promise<DocumentLibrarySearchParams>;
}

export default async function ModuleDetailPage({
  params,
  searchParams,
}: ModuleDetailPageProps) {
  const { moduleId } = await params;
  const { client } = await createAuthorizedAdminApiContext({
    requireModulesAccess: true,
  });
  const modules = await client.listModuleSummaries("all");
  const current = findVisibleModule(modules, moduleId);

  if (!current) {
    notFound();
  }

  const currentView = toModuleView(current);
  const parent = current.parentModuleId
    ? findVisibleModule(modules, current.parentModuleId)
    : undefined;
  const children = childModuleViews(modules, moduleId);
  const parents = parentOptions(modules);
  // Contexto del explorador de submódulos: un padre inactivo solo admite
  // submódulos inactivos, y un módulo con documentos propios no admite
  // submódulos (la base de datos lo rechazaría).
  const explorerContext = {
    hasDirectDocuments: children.length === 0 && current.documentCount > 0,
    kind: "module" as const,
    moduleId: current.id,
    moduleIsActive: current.isActive,
    moduleName: current.name,
  };
  if (current.canManage === false) {
    return (
      <AdminPage
        description="Selecciona uno de los submódulos asignados para consultar su contenido."
        title={current.name}
      >
        <div className="space-y-6">
          <Link className="text-base underline" href="/admin/modules">
            Volver a módulos
          </Link>
          <ModulesExplorer
            canCreate={false}
            context={explorerContext}
            modules={children}
            parents={parents}
          />
        </div>
      </AdminPage>
    );
  }
  const requestedSearch = await searchParams;
  const createdModuleId =
    typeof requestedSearch.creado === "string"
      ? requestedSearch.creado
      : undefined;
  const requestedQuery = parseDocumentLibraryQuery(requestedSearch);
  // «Cargar documento en este tema» (desde Consultas y reportes) abre el formulario.
  const openUpload = requestedSearch.cargar === "1";
  // Enlaces antiguos de «+ Subir …» (`?cargar=1&tipo=ANEXO`): hoy abren la
  // ventana de carga de esa sección en «Contenido del tema».
  const requestedSection = openUpload
    ? parseContentSectionParam(requestedSearch.tipo)
    : undefined;
  const scopedQuery = {
    ...requestedQuery,
    moduleId: current.parentModuleId ? undefined : current.id,
    submoduleId: current.parentModuleId ? current.id : undefined,
  };
  const isLeaf = children.length === 0;
  const activeFilterCount = Math.max(
    0,
    countDocumentLibraryFilters(scopedQuery) - 1,
  );
  const contentScope = {
    moduleId: scopedQuery.moduleId,
    submoduleId: scopedQuery.submoduleId,
  };
  // «Contenido del tema» muestra TODOS los documentos del tema, sin los
  // filtros ni la paginación de «Documentos cargados». Con filtros o fuera de
  // la primera página se sabe de antemano que hace falta una consulta propia.
  const needsOwnContentQuery =
    isLeaf && (activeFilterCount > 0 || scopedQuery.page > 1);
  const [library, suggestions, replacementCandidates, ownContent] =
    await Promise.all([
      client.listDocumentLibrary(scopedQuery),
      client.getDocumentSuggestions(),
      listReplacementDocumentCandidates(client),
      needsOwnContentQuery
        ? listModuleContentDocuments(client, contentScope)
        : Promise.resolve(undefined),
    ]);
  // Una página fuera de rango devuelve 0 filas y total 0, lo que borra la
  // paginación y deja al administrador atrapado en una pantalla vacía que
  // además dice "Aún no hay documentos registrados".
  if (scopedQuery.page > 1 && library.items.length === 0) {
    const firstPage = await client.listDocumentLibrary({
      ...scopedQuery,
      offset: 0,
    });
    if (firstPage.total > 0) {
      redirect(
        documentLibraryHref(
          scopedQuery,
          Math.ceil(firstPage.total / firstPage.limit),
          `/admin/modules/${current.id}`,
        ),
      );
    }
  }

  const canUpload = current.isActive && isLeaf;
  let moduleContent: ModuleContentDocuments = { complete: true, documents: [] };
  if (isLeaf) {
    // Sin filtros, la primera página ya trae todo el tema cuando cabe en ella:
    // se reutiliza y no se hace otra consulta.
    moduleContent =
      ownContent ??
      (libraryPageCoversModule(library, {
        activeFilterCount,
        page: scopedQuery.page,
      })
        ? { complete: true, documents: library.items }
        : await listModuleContentDocuments(client, contentScope));
  }
  // Año actual y la entidad y dependencia más frecuentes del tema: la carga
  // por sección los muestra ya completos, con «Cambiar».
  const uploadDefaults = contextualUploadDefaults(
    moduleContent.documents,
    currentLimaYear(),
  );

  return (
    <AdminPage
      description="Organiza la estructura y carga documentos en el módulo o submódulo correspondiente. El Historial conserva la consulta general."
      title={current.name}
    >
      <div className="flex flex-col gap-6">
        <nav aria-label="Ruta de navegación" className="text-base">
          <ol className="flex flex-wrap items-center gap-2 text-avend-text-muted">
            <li>
              <Link className="hover:underline" href="/admin/modules">
                Módulos
              </Link>
            </li>
            <li aria-hidden="true">›</li>
            {parent ? (
              <>
                <li>
                  <Link
                    className="hover:underline"
                    href={`/admin/modules/${parent.id}`}
                  >
                    {parent.name}
                  </Link>
                </li>
                <li aria-hidden="true">›</li>
              </>
            ) : null}
            <li aria-current="page" className="font-semibold text-avend-text">
              {current.name}
            </li>
          </ol>
        </nav>

        <section className="avend-elevated rounded-xl border border-avend-border bg-avend-surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">{current.name}</h2>
              <p className="mt-1 text-base text-avend-text-muted">
                Código {current.code} · Orden {current.sortOrder} ·{" "}
                {current.isActive ? "Activo" : "Inactivo"}
              </p>
              {current.description ? (
                <p className="mt-2 text-base text-avend-text">
                  {current.description}
                </p>
              ) : null}
            </div>
            <span className="flex-none rounded-full bg-avend-surface-muted px-3 py-1 text-base font-semibold text-avend-text">
              {current.parentModuleId ? "Submódulo" : "Módulo principal"}
            </span>
          </div>

          <div className="mt-2 flex justify-end">
            <ModuleManageDetails
              module={currentView}
              parents={parents}
              summary="Editar este módulo"
            />
          </div>

          {!current.isActive ? (
            <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-4 text-base text-amber-900">
              Este módulo está inactivo. Actívalo antes de cargar un documento.
            </p>
          ) : null}
        </section>

        {current.parentModuleId ? null : (
          <ModulesExplorer
            canCreate
            context={explorerContext}
            initialHighlightId={createdModuleId}
            modules={children}
            parents={parents}
          />
        )}

        {canUpload ? (
          <DocumentUploadPanel
            apiBaseUrl={getAdminApiUrl()}
            defaultOpen={openUpload && !requestedSection}
            key={`document-upload-${
              openUpload && !requestedSection ? "open" : "closed"
            }`}
            moduleId={current.id}
            moduleName={current.name}
            replacementCandidates={replacementCandidates}
            suggestions={suggestions}
          />
        ) : children.length > 0 ? (
          <p className="rounded-xl border border-dashed border-avend-border bg-avend-surface p-5 text-base text-avend-text-muted">
            Los documentos se cargan dentro de cada submódulo. Para subir
            normativa, cronogramas, anexos o preguntas frecuentes, entra en el
            submódulo correspondiente de la lista de arriba.
          </p>
        ) : null}

        {isLeaf ? (
          <>
            <ModuleContentSections
              apiBaseUrl={getAdminApiUrl()}
              canUpload={canUpload}
              complete={moduleContent.complete}
              documents={moduleContent.documents}
              initialUploadSection={requestedSection}
              key={`module-content-${requestedSection ?? "none"}`}
              moduleId={current.id}
              moduleName={current.name}
              suggestions={suggestions}
              uploadBlockedReason={
                current.isActive
                  ? undefined
                  : "Este módulo está inactivo: actívalo para subir documentos en estas secciones."
              }
              uploadDefaults={uploadDefaults}
            />
            <DocumentLibraryView
              activeFilterCount={activeFilterCount}
              basePath={`/admin/modules/${current.id}`}
              library={library}
              lockLocation
              modules={modules}
              query={scopedQuery}
              resultsTitle="Documentos cargados"
            />
          </>
        ) : null}
      </div>
    </AdminPage>
  );
}
