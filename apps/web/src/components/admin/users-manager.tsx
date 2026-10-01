"use client";

import Link from "next/link";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createAdministrativeUserAction,
  sendPasswordResetAction,
  updateAccessWindowAction,
  updateAdministrativeUserAction,
} from "@/app/admin/actions";
import { AdminActionForm } from "@/components/admin/admin-action-form";
import { UsersImportForm } from "@/components/admin/users-import-form";
import { FieldError } from "@/components/ui/form-field";
import type { FieldRules } from "@/lib/ui/field-validation";
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

/**
 * Reglas del alta de usuario y del cambio de vigencia. La fecha de fin se
 * compara con la de inicio para que el error salga en el campo que hay que
 * corregir, no en un aviso general al pie del formulario.
 */
const ACCESS_WINDOW_RULES: FieldRules = {
  accessExpiresAt: [
    {
      kind: "dateOrder",
      label: "La fecha de fin",
      startField: "accessStartAt",
      startLabel: "la fecha de inicio",
    },
  ],
};

const USER_EDIT_RULES: FieldRules = {
  reason: [
    { kind: "required", label: "El motivo" },
    { kind: "minLength", label: "El motivo", min: 4 },
  ],
};

const CREATE_USER_RULES: FieldRules = {
  ...ACCESS_WINDOW_RULES,
  email: [
    { kind: "required", label: "El correo electrónico" },
    { kind: "email", label: "El correo electrónico" },
  ],
  fullName: [
    { kind: "required", label: "El nombre y apellidos" },
    { kind: "minLength", label: "El nombre y apellidos", min: 2 },
    { kind: "maxLength", label: "El nombre y apellidos", max: 160 },
  ],
  phone: [{ kind: "phone", label: "El celular" }],
};

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

/** Icono de las acciones de fila; siempre acompaña a una etiqueta de texto. */
function ManageIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      className={styles.summaryIcon}
      fill="none"
      viewBox="0 0 24 24"
    >
      {children}
    </svg>
  );
}

/**
 * Fecha fin resultante de sumar meses al día de hoy (Lima). El día llega del
 * servidor para que el cálculo coincida entre servidor y navegador.
 */
function quickValidity(
  today: string,
  months: number,
): { expiresAt: string; label: string; startAt: string } {
  const base = new Date(`${today}T12:00:00.000Z`);
  const year = base.getUTCFullYear();
  const month = base.getUTCMonth() + months;
  const lastDayOfTargetMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const target = new Date(
    Date.UTC(
      year,
      month,
      Math.min(base.getUTCDate(), lastDayOfTargetMonth),
      12,
    ),
  );
  return {
    expiresAt: toDateInputValue(target.toISOString()),
    label: accessDayFormatter.format(target),
    startAt: toDateInputValue(base.toISOString()),
  };
}

function QuickValidityButtons({
  onApply,
}: {
  onApply: (months: number) => void;
}) {
  return (
    <div
      aria-label="Vigencias rápidas"
      className={styles.validityButtons}
      role="group"
    >
      {[3, 6, 12].map((months) => (
        <button
          className={styles.validityButton}
          key={months}
          onClick={() => onApply(months)}
          type="button"
        >
          {months} meses
        </button>
      ))}
    </div>
  );
}

function UserEditForm({ user }: { user: AdministrativeUser }) {
  const fieldId = useId();

  return (
    <details className={styles.manage}>
      <summary className={styles.manageSummary}>
        <ManageIcon>
          <path d="M4 20h4l10-10-4-4L4 16v4Z" />
          <path d="m13.5 6.5 4 4" />
        </ManageIcon>
        Editar acceso
      </summary>
      <AdminActionForm
        action={updateAdministrativeUserAction}
        className={styles.form}
        confirmMessage={`¿Confirmas cambiar el rol o estado de ${user.fullName}? Este cambio quedará auditado.`}
        rules={USER_EDIT_RULES}
        submitLabel="Actualizar usuario"
        successMessage="Usuario actualizado con éxito."
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
        <FieldError name="reason" />
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
  const [startAt, setStartAt] = useState(toDateInputValue(user.accessStartAt));
  const [expiresAt, setExpiresAt] = useState(
    toDateInputValue(user.accessExpiresAt),
  );
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
    <details className={styles.manage}>
      <summary className={styles.manageSummary}>
        <ManageIcon>
          <rect height="16" rx="2" width="18" x="3" y="5" />
          <path d="M8 3v4M16 3v4M3 11h18" />
        </ManageIcon>
        Extender vigencia
      </summary>
      <AdminActionForm
        action={updateAccessWindowAction}
        className={styles.form}
        rules={{ ...ACCESS_WINDOW_RULES, ...USER_EDIT_RULES }}
        submitLabel="Guardar vigencia"
        successMessage="Vigencia guardada con éxito."
      >
        <input name="userId" type="hidden" value={user.id} />
        <p className={styles.formHint}>
          El fin debe ser hoy o una fecha posterior. Deja una fecha vacía para
          dejarla sin definir; si borras ambas, el acceso queda sin vencimiento.
          Para bloquear el acceso de inmediato usa «Editar acceso» y pausa la
          cuenta.
        </p>
        <div className={styles.validityRow}>
          <span className={styles.fieldLabel}>Vigencia rápida</span>
          <QuickValidityButtons onApply={applyQuickValidity} />
          {validitySummary ? (
            <p aria-live="polite" className={styles.formHint}>
              {validitySummary}
            </p>
          ) : null}
        </div>
        <label className={styles.fieldLabel} htmlFor={`${fieldId}-start`}>
          Inicio
        </label>
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
          Fin
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
        <FieldError name="reason" />
      </AdminActionForm>
    </details>
  );
}


/**
 * Ojo: ficha de solo lectura con los datos completos del usuario, sin salir de
 * la fila ni cargar otra página.
 */
function UserDetails({ user }: { user: AdministrativeUser }) {
  return (
    <details className={styles.manage}>
      <summary className={styles.manageSummary}>
        <ManageIcon>
          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
          <circle cx="12" cy="12" r="3" />
        </ManageIcon>
        Ver ficha
      </summary>
      <dl className={styles.details}>
        <div>
          <dt>Nombre</dt>
          <dd>{user.fullName}</dd>
        </div>
        <div>
          <dt>Rol</dt>
          <dd>{formatUserRole(user.role)}</dd>
        </div>
        <div>
          <dt>Estado de la cuenta</dt>
          <dd>{user.accountStatus === "active" ? "Activa" : "Pausada"}</dd>
        </div>
        <div>
          <dt>Correo</dt>
          <dd>{user.email ?? "Sin correo"}</dd>
        </div>
        <div>
          <dt>Celular</dt>
          <dd>{user.phone ?? "Sin celular"}</dd>
        </div>
        <div>
          <dt>Vigencia</dt>
          <dd>
            {formatDay(user.accessStartAt, "Sin inicio")} –{" "}
            {formatDay(user.accessExpiresAt, "Sin vencimiento")}
          </dd>
        </div>
        <div>
          <dt>Último acceso</dt>
          <dd>{formatAccess(user.lastAccessAt)}</dd>
        </div>
        <div>
          <dt>Creado por</dt>
          <dd>{user.createdByName ?? "No registrado"}</dd>
        </div>
      </dl>
    </details>
  );
}

/** Llave: envía el enlace de restablecimiento; nadie ve la contraseña. */
function PasswordResetForm({ user }: { user: AdministrativeUser }) {
  return (
    <details className={styles.manage}>
      <summary className={styles.manageSummary}>
        <ManageIcon>
          <circle cx="8" cy="15" r="4" />
          <path d="m11 12 9-9M17 6l3 3M14 9l3 3" />
        </ManageIcon>
        Enviar enlace de contraseña
      </summary>
      <AdminActionForm
        action={sendPasswordResetAction}
        className={styles.form}
        confirmMessage={`¿Enviar a ${user.email ?? "esta persona"} un enlace para crear una contraseña nueva?`}
        submitLabel="Enviar enlace"
        successMessage="Enlace enviado. La persona recibirá un correo para crear una contraseña nueva."
      >
        <input name="userId" type="hidden" value={user.id} />
        <p className={styles.formHint}>
          El enlace llega al correo registrado y solo lo puede usar esa persona;
          aquí nadie ve ni define la contraseña. Queda auditado.
        </p>
      </AdminActionForm>
    </details>
  );
}

/** Tacho: suspensión lógica (no borra identidad ni historial). */
function SuspendUserForm({ user }: { user: AdministrativeUser }) {
  const fieldId = useId();

  return (
    <details className={styles.manage}>
      <summary
        className={`${styles.manageSummary} ${styles.manageSummaryDanger}`}
      >
        <ManageIcon>
          <path d="M5 7h14M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
        </ManageIcon>
        Suspender acceso
      </summary>
      <AdminActionForm
        action={updateAdministrativeUserAction}
        className={styles.form}
        confirmMessage={`¿Suspender el acceso de ${user.fullName}? Podrás reactivarlo después; todo queda auditado.`}
        rules={USER_EDIT_RULES}
        submitLabel="Suspender acceso"
        successMessage="Acceso suspendido. La persona no podrá iniciar sesión."
      >
        <input name="userId" type="hidden" value={user.id} />
        <input name="accountStatus" type="hidden" value="suspended" />
        <p className={styles.formHint}>
          La cuenta se pausa y el historial se conserva. Es una suspensión
          lógica, no un borrado: podrás reactivarla cuando corresponda.
        </p>
        <label
          className={styles.fieldLabel}
          htmlFor={`${fieldId}-suspend-reason`}
        >
          Motivo de la suspensión (queda auditado)
        </label>
        <textarea
          className={styles.textarea}
          id={`${fieldId}-suspend-reason`}
          maxLength={500}
          minLength={4}
          name="reason"
          required
          rows={3}
        />
        <FieldError name="reason" />
      </AdminActionForm>
    </details>
  );
}

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

/** Flecha de despliegue: gira al abrir, sin cambiar el tamaño del botón. */
function ChevronIcon() {
  return (
    <svg
      aria-hidden="true"
      className={styles.actionChevron}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path d="m6 9 6 6 6-6" />
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
 * Barra de acciones de Usuarios: dos altas (primarias) y la importación y
 * exportación de Excel (secundarias, discretas).
 *
 * Los botones solo abren o cierran; el formulario se pinta en un panel de
 * ancho completo DEBAJO de la barra, fuera de ella, para que abrir un alta no
 * mueva ni cambie de tamaño los otros botones. Hay un solo panel abierto a la
 * vez. Los paneles cerrados siguen montados (ocultos) para que un borrador o un
 * envío en curso no se pierdan al cambiar de panel; tras un alta confirmada
 * por el servidor el panel se cierra y su formulario se vuelve a montar vacío.
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
  const pendingFocus = useRef<{
    panel: UserActionPanel;
    target: "panel" | "trigger";
  } | null>(null);

  // El foco se mueve después de pintar: al abrir va al panel (el lector de
  // pantalla anuncia su título y Tab entra en el primer campo); al cerrar
  // vuelve al botón de la barra que lo abrió.
  useEffect(() => {
    const request = pendingFocus.current;
    if (!request) return;
    pendingFocus.current = null;

    if (request.target === "trigger") {
      document.getElementById(`${baseId}-${request.panel}-trigger`)?.focus();
      return;
    }

    const panel = document.getElementById(`${baseId}-${request.panel}-panel`);
    if (!panel) return;
    panel.focus({ preventScroll: true });
    // En el celular el panel puede quedar por debajo de la pantalla.
    const top = panel.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight - 64) {
      const reduceMotion = window.matchMedia?.(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      panel.scrollIntoView?.({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start",
      });
    }
  }, [baseId, openPanel]);

  const closePanel = useCallback(() => {
    if (openPanel === null) return;
    pendingFocus.current = { panel: openPanel, target: "trigger" };
    setOpenPanel(null);
  }, [openPanel]);

  function togglePanel(panel: UserActionPanel) {
    if (openPanel === panel) {
      closePanel();
      return;
    }
    pendingFocus.current = { panel, target: "panel" };
    setOpenPanel(panel);
  }

  /**
   * Alta confirmada por el servidor: el formulario se vuelve a montar vacío
   * (sin el aviso de éxito anterior) y, si su panel sigue abierto, se cierra.
   * Si mientras tanto se abrió otro panel, ese no se toca.
   */
  const finishPanel = useCallback(
    (panel: UserActionPanel) => {
      setFormVersion((current) => ({ ...current, [panel]: current[panel] + 1 }));
      if (openPanel !== panel) return;
      pendingFocus.current = { panel, target: "trigger" };
      setOpenPanel(null);
    },
    [openPanel],
  );

  const onSuccessFor = useMemo(
    () => ({
      admin: () => finishPanel("admin"),
      docente: () => finishPanel("docente"),
      import: () => finishPanel("import"),
    }),
    [finishPanel],
  );

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape" || openPanel === null || event.defaultPrevented) {
      return;
    }
    event.preventDefault();
    closePanel();
  }

  const panelId = (panel: UserActionPanel) => `${baseId}-${panel}-panel`;
  const titleId = (panel: UserActionPanel) => `${baseId}-${panel}-title`;
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
    <div className={styles.actionArea} onKeyDown={handleKeyDown}>
      <div
        aria-label="Acciones de usuarios"
        className={styles.actionBar}
        role="group"
      >
        <button
          aria-controls={panelId("docente")}
          aria-expanded={openPanel === "docente"}
          className={styles.primaryAction}
          id={triggerId("docente")}
          onClick={() => togglePanel("docente")}
          type="button"
        >
          <span>
            <span aria-hidden="true">+ </span>Agregar usuario
          </span>
          <ChevronIcon />
        </button>
        <button
          aria-controls={panelId("admin")}
          aria-expanded={openPanel === "admin"}
          className={styles.primaryAction}
          id={triggerId("admin")}
          onClick={() => togglePanel("admin")}
          type="button"
        >
          <span>
            <span aria-hidden="true">+ </span>Agregar administrador
          </span>
          <ChevronIcon />
        </button>
        <div className={styles.secondaryActions}>
          <button
            aria-controls={panelId("import")}
            aria-expanded={openPanel === "import"}
            className={styles.secondaryAction}
            id={triggerId("import")}
            onClick={() => togglePanel("import")}
            type="button"
          >
            <TransferIcon direction="up" />
            <span>Importar Excel</span>
            <ChevronIcon />
          </button>
          <a className={styles.secondaryAction} href={exportHref}>
            <TransferIcon direction="down" />
            <span>Exportar Excel</span>
          </a>
        </div>
      </div>

      {(["docente", "admin", "import"] as const).map((panel) => (
        <section
          aria-labelledby={titleId(panel)}
          className={styles.actionPanel}
          hidden={openPanel !== panel}
          id={panelId(panel)}
          key={panel}
          tabIndex={-1}
        >
          <div className={styles.actionPanelHeader}>
            <h2 className={styles.actionPanelTitle} id={titleId(panel)}>
              {ACTION_PANEL_TITLES[panel]}
            </h2>
            <button
              className={styles.actionPanelClose}
              onClick={closePanel}
              type="button"
            >
              <svg
                aria-hidden="true"
                className={styles.actionIcon}
                fill="none"
                viewBox="0 0 24 24"
              >
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
              Cerrar
            </button>
          </div>
          {panelContent[panel]}
          {/* En el celular el formulario es largo: también se puede cerrar
              desde abajo sin volver a subir. */}
          <div className={styles.actionPanelFooter}>
            <button
              className={styles.actionPanelClose}
              onClick={closePanel}
              type="button"
            >
              Cerrar formulario
            </button>
          </div>
        </section>
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
                <UserDetails user={user} />
                <UserEditForm user={user} />
                <AccessWindowForm today={today} user={user} />
                <PasswordResetForm user={user} />
                {user.accountStatus === "active" ? (
                  <SuspendUserForm user={user} />
                ) : null}
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
