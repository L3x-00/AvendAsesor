import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminPage } from "@/components/admin/admin-page";
import { DocumentLibraryView } from "@/components/admin/document-library-view";
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
  const requestedQuery = parseDocumentLibraryQuery(await searchParams);
  const scopedQuery = {
    ...requestedQuery,
    moduleId: current.parentModuleId ? undefined : current.id,
    submoduleId: current.parentModuleId ? current.id : undefined,
  };
  const [library, suggestions, replacementCandidates] = await Promise.all([
    client.listDocumentLibrary(scopedQuery),
    client.getDocumentSuggestions(),
    listReplacementDocumentCandidates(client),
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

  const canUpload = current.isActive && children.length === 0;
  const activeFilterCount = Math.max(
    0,
    countDocumentLibraryFilters(scopedQuery) - 1,
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

          <div className="mt-4">
            <ModuleManageDetails
              module={currentView}
              parents={parents}
              summary="Editar este módulo, cambiar estado o darlo de baja"
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
            context={{
              kind: "module",
              moduleId: current.id,
              moduleName: current.name,
            }}
            modules={children}
            parents={parents}
          />
        )}

        {canUpload ? (
          <DocumentUploadPanel
            apiBaseUrl={getAdminApiUrl()}
            moduleId={current.id}
            moduleName={current.name}
            replacementCandidates={replacementCandidates}
            suggestions={suggestions}
          />
        ) : children.length > 0 ? (
          <p className="rounded-xl border border-dashed border-avend-border bg-avend-surface p-5 text-base text-avend-text-muted">
            Selecciona uno de los submódulos para agregar el documento en la
            ubicación correcta.
          </p>
        ) : null}

        {children.length === 0 ? (
          <DocumentLibraryView
            activeFilterCount={activeFilterCount}
            basePath={`/admin/modules/${current.id}`}
            library={library}
            lockLocation
            modules={modules}
            query={scopedQuery}
            resultsTitle="Documentos cargados"
          />
        ) : null}
      </div>
    </AdminPage>
  );
}
