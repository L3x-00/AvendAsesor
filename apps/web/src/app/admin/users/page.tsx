import { redirect } from "next/navigation";
import { AdminActionForm } from "@/components/admin/admin-action-form";
import { AdminShell } from "@/components/admin/admin-shell";
import { updateAdministrativeUserAction } from "../actions";
import { createAuthorizedAdminApiClient } from "@/lib/admin-api/authorized-client";
import {
  formatAccountStatus,
  formatOperationalAuditAction,
  formatOperationalAuditResourceType,
  formatUserRole,
} from "@/lib/admin-api/labels";
import {
  resolveAdminAccess,
  type AuthorizationSupabaseClient,
} from "@/lib/authorization/resolve-admin-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function formatDate(value: string | null): string {
  if (!value) return "Sin acceso registrado";
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function UsersPage() {
  const supabase = await createServerSupabaseClient();
  const access = await resolveAdminAccess(
    supabase as unknown as AuthorizationSupabaseClient,
  );

  if (access.status === "unauthenticated") redirect("/auth/sign-in");
  if (access.status !== "authorized" || access.role !== "superadmin")
    redirect("/access-denied");

  const client = await createAuthorizedAdminApiClient();
  const [users, events] = await Promise.all([
    client.listAdministrativeUsers(),
    client.listOperationalAuditEvents(),
  ]);

  return (
    <AdminShell
      activeSection="users"
      description="Solo el superadministrador puede actualizar roles y estados de cuenta. Cada cambio exige un motivo y queda auditado."
      isSuperadmin
      title="Usuarios y auditoría"
    >
      <section aria-labelledby="users-title">
        <h2 className="avend-section-title" id="users-title">
          Usuarios registrados
        </h2>
        <div className="avend-superadmin-list">
          {users.map((user) => (
            <article className="avend-superadmin-user" key={user.id}>
              <div>
                <h3>{user.fullName}</h3>
                <p>
                  Rol: <strong>{formatUserRole(user.role)}</strong> · Estado:{" "}
                  <strong>{formatAccountStatus(user.accountStatus)}</strong>
                </p>
                <p>Último acceso: {formatDate(user.lastAccessAt)}</p>
              </div>
              <AdminActionForm
                action={updateAdministrativeUserAction}
                className="avend-superadmin-user-form"
                submitLabel="Actualizar usuario"
              >
                <input name="userId" type="hidden" value={user.id} />
                <label htmlFor={`user-role-${user.id}`}>
                  Rol
                  <select
                    defaultValue="__keep__"
                    id={`user-role-${user.id}`}
                    name="role"
                  >
                    <option value="__keep__">Mantener rol actual</option>
                    <option value="docente">Docente</option>
                    <option value="admin">Administrador</option>
                    <option value="superadmin">Superadministrador</option>
                  </select>
                </label>
                <label htmlFor={`user-status-${user.id}`}>
                  Estado
                  <select
                    defaultValue="__keep__"
                    id={`user-status-${user.id}`}
                    name="accountStatus"
                  >
                    <option value="__keep__">Mantener estado actual</option>
                    <option value="active">Activa</option>
                    <option value="suspended">Suspendida</option>
                  </select>
                </label>
                <label htmlFor={`user-reason-${user.id}`}>
                  Motivo
                  <textarea
                    id={`user-reason-${user.id}`}
                    maxLength={500}
                    minLength={4}
                    name="reason"
                    required
                    rows={3}
                  />
                </label>
              </AdminActionForm>
            </article>
          ))}
        </div>
      </section>
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
                    <td>{formatDate(event.occurredAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminShell>
  );
}
