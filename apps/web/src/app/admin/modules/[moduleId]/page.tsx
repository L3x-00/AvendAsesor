import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { DocumentUploadPanel } from "@/components/admin/document-upload-panel";
import {
  ModuleManageDetails,
  ModulesExplorer,
} from "@/components/admin/modules-explorer";
import { createAuthorizedAdminApiContext } from "@/lib/admin-api/authorized-client";
import { getAdminApiUrl } from "@/lib/admin-api/config";
import {
  formatDocumentSituation,
  getDocumentTechnicalStatusContent,
} from "@/lib/admin-api/labels";
import {
  childModuleViews,
  findVisibleModule,
  parentOptions,
  toModuleView,
} from "@/lib/admin-api/module-hierarchy";

interface ModuleDetailPageProps {
  params: Promise<{ moduleId: string }>;
}

export default async function ModuleDetailPage({
  params,
}: ModuleDetailPageProps) {
  const { moduleId } = await params;
  const { access, client } = await createAuthorizedAdminApiContext();
  const modules = await client.listModules("all");
  const current = findVisibleModule(modules, moduleId);

  if (!current) {
    notFound();
  }

  const currentView = toModuleView(current, modules);
  const children = childModuleViews(modules, moduleId);
  const parents = parentOptions(modules);
  const library = await client.listDocumentLibrary({
    limit: 10,
    ...(current.parentModuleId
      ? { submoduleId: current.id }
      : { moduleId: current.id }),
  });
  const canUpload = current.isActive && children.length === 0;
  const libraryHref = current.parentModuleId
    ? `/admin/documents?submoduleId=${encodeURIComponent(current.id)}`
    : `/admin/documents?moduleId=${encodeURIComponent(current.id)}`;

  return (
    <AdminShell
      activeSection="modules"
      description="Organiza la estructura y carga documentos en el módulo o submódulo correspondiente. El Historial conserva la consulta general."
      title={current.name}
      userName={access.fullName}
      userRole={access.role}
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

        <ModulesExplorer
          context={{
            kind: "module",
            moduleId: current.id,
            moduleName: current.name,
          }}
          modules={children}
          parents={parents}
        />

        {canUpload ? (
          <DocumentUploadPanel
            apiBaseUrl={getAdminApiUrl()}
            moduleId={current.id}
            moduleName={current.name}
          />
        ) : children.length > 0 ? (
          <p className="rounded-xl border border-dashed border-avend-border bg-avend-surface p-5 text-base text-avend-text-muted">
            Selecciona uno de los submódulos para agregar el documento en la
            ubicación correcta.
          </p>
        ) : null}

        <section
          aria-labelledby="module-documents-title"
          className="rounded-xl border border-avend-border bg-avend-surface p-5"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-xl font-bold" id="module-documents-title">
              Documentos asociados
            </h2>
            <Link
              className="inline-flex min-h-11 items-center rounded-md border border-avend-border px-4 text-base font-semibold text-avend-navy hover:bg-avend-soft-blue"
              href={libraryHref}
            >
              Ver en Historial
            </Link>
          </div>
          {library.items.length === 0 ? (
            <p className="mt-4 rounded-md border border-dashed border-avend-border p-4 text-base text-avend-text-muted">
              No hay documentos asociados a esta ubicación.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-avend-border" role="list">
              {library.items.map((document) => (
                <li
                  className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                  key={document.id}
                >
                  <div>
                    <h3 className="text-base font-bold">{document.title}</h3>
                    <p className="mt-1 text-base text-avend-text-muted">
                      {formatDocumentSituation(document.situation)} ·{" "}
                      {
                        getDocumentTechnicalStatusContent(
                          document.technicalStatus,
                        ).label
                      }
                    </p>
                  </div>
                  <Link
                    className="inline-flex min-h-11 items-center justify-center rounded-md border border-avend-border px-4 text-base font-semibold text-avend-navy hover:bg-avend-soft-blue"
                    href={`/admin/documents/${document.id}`}
                  >
                    Ver detalle
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
