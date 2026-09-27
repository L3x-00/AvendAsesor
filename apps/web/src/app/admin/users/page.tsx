import { redirect } from "next/navigation";
import { AdminPage } from "@/components/admin/admin-page";
import { UsersManager } from "@/components/admin/users-manager";
import { ModulePermissionsManager } from "@/components/admin/module-permissions-manager";
import { toDateInputValue } from "@/lib/admin-api/access-window";
import { getAdminApiUrl } from "@/lib/admin-api/config";
import { createAuthorizedAdminApiContext } from "@/lib/admin-api/authorized-client";
import {
  formatOperationalAuditAction,
  formatOperationalAuditDetail,
  formatOperationalAuditResourceType,
  formatUserRole,
} from "@/lib/admin-api/labels";
import {
  accessStateFilter,
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
  const [userPage, counts, events, modulePermissions] = await Promise.all([
    client.listAdministrativeUsers({
      accessState: accessStateFilter(query.status),
      group: query.group,
      limit: USER_DIRECTORY_PAGE_SIZE,
      offset: (query.page - 1) * USER_DIRECTORY_PAGE_SIZE,
      search: query.search,
    }),
    client.countAdministrativeUsers({
      group: query.group,
      search: query.search,
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
    <AdminPage
      description="Gestiona usuarios, administradores y accesos. Cada cambio de rol o estado exige un motivo y queda auditado; la autoridad es del servidor."
      title="Usuarios y accesos"
    >
      <div className="flex flex-col gap-8">
        <UsersManager
          apiBaseUrl={getAdminApiUrl()}
          counts={counts}
          page={userPage}
          query={query}
          today={toDateInputValue(new Date().toISOString())}
        />
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
              {/* Roles explícitos: en el celular la tabla se muestra como tarjetas y
                  algunos navegadores pierden la semántica de tabla. */}
              <table className="avend-audit-table" role="table">
                <thead role="rowgroup">
                  <tr role="row">
                    <th role="columnheader">Acción</th>
                    <th role="columnheader">Rol ejecutor</th>
                    <th role="columnheader">Recurso</th>
                    <th role="columnheader">Detalle</th>
                    <th role="columnheader">Fecha</th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {events.map((event) => (
                    <tr key={event.id} role="row">
                      <td data-label="Acción" role="cell">
                        {formatOperationalAuditAction(event.action)}
                      </td>
                      <td data-label="Rol ejecutor" role="cell">
                        {formatUserRole(event.actorRole)}
                      </td>
                      <td data-label="Recurso" role="cell">
                        {formatOperationalAuditResourceType(event.resourceType)}
                      </td>
                      <td data-label="Detalle" role="cell">
                        {formatOperationalAuditDetail(event) ?? "—"}
                      </td>
                      <td data-label="Fecha" role="cell">
                        {formatAuditDate(event.occurredAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AdminPage>
  );
}
