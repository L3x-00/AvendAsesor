import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import {
  ModuleManageDetails,
  ModulesExplorer,
} from "@/components/admin/modules-explorer";
import { createAuthorizedAdminApiContext } from "@/lib/admin-api/authorized-client";
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

  return (
    <AdminShell
      activeSection="modules"
      description="Revisa y organiza los submódulos de este módulo. Los documentos se cargan y consultan en Historial de documentos."
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

        <section className="avend-elevated rounded-lg border border-avend-border bg-avend-surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">{current.name}</h2>
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
            <span className="flex-none rounded-full bg-avend-surface-muted px-2 py-1 text-base font-semibold text-avend-text">
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

          {children.length === 0 ? (
            <p className="mt-4 rounded-md border border-dashed border-avend-border p-4 text-base text-avend-text-muted">
              Este módulo no tiene submódulos: sus documentos se asocian
              directamente al módulo.{" "}
              <Link
                className="font-semibold text-avend-accent-strong hover:underline"
                href="/admin/documents"
              >
                Ver documentos
              </Link>
              .
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
      </div>
    </AdminShell>
  );
}
