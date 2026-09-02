"use client";

import { useId, useMemo, useState } from "react";
import { updateAdministrativeUserAction } from "@/app/admin/actions";
import { AdminActionForm } from "@/components/admin/admin-action-form";
import { formatUserRole } from "@/lib/admin-api/labels";
import type { AdministrativeUser } from "@/lib/admin-api/types";
import {
  accountStatusLabel,
  filterUsers,
  statusCounts,
  userGroup,
  type UserGroup,
  type UserStatusFilter,
} from "@/lib/admin-api/user-directory";
import styles from "./users-manager.module.css";

interface UsersManagerProps {
  users: AdministrativeUser[];
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
 * Administrative users directory. Reuses the existing update action; the server
 * remains the authority for roles and states. Access windows (vigencias) and
 * per-module permissions are not part of the current API — see ADR-0017.
 */
export function UsersManager({ users }: UsersManagerProps) {
  const [group, setGroup] = useState<UserGroup>("docente");
  const [status, setStatus] = useState<UserStatusFilter>("all");
  const [query, setQuery] = useState("");
  const searchId = useId();

  const groupCounts = useMemo(
    () => ({
      docente: users.filter((user) => userGroup(user.role) === "docente").length,
      staff: users.filter((user) => userGroup(user.role) === "staff").length,
    }),
    [users],
  );
  const counts = useMemo(() => statusCounts(users, group), [users, group]);
  const visible = useMemo(
    () => filterUsers(users, { group, query, status }),
    [users, group, query, status],
  );

  return (
    <div className={styles.manager}>
      <p className={styles.notice} role="note">
        <strong>Vista de superadministrador.</strong> Puedes ver todos los
        usuarios, sus accesos y la trazabilidad de cada cambio.
      </p>

      <div className={styles.tabs} role="group" aria-label="Tipo de usuario">
        {GROUPS.map((item) => (
          <button
            aria-pressed={group === item.group}
            className={
              group === item.group ? `${styles.tab} ${styles.tabActive}` : styles.tab
            }
            key={item.group}
            onClick={() => setGroup(item.group)}
            type="button"
          >
            {item.label}{" "}
            <span className={styles.tabCount}>{groupCounts[item.group]}</span>
          </button>
        ))}
      </div>

      <div className={styles.toolbar}>
        <input
          aria-label="Buscar usuario por nombre"
          className={styles.search}
          id={`${searchId}-search`}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar usuario por nombre…"
          type="search"
          value={query}
        />
        <div
          aria-label="Filtrar por estado"
          className={styles.statusFilter}
          role="group"
        >
          {STATUS_FILTERS.map((item) => (
            <button
              aria-pressed={status === item.value}
              className={
                status === item.value
                  ? `${styles.statusButton} ${styles.statusButtonActive}`
                  : styles.statusButton
              }
              key={item.value}
              onClick={() => setStatus(item.value)}
              type="button"
            >
              {item.label} <span className={styles.tabCount}>{counts[item.value]}</span>
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className={styles.empty}>
          {users.length === 0
            ? "Aún no hay usuarios registrados."
            : "Ningún usuario coincide con los filtros."}
        </p>
      ) : (
        <ul className={styles.list} role="list">
          {visible.map((user) => (
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
                {accountStatusLabel(user.accountStatus)}
              </span>
              <div className={styles.rowActions}>
                <UserEditForm user={user} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
