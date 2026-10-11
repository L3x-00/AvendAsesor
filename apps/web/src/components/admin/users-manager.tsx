"use client";

import Link from "next/link";
import { type ReactNode, useCallback, useId, useMemo, useState } from "react";
import { createAdministrativeUserAction } from "@/app/admin/actions";
import { AdminActionForm } from "@/components/admin/admin-action-form";
import { AdminModal } from "@/components/admin/admin-modal";
import { UserRowActions } from "@/components/admin/user-row-actions";
import { UsersImportForm } from "@/components/admin/users-import-form";
import { FieldError } from "@/components/ui/form-field";
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
import { QuickValidityButtons, quickValidity } from "./user-access-validity";
import { CREATE_USER_RULES } from "./user-form-rules";
import { formatAccess, formatDay, userInitials } from "./user-format";
import styles from "./users-manager.module.css";

interface UsersManagerProps {
  /** Render base URL: the roster upload goes straight to the API. */
  apiBaseUrl: string;
  counts: AdministrativeUserCounts;
  /** Árbol de módulos para asignar accesos al crear un administrador. */
  modules?: Array<{ id: string; name: string; parentModuleId: string | null }>;
  page: AdministrativeUserPage;
  query: ParsedUserDirectoryQuery;
  /** Today in Lima (YYYY-MM-DD), resolved on the server so hydration matches. */
  today: string;
}

const GROUPS: ReadonlyArray<{ group: UserGroup; label: string }> = [
  { group: "docente", label: "Docentes" },
  { group: "staff", label: "Administradores" },
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
    label: "Vencidos",
    value: "expirado",
  },
  {
    countOf: (counts) => counts.suspended,
    label: "Inactivos",
    value: "pausado",
  },
];

const BADGE_CLASS: Record<AdministrativeUser["accessState"], string> = {
  activo: styles.badgeActive,
  expirado: styles.badgeExpired,
  pausado: styles.badgePaused,
  por_vencer: styles.badgeExpiring,
};

/**
 * Registration form. The email is the login and the person sets their own
 * password from the invitation, so no password is ever typed here.
 *
 * Solo pinta el formulario: el panel que lo contiene lo abre y lo cierra la
 * barra de acciones de UsersManager.
 */
function CreateUserForm({
  modules = [],
  onSuccess,
  role,
  submitLabel,
  today,
}: {
  modules?: Array<{ id: string; name: string; parentModuleId: string | null }>;
  onSuccess: () => void;
  role: "admin" | "docente";
  submitLabel: string;
  today: string;
}) {
  const fieldId = useId();
  const [startAt, setStartAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [validitySummary, setValiditySummary] = useState<string | null>(null);

  function applyQuickValidity(months: number) {
    const quick = quickValidity(today, months);
    setExpiresAt(quick.expiresAt);
    setStartAt((current) => current || quick.startAt);
    setValiditySummary(
      `Vigencia hasta ${quick.label} (${months === 12 ? "un año" : `${months} meses`}).`,
    );
  }

  return (
    <AdminActionForm
      action={createAdministrativeUserAction}
      className={styles.form}
      onSuccess={onSuccess}
      rules={CREATE_USER_RULES}
      submitLabel={submitLabel}
      successMessage="Registro exitoso. El usuario recibirá un correo para crear su contraseña."
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
      <FieldError name="fullName" />
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
      <FieldError name="email" />
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
      <FieldError name="phone" />
      <label className={styles.fieldLabel} htmlFor={`${fieldId}-start`}>
        Inicio de vigencia (opcional)
      </label>
      <div className={styles.validityRow}>
        <span className={styles.fieldLabel}>Vigencia rápida (opcional)</span>
        <QuickValidityButtons onApply={applyQuickValidity} />
        {validitySummary ? (
          <p aria-live="polite" className={styles.formHint}>
            {validitySummary}
          </p>
        ) : null}
      </div>
      <input
        className={styles.input}
        id={`${fieldId}-start`}
        name="accessStartAt"
        onChange={(event) => setStartAt(event.target.value)}
        type="date"
        value={startAt}
      />
      <FieldError name="accessStartAt" />
      <label className={styles.fieldLabel} htmlFor={`${fieldId}-expires`}>
        Fin de vigencia (opcional)
      </label>
      <input
        className={styles.input}
        id={`${fieldId}-expires`}
        min={today}
        name="accessExpiresAt"
        onChange={(event) => setExpiresAt(event.target.value)}
        type="date"
        value={expiresAt}
      />
      <FieldError name="accessExpiresAt" />
      <p className={styles.formHint}>
        Si dejas las fechas vacías, el acceso queda sin vencimiento.
      </p>
      {role === "admin" && modules.length ? (
        <fieldset className={styles.validityRow}>
          <legend className={styles.fieldLabel}>
            Módulos con acceso (opcional; puedes ajustarlos después)
          </legend>
          <div className={styles.moduleGrid}>
            {modules.map((module) => (
              <label className={styles.moduleOption} key={module.id}>
                <input name="moduleId" type="checkbox" value={module.id} />
                {module.parentModuleId ? `↳ ${module.name}` : module.name}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
    </AdminActionForm>
  );
}

type UserActionPanel = "admin" | "docente" | "import";

const ACTION_PANEL_TITLES: Record<UserActionPanel, string> = {
  admin: "Agregar administrador",
  docente: "Agregar usuario docente",
  import: "Importar usuarios desde Excel",
};

/** Persona con signo de alta: el alta de docente se entiende de un vistazo. */
function UserPlusIcon() {
  return (
    <svg
      aria-hidden="true"
      className={styles.actionIcon}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle cx="10" cy="8" r="3.5" />
      <path d="M3.5 20c.6-3.2 3.2-5 6.5-5s5.9 1.8 6.5 5" />
      <path d="M18 7v6M15 10h6" />
    </svg>
  );
}

/** Escudo con signo de alta: distingue el alta de administrador. */
function ShieldPlusIcon() {
  return (
    <svg
      aria-hidden="true"
      className={styles.actionIcon}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path d="M12 3 5 5.8v5.4c0 4.3 2.9 7.6 7 9.3 4.1-1.7 7-5 7-9.3V5.8L12 3Z" />
      <path d="M12 9v6M9 12h6" />
    </svg>
  );
}

/** Icono de subir (importar) o bajar (exportar) junto a la etiqueta. */
function TransferIcon({ direction }: { direction: "down" | "up" }) {
  return (
    <svg
      aria-hidden="true"
      className={styles.actionIcon}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
      {direction === "up" ? (
        <path d="M12 15V4m-4.5 4.5L12 4l4.5 4.5" />
      ) : (
        <path d="M12 4v11m-4.5-4.5L12 15l4.5-4.5" />
      )}
    </svg>
  );
}

/**
 * Barra de acciones de Usuarios: dos altas (con icono de persona y de escudo)
 * y la importación y exportación de Excel, compactas, al final.
 *
 * Las altas y la importación se abren en un diálogo (portal a `body`, sin
 * recortes), sin desplazar la tabla. Los diálogos cerrados siguen montados
 * (ocultos) para que un borrador o un envío en curso no se pierdan; tras un
 * alta confirmada por el servidor el formulario se vuelve a montar vacío.
 */
function UserActions({
  apiBaseUrl,
  exportHref,
  modules,
  today,
}: {
  apiBaseUrl: string;
  exportHref: string;
  modules: Array<{ id: string; name: string; parentModuleId: string | null }>;
  today: string;
}) {
  const baseId = useId();
  const [openPanel, setOpenPanel] = useState<UserActionPanel | null>(null);
  const [formVersion, setFormVersion] = useState<
    Record<UserActionPanel, number>
  >({ admin: 0, docente: 0, import: 0 });

  const closePanel = useCallback(() => setOpenPanel(null), []);

  function togglePanel(panel: UserActionPanel) {
    setOpenPanel((current) => (current === panel ? null : panel));
  }

  /**
   * Alta confirmada por el servidor: el formulario se vuelve a montar vacío
   * (sin el aviso de éxito anterior) y, si su panel sigue abierto, se cierra.
   * Si mientras tanto se abrió otro panel, ese no se toca.
   */
  const finishPanel = useCallback((panel: UserActionPanel) => {
    setFormVersion((current) => ({ ...current, [panel]: current[panel] + 1 }));
    setOpenPanel((current) => (current === panel ? null : current));
  }, []);

  const onSuccessFor = useMemo(
    () => ({
      admin: () => finishPanel("admin"),
      docente: () => finishPanel("docente"),
      import: () => finishPanel("import"),
    }),
    [finishPanel],
  );

  const panelId = (panel: UserActionPanel) => `${baseId}-${panel}-panel`;
  const triggerId = (panel: UserActionPanel) => `${baseId}-${panel}-trigger`;

  const panelContent: Record<UserActionPanel, ReactNode> = {
    admin: (
      <CreateUserForm
        key={formVersion.admin}
        modules={modules}
        onSuccess={onSuccessFor.admin}
        role="admin"
        submitLabel="Registrar administrador"
        today={today}
      />
    ),
    docente: (
      <CreateUserForm
        key={formVersion.docente}
        onSuccess={onSuccessFor.docente}
        role="docente"
        submitLabel="Registrar usuario"
        today={today}
      />
    ),
    import: (
      <UsersImportForm
        apiBaseUrl={apiBaseUrl}
        key={formVersion.import}
        onSuccess={onSuccessFor.import}
      />
    ),
  };

  return (
    <div className={styles.actionArea}>
      <div
        aria-label="Acciones de usuarios"
        className={styles.actionBar}
        role="group"
      >
        <button
          aria-controls={panelId("docente")}
          aria-expanded={openPanel === "docente"}
          aria-haspopup="dialog"
          className={styles.primaryAction}
          id={triggerId("docente")}
          onClick={() => togglePanel("docente")}
          type="button"
        >
          <UserPlusIcon />
          <span>Agregar usuario</span>
        </button>
        <button
          aria-controls={panelId("admin")}
          aria-expanded={openPanel === "admin"}
          aria-haspopup="dialog"
          className={styles.primaryAction}
          id={triggerId("admin")}
          onClick={() => togglePanel("admin")}
          type="button"
        >
          <ShieldPlusIcon />
          <span>Agregar administrador</span>
        </button>
        <div className={styles.secondaryActions}>
          <button
            aria-controls={panelId("import")}
            aria-expanded={openPanel === "import"}
            aria-haspopup="dialog"
            className={styles.secondaryAction}
            id={triggerId("import")}
            onClick={() => togglePanel("import")}
            type="button"
          >
            <TransferIcon direction="up" />
            <span>Importar</span>
          </button>
          <a className={styles.secondaryAction} href={exportHref}>
            <TransferIcon direction="down" />
            <span>Exportar</span>
          </a>
        </div>
      </div>

      {(["docente", "admin", "import"] as const).map((panel) => (
        <AdminModal
          eyebrow="Usuarios y accesos"
          keepMounted
          key={panel}
          onClose={closePanel}
          open={openPanel === panel}
          panelId={panelId(panel)}
          returnFocusTo={triggerId(panel)}
          title={ACTION_PANEL_TITLES[panel]}
        >
          {panelContent[panel]}
        </AdminModal>
      ))}
    </div>
  );
}

/** Export link that carries the filters currently on screen. */
function userExportHref(query: ParsedUserDirectoryQuery): string {
  const params = new URLSearchParams();
  if (query.group !== "docente") params.set("group", query.group);
  if (query.search) params.set("search", query.search);
  if (query.status !== "all") params.set("accessState", query.status);

  const serialized = params.toString();
  return serialized
    ? `/api/admin/users/export?${serialized}`
    : "/api/admin/users/export";
}

/**
 * Server-filtered and paginated administrative user directory. The browser
 * receives only the requested page; the API remains the authority for data,
 * role changes, account state and access windows.
 */
export function UsersManager({
  apiBaseUrl,
  counts,
  modules = [],
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

      <UserActions
        apiBaseUrl={apiBaseUrl}
        exportHref={userExportHref(query)}
        modules={modules}
        today={today}
      />

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
        <div className={styles.tableShell}>
          <table className={styles.userTable} role="table">
            <caption className="avend-visually-hidden">
              Usuarios filtrados con su rol, estado, vigencia y acciones
            </caption>
            <thead role="rowgroup">
              <tr role="row">
                <th role="columnheader" scope="col">Usuario</th>
                <th role="columnheader" scope="col">Rol</th>
                <th role="columnheader" scope="col">Estado</th>
                <th role="columnheader" scope="col">Vigencia</th>
                <th role="columnheader" scope="col">Último acceso</th>
                <th role="columnheader" scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {page.items.map((user) => (
                <tr className={styles.tableRow} key={user.id} role="row">
                  <td data-label="Usuario" role="cell">
                    <div className={styles.userIdentity}>
                      <span aria-hidden="true" className={styles.avatar}>
                        {userInitials(user.fullName)}
                      </span>
                      <div className={styles.userIdentityText}>
                        <h3 className={styles.rowName}>{user.fullName}</h3>
                        <p className={styles.rowMeta}>{user.email ?? "Sin correo"}</p>
                        <p className={styles.rowMeta}>{user.phone ?? "Sin celular"}</p>
                      </div>
                    </div>
                  </td>
                  <td data-label="Rol" role="cell">
                    <span className={styles.roleBadge}>{formatUserRole(user.role)}</span>
                  </td>
                  <td data-label="Estado" role="cell">
                    <span className={BADGE_CLASS[user.accessState]}>
                      <span aria-hidden="true" className={styles.statusDot} />
                      {formatAccessState(user.accessState)}
                    </span>
                  </td>
                  <td data-label="Vigencia" role="cell">
                    <span className={styles.dateLine}>
                      <span>Inicio</span>
                      <strong>{formatDay(user.accessStartAt, "Sin definir")}</strong>
                    </span>
                    <span className={styles.dateLine}>
                      <span>Fin</span>
                      <strong>{formatDay(user.accessExpiresAt, "Sin vencimiento")}</strong>
                    </span>
                  </td>
                  <td data-label="Último acceso" role="cell">
                    <span className={styles.lastAccess}>{formatAccess(user.lastAccessAt)}</span>
                  </td>
                  <td data-label="Acciones" role="cell">
                    <UserRowActions today={today} user={user} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
