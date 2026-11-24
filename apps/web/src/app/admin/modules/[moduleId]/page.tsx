import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import styles from "@/components/admin/modules-explorer.module.css";
import { DocumentLibraryView } from "@/components/admin/document-library-view";
import { ModuleContentSections } from "@/components/admin/module-content-sections";
import { DocumentUploadPanel } from "@/components/admin/document-upload-panel";
import {
  ModuleDetailHero,
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
  const children = childModuleViews(modules, moduleId);
  const parents = parentOptions(modules);
  // Un submódulo se presenta dentro de su módulo: la ruta y la ficha lo sitúan
  // sin obligar a volver a la lista para saber dónde está.
  const parentModule = current.parentModuleId
    ? modules.find((module) => module.id === current.parentModuleId)
    : undefined;
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
  // Cabecera y ficha comunes a los dos estados de la página (con o sin permiso
  // de gestión), para que el módulo se vea igual en ambos casos.
  const pageFrame = (content: ReactNode) => (
    <>
      <header className={styles.detailHeader}>
        <Link className={styles.backLink} href="/admin/modules">
          <span aria-hidden="true" className={styles.backIcon}>
            <svg
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </span>
          Volver a módulos
        </Link>
        <p className={styles.detailEyebrow}>
          {parentModule
            ? `Administración · Módulos · ${parentModule.name}`
            : "Administración · Módulos"}
        </p>
      </header>
      <div className={styles.pageBody}>
        <div className="avend-admin-content">
          <div className={styles.detailStack}>
            <ModuleDetailHero
              canManage={current.canManage !== false}
              module={currentView}
              parentName={parentModule?.name}
              parents={parents}
            />
            {content}
          </div>
        </div>
      </div>
    </>
  );
  if (current.canManage === false) {
    return pageFrame(
      <div className="space-y-6">
        <p className="text-base text-avend-text-muted">
          Selecciona uno de los submódulos asignados para consultar su
          contenido.
        </p>
        <ModulesExplorer
          canCreate={false}
          context={explorerContext}
          modules={children}
          parents={parents}
        />
      </div>,
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

  return pageFrame(
    <div className="flex flex-col gap-6">
      {!current.isActive ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-4 text-base text-amber-900">
          Este módulo está inactivo. Actívalo antes de cargar un documento.
        </p>
      ) : null}

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
    </div>,
  );
}
