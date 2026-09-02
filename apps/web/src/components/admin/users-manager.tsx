"use client";

import Link from "next/link";
import { useId } from "react";
import { updateAdministrativeUserAction } from "@/app/admin/actions";
import { AdminActionForm } from "@/components/admin/admin-action-form";
import { formatAccountStatus, formatUserRole } from "@/lib/admin-api/labels";
import type {
  AdministrativeUser,
  AdministrativeUserPage,
} from "@/lib/admin-api/types";
import {
  userDirectoryHref,
  type ParsedUserDirectoryQuery,
  type UserGroup,
  type UserStatusFilter,
} from "@/lib/admin-api/user-directory";
import styles from "./users-manager.module.css";

interface UsersManagerProps {
  page: AdministrativeUserPage;
  query: ParsedUserDirectoryQuery;
}

const accessDateFormatter = new Intl.DateTimeFormat("es-PE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Lima",
});

function formatAccess(value: string | null): string {
  if (!value) return "Sin acceso registrado";
  return accessDateFormatter.format(new Date(value));
}

const GROUPS: ReadonlyArray<{ group: UserGroup; label: string }> = [
  { group: "docente", label: "Docentes" },
  { group: "staff", label: "Equipo administrador" },
];

const STATUS_FILTERS: ReadonlyArray<{
  label: string;
  value: UserStatusFilter;
}> = [
  { label: "Todos", value: "all" },
  { label: "Activos", value: "active" },
  { label: "Pausados", value: "suspended" },
];

function UserEditForm({ user }: { user: AdministrativeUser }) {
  const fieldId = useId();

  return (
    <details className={styles.manage}>
      <summary className={styles.manageSummary}>Editar acceso</summary>
      <AdminActionForm
        action={updateAdministrativeUserAction}
        className={styles.form}
        submitLabel="Actualizar usuario"
      >
        <input name="userId" type="hidden" value={user.id} />
        <label className={styles.fieldLabel} htmlFor={`${fieldId}-role`}>
          Rol
        </label>
        <select
          className={styles.input}
          defaultValue="__keep__"
          id={`${fieldId}-role`}
          name="role"
        >
          <option value="__keep__">Mantener rol actual</option>
          <option value="docente">Docente</option>
          <option value="admin">Administrador</option>
          <option value="superadmin">Superadministrador</option>
        </select>
        <label className={styles.fieldLabel} htmlFor={`${fieldId}-status`}>
          Estado
        </label>
        <select
          className={styles.input}
          defaultValue="__keep__"
          id={`${fieldId}-status`}
          name="accountStatus"
        >
          <option value="__keep__">Mantener estado actual</option>
          <option value="active">Activo</option>
          <option value="suspended">Pausado</option>
        </select>
        <label className={styles.fieldLabel} htmlFor={`${fieldId}-reason`}>
          Motivo (queda auditado)
        </label>
        <textarea
          className={styles.textarea}
          id={`${fieldId}-reason`}
          maxLength={500}
          minLength={4}
          name="reason"
          required
          rows={3}
        />
      </AdminActionForm>
    </details>
  );
}

/**
 * Server-filtered and paginated administrative user directory. The browser
 * receives only the requested page; the API remains the authority for data,
 * role changes and account-state changes.
 */
export function UsersManager({ page, query }: UsersManagerProps) {
  const searchId = useId();
  const totalPages = Math.max(1, Math.ceil(page.total / page.limit));
  const firstVisible = page.total === 0 ? 0 : page.offset + 1;
  const lastVisible =
    page.items.length === 0 ? 0 : page.offset + page.items.length;

  return (
    <div className={styles.manager}>
      <p className={styles.notice} role="note">
        <strong>Vista de superadministrador.</strong> Puedes consultar todos los
        usuarios y gestionar sus accesos; cada cambio queda auditado.
      </p>

      <div className={styles.tabs} role="group" aria-label="Tipo de usuario">
        {GROUPS.map((item) => (
          <Link
            aria-current={query.group === item.group ? "page" : undefined}
            className={
              query.group === item.group
                ? `${styles.tab} ${styles.tabActive}`
                : styles.tab
            }
            href={userDirectoryHref({ ...query, group: item.group, page: 1 })}
            key={item.group}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <div className={styles.toolbar}>
        <form action="/admin/users" className={styles.searchForm} method="get">
          {query.group !== "docente" ? (
            <input name="group" type="hidden" value={query.group} />
          ) : null}
          {query.status !== "all" ? (
            <input name="status" type="hidden" value={query.status} />
          ) : null}
          <label className={styles.searchLabel} htmlFor={`${searchId}-search`}>
            Buscar usuario
          </label>
          <div className={styles.searchControls}>
            <input
              className={styles.search}
              defaultValue={query.search ?? ""}
              id={`${searchId}-search`}
              key={`${query.group}:${query.status}:${query.page}:${query.search ?? ""}`}
              maxLength={160}
              name="search"
              placeholder="Buscar usuario por nombre…"
              type="search"
            />
            <button className={styles.searchButton} type="submit">
              Buscar
            </button>
            {query.search ? (
              <Link
                className={styles.clearSearch}
                href={userDirectoryHref({
                  ...query,
                  page: 1,
                  search: undefined,
                })}
              >
                Limpiar
              </Link>
            ) : null}
          </div>
        </form>

        <div
          aria-label="Filtrar por estado"
          className={styles.statusFilter}
          role="group"
        >
          {STATUS_FILTERS.map((item) => (
            <Link
              aria-current={query.status === item.value ? "page" : undefined}
              className={
                query.status === item.value
                  ? `${styles.statusButton} ${styles.statusButtonActive}`
                  : styles.statusButton
              }
              href={userDirectoryHref({
                ...query,
                page: 1,
                status: item.value,
              })}
              key={item.value}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      <p aria-live="polite" className={styles.resultSummary}>
        Mostrando {firstVisible}–{lastVisible} de {page.total} usuarios.
      </p>

      {page.items.length === 0 ? (
        <p className={styles.empty}>
          Ningún usuario coincide con la búsqueda y los filtros seleccionados.
        </p>
      ) : (
        <ul className={styles.list} role="list">
          {page.items.map((user) => (
            <li className={styles.row} key={user.id}>
              <div className={styles.rowMain}>
                <h3 className={styles.rowName}>{user.fullName}</h3>
                <p className={styles.rowMeta}>
                  Rol: <strong>{formatUserRole(user.role)}</strong>
                </p>
                <p className={styles.rowMeta}>
                  Último acceso: {formatAccess(user.lastAccessAt)}
                </p>
              </div>
              <span
                className={
                  user.accountStatus === "active"
                    ? styles.badgeActive
                    : styles.badgePaused
                }
              >
                {formatAccountStatus(user.accountStatus)}
              </span>
              <div className={styles.rowActions}>
                <UserEditForm user={user} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 ? (
        <nav aria-label="Paginación de usuarios" className={styles.pagination}>
          <span className={styles.paginationCurrent}>
            Página {query.page} de {totalPages}
          </span>
          <div className={styles.paginationActions}>
            {query.page > 1 ? (
              <Link
                className={styles.paginationLink}
                href={userDirectoryHref({ ...query, page: query.page - 1 })}
              >
                Anterior
              </Link>
            ) : null}
            {query.page < totalPages ? (
              <Link
                className={styles.paginationLink}
                href={userDirectoryHref({ ...query, page: query.page + 1 })}
              >
                Siguiente
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
