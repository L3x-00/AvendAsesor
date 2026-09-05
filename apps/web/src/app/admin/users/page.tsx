import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { UsersManager } from "@/components/admin/users-manager";
import { ModulePermissionsManager } from "@/components/admin/module-permissions-manager";
import { createAuthorizedAdminApiContext } from "@/lib/admin-api/authorized-client";
import {
  formatOperationalAuditAction,
  formatOperationalAuditResourceType,
  formatUserRole,
} from "@/lib/admin-api/labels";
import {
  parseUserDirectoryQuery,
  USER_DIRECTORY_PAGE_SIZE,
  userDirectoryHref,
  type UserDirectorySearchParams,
} from "@/lib/admin-api/user-directory";

const auditDateFormatter = new Intl.DateTimeFormat("es-PE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Lima",
});

function formatAuditDate(value: string): string {
  return auditDateFormatter.format(new Date(value));
}

interface UsersPageProps {
  searchParams: Promise<UserDirectorySearchParams>;
}

export default async function UsersPage({ searchParams }: UsersPageProps) {
  const { access, client } = await createAuthorizedAdminApiContext();
  if (access.role !== "superadmin") redirect("/access-denied");
  const query = parseUserDirectoryQuery(await searchParams);
  const [userPage, events, modulePermissions] = await Promise.all([
    client.listAdministrativeUsers({
      group: query.group,
      limit: USER_DIRECTORY_PAGE_SIZE,
      offset: (query.page - 1) * USER_DIRECTORY_PAGE_SIZE,
      search: query.search,
      status: query.status === "all" ? undefined : query.status,
    }),
    client.listOperationalAuditEvents(),
    client.listAdminModulePermissions(),
  ]);

  if (query.page > 1 && userPage.items.length === 0 && userPage.total > 0) {
    redirect(
      userDirectoryHref({
        ...query,
        page: Math.ceil(userPage.total / userPage.limit),
      }),
    );
  }

  return (
    <AdminShell
      activeSection="users"
      description="Gestiona usuarios, administradores y accesos. Cada cambio de rol o estado exige un motivo y queda auditado; la autoridad es del servidor."
      modulesAccess={access.modulesAccess}
      title="Usuarios y accesos"
      userName={access.fullName}
      userRole={access.role}
    >
      <div className="flex flex-col gap-8">
        <UsersManager page={userPage} query={query} />
        <ModulePermissionsManager permissions={modulePermissions} />

        <section
          aria-labelledby="audit-title"
          className="avend-operation-section"
        >
          <h2 className="avend-section-title" id="audit-title">
            Actividad auditada
          </h2>
          {events.length === 0 ? (
            <p className="avend-content-empty">
              Aún no hay eventos administrativos para mostrar.
            </p>
          ) : (
            <div className="avend-audit-scroll">
              <table className="avend-audit-table">
                <thead>
                  <tr>
                    <th>Acción</th>
                    <th>Rol ejecutor</th>
                    <th>Recurso</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id}>
                      <td>{formatOperationalAuditAction(event.action)}</td>
                      <td>{formatUserRole(event.actorRole)}</td>
                      <td>
                        {formatOperationalAuditResourceType(event.resourceType)}
                      </td>
                      <td>{formatAuditDate(event.occurredAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
