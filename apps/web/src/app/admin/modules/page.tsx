import { AdminShell } from "@/components/admin/admin-shell";
import { ModulesExplorer } from "@/components/admin/modules-explorer";
import { createAuthorizedAdminApiContext } from "@/lib/admin-api/authorized-client";
import {
  parentOptions,
  rootModuleViews,
} from "@/lib/admin-api/module-hierarchy";

export default async function ModulesPage() {
  const { access, client } = await createAuthorizedAdminApiContext({
    requireModulesAccess: true,
  });
  const modules = await client.listModuleSummaries("all");

  return (
    <AdminShell
      activeSection="modules"
      description="Organiza la biblioteca por módulos y submódulos. La carga principal se realiza dentro del módulo o submódulo correspondiente."
      title="Módulos"
      modulesAccess={access.modulesAccess}
      userName={access.fullName}
      userRole={access.role}
    >
      <div className="space-y-6">
        <nav aria-label="Ruta de navegación" className="text-base">
          <ol className="flex items-center text-avend-text-muted">
            <li aria-current="page" className="font-semibold text-avend-text">
              Módulos
            </li>
          </ol>
        </nav>
        <ModulesExplorer
          context={{ kind: "root" }}
          modules={rootModuleViews(modules)}
          parents={parentOptions(modules)}
        />
      </div>
    </AdminShell>
  );
}
