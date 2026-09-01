import { AdminShell } from "@/components/admin/admin-shell";
import { ModulesExplorer } from "@/components/admin/modules-explorer";
import { createAuthorizedAdminApiContext } from "@/lib/admin-api/authorized-client";
import {
  parentOptions,
  rootModuleViews,
} from "@/lib/admin-api/module-hierarchy";

export default async function ModulesPage() {
  const { access, client } = await createAuthorizedAdminApiContext();
  const modules = await client.listModules("all");

  return (
    <AdminShell
      activeSection="modules"
      description="Organiza la biblioteca por módulos y submódulos. Entra a un módulo para ver sus submódulos; los documentos se gestionan en Historial de documentos."
      title="Módulos"
      userName={access.fullName}
      userRole={access.role}
    >
      <ModulesExplorer
        context={{ kind: "root" }}
        modules={rootModuleViews(modules)}
        parents={parentOptions(modules)}
      />
    </AdminShell>
  );
}
