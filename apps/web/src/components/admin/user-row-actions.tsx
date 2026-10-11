"use client";

import { type ReactNode, useId, useState } from "react";
import {
  sendPasswordResetAction,
  updateAccessWindowAction,
  updateAdministrativeUserAction,
} from "@/app/admin/actions";
import { formatUserRole } from "@/lib/admin-api/labels";
import { toDateInputValue } from "@/lib/admin-api/access-window";
import type { AdministrativeUser } from "@/lib/admin-api/types";
import { AdminActionForm } from "@/components/admin/admin-action-form";
import { AdminModal } from "@/components/admin/admin-modal";
import { FieldError } from "@/components/ui/form-field";
import { quickValidity, QuickValidityButtons } from "./user-access-validity";
import { formatAccess, formatDay } from "./user-format";
import {
  ACCESS_WINDOW_RULES,
  USER_EDIT_RULES,
} from "./user-form-rules";
import styles from "./users-manager.module.css";

/**
 * Acciones de cada fila del directorio. Son botones con icono, uno al lado del
 * otro y en orden fijo; cada uno abre su propio diálogo, así la fila no crece
 * ni obliga a desplazarse (PO, 2026-10-11).
 */

type RowAction = "details" | "edit" | "validity" | "password" | "suspend";

const ACTION_TITLES: Record<RowAction, string> = {
  details: "Ver ficha",
  edit: "Editar acceso",
  password: "Enviar enlace de contraseña",
  suspend: "Suspender acceso",
  validity: "Extender vigencia",
};

function RowActionIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      className={styles.rowActionIcon}
      fill="none"
      viewBox="0 0 24 24"
    >
      {children}
    </svg>
  );
}

/** Ojo: ficha de solo lectura con los datos completos del usuario. */
function UserFicha({ user }: { user: AdministrativeUser }) {
  return (
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
  );
}

function UserEditForm({
  onSuccess,
  user,
}: {
  onSuccess: () => void;
  user: AdministrativeUser;
}) {
  const fieldId = useId();

  return (
    <AdminActionForm
      action={updateAdministrativeUserAction}
      className={styles.form}
      confirmMessage={`¿Confirmas cambiar el rol o estado de ${user.fullName}? Este cambio quedará auditado.`}
      onSuccess={onSuccess}
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
  );
}

function AccessWindowForm({
  onSuccess,
  today,
  user,
}: {
  onSuccess: () => void;
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
    <AdminActionForm
      action={updateAccessWindowAction}
      className={styles.form}
      onSuccess={onSuccess}
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
  );
}

/** Llave: envía el enlace de restablecimiento; nadie ve la contraseña. */
function PasswordResetForm({
  onSuccess,
  user,
}: {
  onSuccess: () => void;
  user: AdministrativeUser;
}) {
  return (
    <AdminActionForm
      action={sendPasswordResetAction}
      className={styles.form}
      confirmMessage={`¿Enviar a ${user.email ?? "esta persona"} un enlace para crear una contraseña nueva?`}
      onSuccess={onSuccess}
      submitLabel="Enviar enlace"
      successMessage="Enlace enviado. La persona recibirá un correo para crear una contraseña nueva."
    >
      <input name="userId" type="hidden" value={user.id} />
      <p className={styles.formHint}>
        El enlace llega al correo registrado y solo lo puede usar esa persona;
        aquí nadie ve ni define la contraseña. Queda auditado.
      </p>
    </AdminActionForm>
  );
}

/** Tacho: suspensión lógica (no borra identidad ni historial). */
function SuspendUserForm({
  onSuccess,
  user,
}: {
  onSuccess: () => void;
  user: AdministrativeUser;
}) {
  const fieldId = useId();

  return (
    <AdminActionForm
      action={updateAdministrativeUserAction}
      className={styles.form}
      confirmMessage={`¿Suspender el acceso de ${user.fullName}? Podrás reactivarlo después; todo queda auditado.`}
      onSuccess={onSuccess}
      rules={USER_EDIT_RULES}
      submitLabel="Suspender acceso"
      successMessage="Acceso suspendido. La persona no podrá iniciar sesión."
      tone="danger"
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
  );
}

export function UserRowActions({
  today,
  user,
}: {
  today: string;
  user: AdministrativeUser;
}) {
  const baseId = useId();
  const [openAction, setOpenAction] = useState<RowAction | null>(null);
  const close = () => setOpenAction(null);
  const triggerId = (action: RowAction) => `${baseId}-${action}-trigger`;

  return (
    <>
      <div
        aria-label={`Acciones para ${user.fullName}`}
        className={styles.rowActionButtons}
        role="group"
      >
        <button
          aria-label="Ver ficha"
          className={styles.rowActionButton}
          id={triggerId("details")}
          onClick={() => setOpenAction("details")}
          title="Ver ficha"
          type="button"
        >
          <RowActionIcon>
            <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
            <circle cx="12" cy="12" r="3" />
          </RowActionIcon>
        </button>
        <button
          aria-label="Editar acceso"
          className={styles.rowActionButton}
          id={triggerId("edit")}
          onClick={() => setOpenAction("edit")}
          title="Editar rol y estado"
          type="button"
        >
          <RowActionIcon>
            <path d="M4 20h4l10-10-4-4L4 16v4Z" />
            <path d="m13.5 6.5 4 4" />
          </RowActionIcon>
        </button>
        <button
          aria-label="Extender vigencia"
          className={styles.rowActionButton}
          id={triggerId("validity")}
          onClick={() => setOpenAction("validity")}
          title="Extender vigencia"
          type="button"
        >
          <RowActionIcon>
            <rect height="16" rx="2" width="18" x="3" y="5" />
            <path d="M8 3v4M16 3v4M3 11h18" />
          </RowActionIcon>
        </button>
        <button
          aria-label="Enviar enlace de contraseña"
          className={styles.rowActionButton}
          id={triggerId("password")}
          onClick={() => setOpenAction("password")}
          title="Enviar enlace de contraseña"
          type="button"
        >
          <RowActionIcon>
            <circle cx="8" cy="15" r="4" />
            <path d="m11 12 9-9M17 6l3 3M14 9l3 3" />
          </RowActionIcon>
        </button>
        {user.accountStatus === "active" ? (
          <button
            aria-label="Suspender acceso"
            className={`${styles.rowActionButton} ${styles.rowActionButtonDanger}`}
            id={triggerId("suspend")}
            onClick={() => setOpenAction("suspend")}
            title="Suspender acceso"
            type="button"
          >
            <RowActionIcon>
              <path d="M5 7h14M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
            </RowActionIcon>
          </button>
        ) : null}
      </div>

      <AdminModal
        closeLabel="Cerrar"
        eyebrow={user.fullName}
        onClose={close}
        open={openAction !== null}
        returnFocusTo={
          openAction === null ? undefined : triggerId(openAction)
        }
        title={ACTION_TITLES[openAction ?? "details"]}
      >
        {openAction === "details" ? <UserFicha user={user} /> : null}
        {openAction === "edit" ? (
          <UserEditForm onSuccess={close} user={user} />
        ) : null}
        {openAction === "validity" ? (
          <AccessWindowForm onSuccess={close} today={today} user={user} />
        ) : null}
        {openAction === "password" ? (
          <PasswordResetForm onSuccess={close} user={user} />
        ) : null}
        {openAction === "suspend" ? (
          <SuspendUserForm onSuccess={close} user={user} />
        ) : null}
      </AdminModal>
    </>
  );
}
