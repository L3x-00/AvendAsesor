"use client";

import Link from "next/link";
import { useId } from "react";
import {
  createAdministrativeUserAction,
  updateAccessWindowAction,
  updateAdministrativeUserAction,
} from "@/app/admin/actions";
import { AdminActionForm } from "@/components/admin/admin-action-form";
import { toDateInputValue } from "@/lib/admin-api/access-window";
import { formatAccessState, formatUserRole } from "@/lib/admin-api/labels";
import type {
  AdministrativeUser,
  AdministrativeUserCounts,
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
  counts: AdministrativeUserCounts;
  page: AdministrativeUserPage;
  query: ParsedUserDirectoryQuery;
  /** Today in Lima (YYYY-MM-DD), resolved on the server so hydration matches. */
  today: string;
}

const accessDateTimeFormatter = new Intl.DateTimeFormat("es-PE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Lima",
});

const accessDayFormatter = new Intl.DateTimeFormat("es-PE", {
  dateStyle: "medium",
  timeZone: "America/Lima",
});

function formatAccess(value: string | null): string {
  if (!value) return "Sin acceso registrado";
  return accessDateTimeFormatter.format(new Date(value));
}

function formatDay(value: string | null, emptyLabel: string): string {
  if (!value) return emptyLabel;
  return accessDayFormatter.format(new Date(value));
}

const GROUPS: ReadonlyArray<{ group: UserGroup; label: string }> = [
  { group: "docente", label: "Docentes" },
  { group: "staff", label: "Equipo administrador" },
];

const STATUS_FILTERS: ReadonlyArray<{
  countOf: (counts: AdministrativeUserCounts) => number;
  label: string;
  value: UserStatusFilter;
}> = [
  { countOf: (counts) => counts.total, label: "Todos", value: "all" },
  { countOf: (counts) => counts.active, label: "Activos", value: "activo" },
  {
    countOf: (counts) => counts.expiringSoon,
    label: "Por vencer",
    value: "por_vencer",
  },
  {
    countOf: (counts) => counts.expired,
    label: "Expirados",
    value: "expirado",
  },
  {
    countOf: (counts) => counts.suspended,
    label: "Pausados",
    value: "pausado",
  },
];

const BADGE_CLASS: Record<AdministrativeUser["accessState"], string> = {
  activo: styles.badgeActive,
  expirado: styles.badgeExpired,
  pausado: styles.badgePaused,
  por_vencer: styles.badgeExpiring,
};

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

function AccessWindowForm({
  today,
  user,
}: {
  today: string;
  user: AdministrativeUser;
}) {
  const fieldId = useId();

  return (
    <details className={styles.manage}>
      <summary className={styles.manageSummary}>Extender vigencia</summary>
      <AdminActionForm
        action={updateAccessWindowAction}
        className={styles.form}
        submitLabel="Guardar vigencia"
      >
        <input name="userId" type="hidden" value={user.id} />
        <p className={styles.formHint}>
          El fin debe ser hoy o una fecha posterior. Deja una fecha vacía para
          dejarla sin definir; si borras ambas, el acceso queda sin vencimiento.
          Para bloquear el acceso de inmediato usa «Editar acceso» y pausa la
          cuenta.
        </p>
        <label className={styles.fieldLabel} htmlFor={`${fieldId}-start`}>
          Inicio
        </label>
        <input
          className={styles.input}
          defaultValue={toDateInputValue(user.accessStartAt)}
          id={`${fieldId}-start`}
          name="accessStartAt"
          type="date"
        />
        <label className={styles.fieldLabel} htmlFor={`${fieldId}-expires`}>
          Fin
        </label>
        <input
          className={styles.input}
          defaultValue={toDateInputValue(user.accessExpiresAt)}
          id={`${fieldId}-expires`}
          min={today}
          name="accessExpiresAt"
          type="date"
        />
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
 * Registration form. The email is the login and the person sets their own
 * password from the invitation, so no password is ever typed here.
 */
function CreateUserForm({
  role,
  submitLabel,
  title,
  today,
}: {
  role: "admin" | "docente";
  submitLabel: string;
  title: string;
  today: string;
}) {
  const fieldId = useId();

  return (
    <details className={styles.create}>
      <summary className={styles.createSummary}>{title}</summary>
      <AdminActionForm
        action={createAdministrativeUserAction}
        className={styles.form}
        submitLabel={submitLabel}
      >
        <input name="role" type="hidden" value={role} />
        <label className={styles.fieldLabel} htmlFor={`${fieldId}-name`}>
          Nombre y apellidos
        </label>
        <input
          className={styles.input}
          id={`${fieldId}-name`}
          maxLength={160}
          minLength={2}
          name="fullName"
          required
          type="text"
        />
        <label className={styles.fieldLabel} htmlFor={`${fieldId}-email`}>
          Correo electrónico
        </label>
        <input
          className={styles.input}
          id={`${fieldId}-email`}
          maxLength={254}
          name="email"
          required
          type="email"
        />
        <p className={styles.formHint}>
          El correo es el usuario con el que iniciará sesión. Recibirá un
          mensaje para crear su propia contraseña.
        </p>
        <label className={styles.fieldLabel} htmlFor={`${fieldId}-phone`}>
          Celular (opcional)
        </label>
        <input
          className={styles.input}
          id={`${fieldId}-phone`}
          maxLength={20}
          name="phone"
          type="tel"
        />
        <label className={styles.fieldLabel} htmlFor={`${fieldId}-start`}>
          Inicio de vigencia (opcional)
        </label>
        <input
          className={styles.input}
          id={`${fieldId}-start`}
          name="accessStartAt"
          type="date"
        />
        <label className={styles.fieldLabel} htmlFor={`${fieldId}-expires`}>
          Fin de vigencia (opcional)
        </label>
        <input
          className={styles.input}
          id={`${fieldId}-expires`}
          min={today}
          name="accessExpiresAt"
          type="date"
        />
        <p className={styles.formHint}>
          Si dejas las fechas vacías, el acceso queda sin vencimiento.
        </p>
      </AdminActionForm>
    </details>
  );
}

/**
 * Server-filtered and paginated administrative user directory. The browser
 * receives only the requested page; the API remains the authority for data,
 * role changes, account state and access windows.
 */
export function UsersManager({
  counts,
  page,
  query,
  today,
}: UsersManagerProps) {
  const searchId = useId();
  const totalPages = Math.max(1, Math.ceil(page.total / page.limit));
  const firstVisible = page.total === 0 ? 0 : page.offset + 1;
  const lastVisible =
    page.items.length === 0 ? 0 : page.offset + page.items.length;

  return (
    <div className={styles.manager}>
      <p className={styles.notice} role="note">
        <strong>Vista de superadministrador.</strong> Puedes consultar todos los
        usuarios y gestionar sus accesos y vigencias; cada cambio queda
        auditado.
      </p>

      <div className={styles.createBar}>
        <CreateUserForm
          role="docente"
          submitLabel="Registrar usuario"
          title="+ Agregar usuario"
          today={today}
        />
        <CreateUserForm
          role="admin"
          submitLabel="Registrar administrador"
          title="+ Agregar administrador"
          today={today}
        />
      </div>

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
              placeholder="Buscar por nombre, correo o celular…"
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
          aria-label="Filtrar por estado de acceso"
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
              {item.label}{" "}
              <span className={styles.statusCount}>{item.countOf(counts)}</span>
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
                  Inicio:{" "}
                  <strong>
                    {formatDay(user.accessStartAt, "Sin definir")}
                  </strong>{" "}
                  · Fin:{" "}
                  <strong>
                    {formatDay(user.accessExpiresAt, "Sin vencimiento")}
                  </strong>
                </p>
                <p className={styles.rowMeta}>
                  Correo: <strong>{user.email ?? "Sin correo"}</strong> ·
                  Celular: <strong>{user.phone ?? "Sin celular"}</strong>
                </p>
                <p className={styles.rowMeta}>
                  Último acceso: {formatAccess(user.lastAccessAt)}
                </p>
                {user.createdByName ? (
                  <p className={styles.rowMeta}>
                    Creado por: <strong>{user.createdByName}</strong>
                  </p>
                ) : null}
              </div>
              <span className={BADGE_CLASS[user.accessState]}>
                {formatAccessState(user.accessState)}
              </span>
              <div className={styles.rowActions}>
                <UserEditForm user={user} />
                <AccessWindowForm today={today} user={user} />
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
