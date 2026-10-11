import { redirect } from "next/navigation";
import { AdminPage } from "@/components/admin/admin-page";
import { UsersManager } from "@/components/admin/users-manager";
import { UserAuditActivity } from "@/components/admin/user-audit-activity";
import { ModulePermissionsManager } from "@/components/admin/module-permissions-manager";
import { toDateInputValue } from "@/lib/admin-api/access-window";
import { getAdminApiUrl } from "@/lib/admin-api/config";
import { createAuthorizedAdminApiContext } from "@/lib/admin-api/authorized-client";
import {
  accessStateFilter,
  parseUserDirectoryQuery,
  USER_DIRECTORY_PAGE_SIZE,
  userDirectoryHref,
  type UserDirectorySearchParams,
} from "@/lib/admin-api/user-directory";

interface UsersPageProps {
  searchParams: Promise<UserDirectorySearchParams>;
}

export default async function UsersPage({ searchParams }: UsersPageProps) {
  const { access, client } = await createAuthorizedAdminApiContext();
  if (access.role !== "superadmin") redirect("/access-denied");
  const query = parseUserDirectoryQuery(await searchParams);
  const [userPage, counts, events, modulePermissions, modules] =
    await Promise.all([
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
      client.listModuleSummaries("all"),
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
          modules={modules.map((module) => ({
            id: module.id,
            name: module.name,
            parentModuleId: module.parentModuleId,
          }))}
          page={userPage}
          query={query}
          today={toDateInputValue(new Date().toISOString())}
        />
        <ModulePermissionsManager
          modules={modules.map((module) => ({
            id: module.id,
            name: module.name,
            parentModuleId: module.parentModuleId,
          }))}
          permissions={modulePermissions}
        />

        <section
          aria-labelledby="audit-title"
          className="avend-operation-section"
        >
          <h2 className="avend-section-title" id="audit-title">
            Actividad auditada
          </h2>
          <UserAuditActivity events={events} />
        </section>
      </div>
    </AdminPage>
  );
}
