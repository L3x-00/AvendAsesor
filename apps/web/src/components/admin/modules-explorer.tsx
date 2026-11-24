"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal, flushSync, useFormStatus } from "react-dom";
import {
  createModuleAction,
  deleteModuleAction,
  setModuleStatusAction,
  updateModuleAction,
} from "@/app/admin/actions";
import { AdminActionForm } from "@/components/admin/admin-action-form";
import { DeleteDisclosure } from "@/components/admin/delete-disclosure";
import { FieldError } from "@/components/ui/form-field";
import { useToast } from "@/components/ui/toast";
import type { FieldRules } from "@/lib/ui/field-validation";
import type { AdminActionState } from "@/lib/admin-api/action-state";
import styles from "./modules-explorer.module.css";

export interface ModuleView {
  canManage?: boolean;
  code: string;
  description: string | null;
  id: string;
  isActive: boolean;
  name: string;
  parentModuleId: string | null;
  sortOrder: number;
  documentCount: number;
  submoduleCount: number;
}

export interface ModuleParentOption {
  code: string;
  id: string;
  name: string;
}

export type ExplorerContext =
  | { kind: "root" }
  | {
      kind: "module";
      /**
       * El módulo contiene documentos cargados directamente. La base de datos
       * no admite submódulos en ese caso, así que no se ofrece crearlos.
       */
      hasDirectDocuments?: boolean;
      moduleId: string;
      /**
       * Estado del módulo que recibirá el submódulo. Un submódulo activo exige
       * un padre activo: si el padre está inactivo, solo se crea inactivo.
       */
      moduleIsActive?: boolean;
      moduleName: string;
    };

interface ModulesExplorerProps {
  canCreate?: boolean;
  context: ExplorerContext;
  initialHighlightId?: string;
  modules: ModuleView[];
  parents: ModuleParentOption[];
}

const CODE_PATTERN = "[A-Za-z][A-Za-z0-9_]{1,63}";

/**
 * Reglas del módulo y del submódulo. El código repite aquí el patrón del
 * atributo `pattern` para poder dar un mensaje en castellano en vez del texto
 * genérico del navegador.
 */
const MODULE_RULES: FieldRules = {
  code: [
    { kind: "required", label: "El código" },
    {
      kind: "pattern",
      label: "El código",
      message:
        "El código empieza por una letra y solo admite letras, números y guion bajo.",
      regexp: /^[A-Za-z][A-Za-z0-9_]{1,63}$/u,
    },
  ],
  description: [
    { kind: "minLength", label: "La descripción", min: 2 },
    { kind: "maxLength", label: "La descripción", max: 500 },
  ],
  name: [
    { kind: "required", label: "El nombre" },
    { kind: "minLength", label: "El nombre", min: 2 },
    { kind: "maxLength", label: "El nombre", max: 255 },
  ],
};
const MODULE_REASON_RULES: FieldRules = {
  reason: [
    { kind: "required", label: "El motivo" },
    { kind: "minLength", label: "El motivo", min: 2 },
    { kind: "maxLength", label: "El motivo", max: 500 },
  ],
};
const CODE_TITLE =
  "Use solo letras, números y guion bajo, sin espacios ni acentos.";

/** Duración total del resaltado del elemento recién creado. */
const HIGHLIGHT_MS = 3600;

/**
 * Identificadores `?creado` ya mostrados en esta sesión de la aplicación. Al
 * volver con «Atrás», Next reutiliza la vista guardada con el mismo
 * `initialHighlightId`; sin este registro el elemento volvería a parpadear y a
 * llevarse el foco como si se acabara de crear.
 */
const consumedInitialHighlights = new Set<string>();

/**
 * Icono temático de la tarjeta. Se elige por el nombre del módulo para que cada
 * área de la biblioteca se reconozca de un vistazo, como en la referencia
 * visual. El trazo es el mismo en todos los casos para que el conjunto resulte
 * homogéneo.
 */
function ModuleIcon({ name }: { name: string }) {
  const text = name.toLocaleLowerCase("es");
  const shape = text.includes("remuner") ? (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v12c0 1.7 3 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3 3 7 3s7-1.3 7-3" />
    </>
  ) : text.includes("evaluaci") ? (
    <>
      <path d="m3 9 9-4 9 4-9 4zM6 11v5c3 2 9 2 12 0v-5M21 9v6" />
    </>
  ) : text.includes("contrat") ? (
    <>
      <rect x="3" y="8" width="18" height="12" rx="2" />
      <path d="M8 8V5h8v3M3 13h18M10 13v2h4v-2" />
    </>
  ) : text.includes("auxiliar") ? (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20v-1a6 6 0 0 1 12 0v1M16 6a3 3 0 0 1 0 6M16 14a5 5 0 0 1 5 5v1" />
    </>
  ) : text.includes("ley") ||
    text.includes("reglament") ||
    text.includes("normat") ? (
    <>
      <path d="M12 3v18M7 21h10M5 7h14M5 7 2 14h6zM19 7l-3 7h6z" />
    </>
  ) : text.includes("cargo") || text.includes("plaza") ? (
    <>
      <path d="M3 21h18M4 21V9l8-5 8 5v12M9 21v-6h6v6M4 9h16" />
    </>
  ) : text.includes("situaci") ? (
    <>
      <rect x="4" y="4" width="16" height="17" rx="2" />
      <path d="M9 4V3h6v1M8 10h8M8 14h8M8 18h5" />
    </>
  ) : (
    <path d="M3 6h7l2 2h9v11H3z" />
  );
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {shape}
    </svg>
  );
}

/** Icono del resumen: módulos (carpeta), submódulos (capas) y documentos. */
function SummaryIcon({ kind }: { kind: "folder" | "layers" | "documents" }) {
  const shape =
    kind === "folder" ? (
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    ) : kind === "layers" ? (
      <path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5" />
    ) : (
      <>
        <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
        <path d="M14 3v6h6M8 13h8M8 17h6" />
      </>
    );
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {shape}
    </svg>
  );
}

/** Icono pequeño de las etiquetas «N submódulos» y «N documentos». */
function StatIcon({ kind }: { kind: "layers" | "documents" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {kind === "layers" ? (
        <path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5" />
      ) : (
        <>
          <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
          <path d="M14 3v6h6M8 13h8M8 17h6" />
        </>
      )}
    </svg>
  );
}

function submoduleWord(count: number): string {
  return count === 1 ? "submódulo" : "submódulos";
}

function documentWord(count: number): string {
  return count === 1 ? "documento" : "documentos";
}

/** Un módulo sin submódulos cuyos documentos están asociados a él mismo. */
function hasOwnDocuments(module: ModuleView): boolean {
  return module.submoduleCount === 0 && module.documentCount > 0;
}

/** Quita `creado` de la dirección sin volver a pedir la página al servidor. */
function removeCreatedParam(createdId: string): void {
  const url = new URL(window.location.href);
  if (url.searchParams.get("creado") !== createdId) return;
  url.searchParams.delete("creado");
  // Next integra `history.replaceState` con su enrutador: sincroniza la ruta
  // sin navegar ni desplazar, a diferencia de `router.replace`, que volvería a
  // renderizar la página en el servidor y a consultar el API.
  window.history.replaceState(
    null,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}

/**
 * Informa al explorador de si el formulario de alta está enviándose. Vive
 * dentro del `<form>` porque `useFormStatus` solo lee el formulario que lo
 * contiene.
 */
function PendingWatcher({
  onChange,
}: {
  onChange: (pending: boolean) => void;
}) {
  const { pending } = useFormStatus();

  useEffect(() => {
    onChange(pending);
  }, [onChange, pending]);

  useEffect(() => () => onChange(false), [onChange]);

  return null;
}

/** Formulario de edición de un módulo o submódulo. */
function ModuleEditForm({
  fieldId,
  module,
  onDone,
  parents,
}: {
  fieldId: string;
  module: ModuleView;
  onDone?: () => void;
  parents: ModuleParentOption[];
}) {
  return (
    <AdminActionForm
      action={updateModuleAction}
      rules={MODULE_RULES}
      submitLabel="Guardar cambios"
      successMessage="Módulo actualizado con éxito."
      onSuccess={onDone}
    >
      <input name="moduleId" type="hidden" value={module.id} />
      <label className={styles.fieldLabel} htmlFor={`${fieldId}-name`}>
        Nombre
      </label>
      <input
        className={styles.input}
        defaultValue={module.name}
        id={`${fieldId}-name`}
        maxLength={255}
        minLength={2}
        name="name"
        required
      />
      <FieldError name="name" />
      <label className={styles.fieldLabel} htmlFor={`${fieldId}-code`}>
        Código
      </label>
      <input
        className={styles.input}
        defaultValue={module.code}
        id={`${fieldId}-code`}
        name="code"
        pattern={CODE_PATTERN}
        required
        title={CODE_TITLE}
      />
      <FieldError name="code" />
      <label className={styles.fieldLabel} htmlFor={`${fieldId}-description`}>
        Descripción (opcional)
      </label>
      <textarea
        className={styles.textarea}
        defaultValue={module.description ?? ""}
        id={`${fieldId}-description`}
        maxLength={500}
        minLength={2}
        name="description"
      />
      <FieldError name="description" />
      <label className={styles.fieldLabel} htmlFor={`${fieldId}-order`}>
        Orden
      </label>
      <input
        className={styles.input}
        defaultValue={module.sortOrder}
        id={`${fieldId}-order`}
        min="0"
        name="sortOrder"
        type="number"
      />
      <FieldError name="sortOrder" />
      {module.parentModuleId ? (
        <>
          <label className={styles.fieldLabel} htmlFor={`${fieldId}-parent`}>
            Módulo padre
          </label>
          <select
            className={styles.input}
            defaultValue="__keep__"
            id={`${fieldId}-parent`}
            name="parentModuleId"
          >
            <option value="__keep__">Mantener padre actual</option>
            {parents
              .filter((parent) => parent.id !== module.id)
              .map((parent) => (
                <option key={parent.id} value={parent.id}>
                  {parent.name} ({parent.code})
                </option>
              ))}
          </select>
          <FieldError name="parentModuleId" />
        </>
      ) : (
        <p className={styles.presetParent}>
          Módulo padre: <strong>Sin padre</strong>
        </p>
      )}
      {onDone ? (
        <div style={{ marginTop: "1rem" }}>
          <button
            className="avend-button avend-button--secondary"
            onClick={onDone}
            type="button"
          >
            Cancelar
          </button>
        </div>
      ) : null}
    </AdminActionForm>
  );
}

/** Activar o desactivar un módulo, con el motivo que exige la baja. */
function ModuleStatusForm({
  fieldId,
  module,
  onDone,
}: {
  fieldId: string;
  module: ModuleView;
  onDone?: () => void;
}) {
  return (
    <AdminActionForm
      action={setModuleStatusAction}
      rules={module.isActive ? MODULE_REASON_RULES : {}}
      submitLabel={module.isActive ? "Desactivar" : "Activar"}
      onSuccess={onDone}
    >
      <input name="moduleId" type="hidden" value={module.id} />
      <input name="isActive" type="hidden" value={String(!module.isActive)} />
      {module.isActive ? (
        <label
          className={styles.fieldLabel}
          htmlFor={`${fieldId}-status-reason`}
        >
          Motivo de desactivación
          <input
            className={styles.input}
            id={`${fieldId}-status-reason`}
            maxLength={500}
            minLength={2}
            name="reason"
            required
          />
          <FieldError name="reason" />
        </label>
      ) : null}
    </AdminActionForm>
  );
}

/** Confirmación de la eliminación lógica con su motivo obligatorio. */
function ModuleDeleteForm({
  fieldId,
  module,
  onDone,
}: {
  fieldId: string;
  module: ModuleView;
  onDone?: () => void;
}) {
  return (
    <AdminActionForm
      action={deleteModuleAction}
      rules={MODULE_REASON_RULES}
      submitLabel={
        module.parentModuleId
          ? "Sí, eliminar submódulo"
          : "Sí, eliminar módulo"
      }
      onSuccess={onDone}
      tone="danger"
    >
      <input name="moduleId" type="hidden" value={module.id} />
      {/* Tras el borrado, el servidor redirige aquí para no quedar en la
        ruta del módulo eliminado (que daría 404). */}
      <input
        name="redirectTo"
        type="hidden"
        value={
          module.parentModuleId
            ? `/admin/modules/${module.parentModuleId}`
            : "/admin/modules"
        }
      />
      <label
        className={styles.fieldLabel}
        htmlFor={`${fieldId}-delete-reason`}
      >
        Motivo de baja
        <input
          className={styles.input}
          id={`${fieldId}-delete-reason`}
          maxLength={500}
          minLength={2}
          name="reason"
          required
        />
        <FieldError name="reason" />
      </label>
    </AdminActionForm>
  );
}

/**
 * Acciones de una fila de submódulos. Iconos con trazo homogéneo y texto
 * alternativo en el botón, para que se entiendan sin depender del color.
 */
function EyeIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
      <path d="M14.5 6.5 17.5 9.5" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </svg>
  );
}

/**
 * Ficha del módulo que encabeza su página: icono temático, nombre, código,
 * orden, estado y descripción, con el botón «Editar módulo» que abre el mismo
 * formulario de gestión que usa el resto de la sección.
 */
export function ModuleDetailHero({
  canManage = true,
  module,
  parentName,
  parents,
}: {
  canManage?: boolean;
  module: ModuleView;
  /** Módulo al que pertenece el submódulo; se muestra como contexto. */
  parentName?: string;
  parents: ModuleParentOption[];
}) {
  const [isEditOpen, setEditOpen] = useState(false);
  const titleId = `${useId()}-module-hero`;
  const closeEdit = useCallback(() => setEditOpen(false), []);
  const isSubmodule = Boolean(parentName);

  return (
    <section
      aria-labelledby={titleId}
      className={`${styles.hero}${isSubmodule ? ` ${styles.heroSub}` : ""}`}
    >
      <span aria-hidden="true" className={styles.heroIcon}>
        <ModuleIcon name={module.name} />
      </span>
      <div className={styles.heroBody}>
        {isSubmodule ? <p className={styles.heroSubPill}>Submódulo</p> : null}
        <div className={styles.heroTitleRow}>
          <h1 className={styles.heroTitle} id={titleId}>
            {module.name}
          </h1>
          {!isSubmodule ? (
            <span
              className={
                module.isActive ? styles.badgeActive : styles.badgeInactive
              }
            >
              {module.isActive ? "Activo" : "Inactivo"}
            </span>
          ) : null}
        </div>
        {!isSubmodule ? (
          <dl className={styles.heroMeta}>
            <div>
              <dt>Código</dt>
              <dd>{module.code}</dd>
            </div>
            <div>
              <dt>Orden</dt>
              <dd>{module.sortOrder}</dd>
            </div>
            <div>
              <dt>Tipo</dt>
              <dd>{module.parentModuleId ? "Submódulo" : "Módulo principal"}</dd>
            </div>
          </dl>
        ) : null}
        {module.description ? (
          <p className={styles.heroDescription}>{module.description}</p>
        ) : null}
      </div>
      {canManage || isSubmodule ? (
        <div className={styles.heroActions}>
          {isSubmodule ? (
            <span
              className={
                module.isActive ? styles.badgeActiveSub : styles.badgeInactive
              }
            >
              {module.isActive ? "Activo" : "Inactivo"}
            </span>
          ) : null}
          {canManage ? (
            <button
              className={isSubmodule ? styles.editSubButton : styles.editButton}
              onClick={() => setEditOpen(true)}
              type="button"
            >
              <PencilIcon />
              {isSubmodule ? "Editar submódulo" : "Editar módulo"}
            </button>
          ) : null}
        </div>
      ) : null}
      {isEditOpen ? (
        <Modal
          canClose
          onClose={closeEdit}
          title={`Editar ${module.name}`}
          titleId={`${titleId}-edit`}
        >
          <div className={styles.manageGrid}>
            <ModuleEditForm
              fieldId={titleId}
              module={module}
              onDone={closeEdit}
              parents={parents}
            />
            <div className={styles.manageSide}>
              <ModuleStatusForm
                fieldId={titleId}
                module={module}
                onDone={closeEdit}
              />
              {module.submoduleCount > 0 ? (
                <p className={styles.presetParent} role="note">
                  Este módulo tiene {module.submoduleCount}{" "}
                  {submoduleWord(module.submoduleCount)}. Elimina primero sus
                  submódulos para poder eliminar el módulo.
                </p>
              ) : (
                <DeleteDisclosure
                  description={
                    <p>
                      El módulo dejará de aparecer para los docentes y en la
                      gestión. La eliminación es lógica: se conserva su
                      historial.
                    </p>
                  }
                  title="¿Eliminar este módulo?"
                  triggerLabel="Eliminar módulo"
                >
                  <ModuleDeleteForm
                    fieldId={titleId}
                    module={module}
                    onDone={closeEdit}
                  />
                </DeleteDisclosure>
              )}
            </div>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}

/**
 * Modal accesible y autónomo para los formularios de alta y edición. Se abre
 * desde un botón y se cierra con Escape, al hacer clic fuera o en el botón de
 * cerrar. Atrapa el foco, bloquea el desplazamiento del fondo y lo devuelve al
 * control que lo abrió. No cambia la lógica del formulario que envuelve.
 *
 * Mientras el envío está en curso no se puede cerrar: el resultado del servidor
 * llega al formulario del modal, y si este se desmontara el alta se haría sin
 * aviso ni resaltado, y la persona podría repetirla creyendo que falló.
 */
function Modal({
  canClose,
  children,
  onClose,
  title,
  titleId,
}: {
  canClose: boolean;
  children: ReactNode;
  onClose: () => void;
  title: string;
  titleId: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // El efecto de apertura no debe repetirse cuando cambia `canClose` (volvería
  // a enfocar el diálogo y a capturar el control de origen), así que el
  // manejador de teclado lee el valor vigente desde una referencia.
  const canCloseRef = useRef(canClose);

  useEffect(() => {
    canCloseRef.current = canClose;
  }, [canClose]);

  const requestClose = useCallback(() => {
    if (canCloseRef.current) onClose();
  }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        requestClose();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      opener?.focus?.();
    };
  }, [requestClose]);

  return createPortal(
    <div
      className={styles.modalOverlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className={styles.modalDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle} id={titleId}>
            {title}
          </h2>
          <button
            aria-label="Cerrar"
            className={styles.modalClose}
            disabled={!canClose}
            onClick={requestClose}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <div className={styles.modalBody}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Formulario de alta dentro del modal. Vive montado solo mientras el modal está
 * abierto, así que su estado (tipo, padre, estado) empieza limpio cada vez.
 *
 * Aplica en la interfaz las reglas de jerarquía que la base de datos impone al
 * crear un submódulo, para no ofrecer una opción que el servidor rechazará:
 * - un submódulo activo exige un padre activo, así que con un padre inactivo el
 *   submódulo solo puede crearse inactivo;
 * - un módulo con documentos propios no admite submódulos.
 */
function CreateModuleForm({
  context,
  fieldId,
  modules,
  onPendingChange,
  onSuccess,
  parents,
}: {
  context: ExplorerContext;
  fieldId: string;
  modules: ModuleView[];
  onPendingChange: (pending: boolean) => void;
  onSuccess: (state: AdminActionState) => void;
  parents: ModuleParentOption[];
}) {
  const isRoot = context.kind === "root";
  const [createKind, setCreateKind] = useState<"module" | "submodule">(
    isRoot ? "module" : "submodule",
  );
  const [parentId, setParentId] = useState("");
  const [statusChoice, setStatusChoice] = useState<"false" | "true">("true");
  // En la raíz, `modules` son justamente los módulos principales: de ahí salen
  // el estado y los documentos de cada posible padre.
  const rootById = useMemo(
    () => new Map(modules.map((module) => [module.id, module])),
    [modules],
  );
  const selectedParent =
    isRoot && createKind === "submodule" ? rootById.get(parentId) : undefined;
  const parentInactive = isRoot
    ? selectedParent?.isActive === false
    : context.moduleIsActive === false;
  const statusValue = parentInactive ? "false" : statusChoice;

  return (
    <AdminActionForm
      action={createModuleAction}
      className={styles.createForm}
      onSuccess={onSuccess}
      rules={MODULE_RULES}
      submitLabel={isRoot ? "Crear" : "Crear submódulo"}
    >
      <PendingWatcher onChange={onPendingChange} />
      {isRoot ? (
        <>
          {/* Un submódulo creado desde la raíz se muestra en la página de su
              padre: el servidor redirige allí y esa es la única recarga. */}
          <input name="afterCreate" type="hidden" value="parent" />
          <label className={styles.fieldLabel} htmlFor={`${fieldId}-kind`}>
            Tipo de elemento
            <select
              className={styles.input}
              id={`${fieldId}-kind`}
              onChange={(event) =>
                setCreateKind(event.target.value as "module" | "submodule")
              }
              value={createKind}
            >
              <option value="module">Módulo principal</option>
              <option value="submodule">Submódulo</option>
            </select>
          </label>
        </>
      ) : (
        <input name="parentModuleId" type="hidden" value={context.moduleId} />
      )}
      <label className={styles.fieldLabel} htmlFor={`${fieldId}-new-name`}>
        Nombre
      </label>
      <input
        className={styles.input}
        id={`${fieldId}-new-name`}
        maxLength={255}
        minLength={2}
        name="name"
        required
      />
      <FieldError name="name" />
      <label className={styles.fieldLabel} htmlFor={`${fieldId}-new-code`}>
        Código
      </label>
      <input
        className={styles.input}
        id={`${fieldId}-new-code`}
        name="code"
        pattern={CODE_PATTERN}
        placeholder="EVALUACION_DOCENTE"
        required
        title={CODE_TITLE}
      />
      <FieldError name="code" />
      <label
        className={styles.fieldLabel}
        htmlFor={`${fieldId}-new-description`}
      >
        Descripción (opcional)
      </label>
      <textarea
        className={styles.textarea}
        id={`${fieldId}-new-description`}
        maxLength={500}
        minLength={2}
        name="description"
      />
      <FieldError name="description" />
      <label className={styles.fieldLabel} htmlFor={`${fieldId}-new-order`}>
        Orden (opcional)
      </label>
      <input
        className={styles.input}
        id={`${fieldId}-new-order`}
        min="0"
        name="sortOrder"
        type="number"
      />
      <FieldError name="sortOrder" />
      {isRoot && createKind === "submodule" ? (
        <>
          <label
            className={styles.fieldLabel}
            htmlFor={`${fieldId}-new-parent`}
          >
            Módulo padre
          </label>
          <select
            aria-describedby={`${fieldId}-parent-hint`}
            className={styles.input}
            id={`${fieldId}-new-parent`}
            name="parentModuleId"
            onChange={(event) => setParentId(event.target.value)}
            required
            value={parentId}
          >
            <option disabled value="">
              Selecciona un módulo principal
            </option>
            {parents.map((parent) => {
              const view = rootById.get(parent.id);
              const blocked = view ? hasOwnDocuments(view) : false;
              const suffix = blocked
                ? " — tiene documentos propios"
                : view?.isActive === false
                  ? " — inactivo"
                  : "";
              return (
                <option disabled={blocked} key={parent.id} value={parent.id}>
                  {parent.name} ({parent.code}){suffix}
                </option>
              );
            })}
          </select>
          <p className={styles.fieldHint} id={`${fieldId}-parent-hint`}>
            Un módulo que ya tiene documentos propios no admite submódulos.
          </p>
          <FieldError name="parentModuleId" />
        </>
      ) : isRoot ? (
        <input name="parentModuleId" type="hidden" value="__root__" />
      ) : null}
      <label className={styles.fieldLabel} htmlFor={`${fieldId}-new-status`}>
        Estado
        <select
          aria-describedby={
            parentInactive ? `${fieldId}-status-hint` : undefined
          }
          className={styles.input}
          id={`${fieldId}-new-status`}
          name="isActive"
          onChange={(event) =>
            setStatusChoice(event.target.value as "false" | "true")
          }
          value={statusValue}
        >
          <option disabled={parentInactive} value="true">
            Activo
          </option>
          <option value="false">Inactivo</option>
        </select>
      </label>
      {parentInactive ? (
        <p className={styles.fieldHint} id={`${fieldId}-status-hint`}>
          El módulo padre está inactivo, así que el submódulo se creará
          inactivo. Podrás activarlo después de activar el módulo padre.
        </p>
      ) : null}
      {isRoot ? null : (
        <p className={styles.presetParent}>
          Módulo padre: <strong>{context.moduleName}</strong>
        </p>
      )}
    </AdminActionForm>
  );
}

/**
 * Hierarchical, searchable view of modules or the submodules of a module.
 * Navigation only: it reuses the existing module Server Actions and links to
 * the documents view; it performs no document management itself.
 */
export function ModulesExplorer({
  canCreate = true,
  context,
  initialHighlightId,
  modules,
  parents,
}: ModulesExplorerProps) {
  const { showToast } = useToast();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);
  // Fila cuyo panel de edición o de eliminación está abierto. Solo la vista de
  // submódulos (tabla) usa estos diálogos; las tarjetas conservan sus detalles.
  const [editingId, setEditingId] = useState<string>();
  const [deletingId, setDeletingId] = useState<string>();
  // Elemento resaltado (parpadeo). Se retira siempre a los HIGHLIGHT_MS.
  const [highlightId, setHighlightId] = useState<string | undefined>(() =>
    initialHighlightId && !consumedInitialHighlights.has(initialHighlightId)
      ? initialHighlightId
      : undefined,
  );
  // Tarjeta que recibió el foco: conserva `tabIndex=-1` hasta que la persona
  // salga de ella, aunque el resaltado ya haya terminado. Quitarle el atributo
  // con el foco dentro lo devolvería a <body> y se perdería la posición.
  const [focusedCardId, setFocusedCardId] = useState<string>();
  const revealedId = useRef<string | undefined>(undefined);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const closeCreate = useCallback(() => setCreateOpen(false), []);

  /**
   * Cambio de vista con transición suave. Si el navegador soporta la View
   * Transitions API se anima el reacomodo de las tarjetas; si no, o si la
   * persona pidió menos movimiento, el cambio es inmediato. `flushSync` es
   * necesario para que la nueva vista exista cuando el navegador captura el
   * fotograma final de la transición.
   */
  const changeView = (next: "grid" | "list") => {
    if (next === view) return;
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const animatedDocument = document as Document & {
      startViewTransition?: (callback: () => void) => unknown;
    };
    if (
      prefersReducedMotion ||
      typeof animatedDocument.startViewTransition !== "function"
    ) {
      setView(next);
      return;
    }
    animatedDocument.startViewTransition(() => {
      flushSync(() => setView(next));
    });
  };

  const searchId = useId();
  const modalTitleId = `${searchId}-create-title`;
  const isRoot = context.kind === "root";
  const normalized = query.trim().toLocaleLowerCase("es");
  const hasDirectDocuments =
    context.kind === "module" &&
    context.hasDirectDocuments === true &&
    modules.length === 0;
  const showCreate = canCreate && !hasDirectDocuments;

  const filtered = useMemo(
    () =>
      modules.filter(
        (module) =>
          !normalized ||
          module.name.toLocaleLowerCase("es").includes(normalized) ||
          module.code.toLocaleLowerCase("es").includes(normalized),
      ),
    [modules, normalized],
  );
  const editingModule = modules.find((module) => module.id === editingId);
  const deletingModule = modules.find((module) => module.id === deletingId);
  const closeEdit = useCallback(() => setEditingId(undefined), []);
  const closeDelete = useCallback(() => setDeletingId(undefined), []);
  const emptyMessage =
    modules.length === 0
      ? isRoot
        ? canCreate
          ? "Aún no hay módulos. Crea el primero con el botón «Crear módulo»."
          : "No tienes módulos asignados."
        : hasDirectDocuments
          ? "Este módulo guarda sus documentos directamente, sin submódulos."
          : canCreate
            ? "Este módulo aún no tiene submódulos. Puedes crear uno o ver sus documentos."
            : "No tienes submódulos asignados."
      : "Ningún resultado coincide con la búsqueda.";

  const finishCreate = useCallback((state: AdminActionState) => {
    setCreateOpen(false);
    if (!state.entityId) return;
    // Una búsqueda activa podría ocultar la tarjeta nueva: se limpia para que
    // el elemento recién creado quede siempre a la vista.
    setQuery("");
    revealedId.current = undefined;
    setHighlightId(state.entityId);
  }, []);

  // Llegada desde la raíz con `?creado=`: confirmar una sola vez y limpiar la
  // dirección, para que recargar, volver atrás o compartir el enlace no repita
  // el aviso ni el parpadeo.
  useEffect(() => {
    if (!initialHighlightId) return;
    if (consumedInitialHighlights.has(initialHighlightId)) {
      removeCreatedParam(initialHighlightId);
      return;
    }
    consumedInitialHighlights.add(initialHighlightId);
    removeCreatedParam(initialHighlightId);
    showToast("Submódulo creado.");
  }, [initialHighlightId, showToast]);

  // El resaltado termina siempre, aparezca o no la tarjeta en pantalla.
  useEffect(() => {
    if (!highlightId) return;
    const timer = window.setTimeout(
      () => setHighlightId(undefined),
      HIGHLIGHT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [highlightId]);

  // Desplaza y enfoca la tarjeta nueva en cuanto llega con la lista revalidada.
  useEffect(() => {
    if (!highlightId || revealedId.current === highlightId) return;
    const createdCard = cardRefs.current.get(highlightId);
    if (!createdCard) return;
    revealedId.current = highlightId;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    createdCard.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "center",
    });
    setFocusedCardId(highlightId);
    createdCard.focus({ preventScroll: true });
  }, [filtered, highlightId]);

  return (
    <div className={`${styles.explorer} ${isRoot ? styles.rootExplorer : ""}`}>
      {isRoot ? (
        <div className={styles.summary} aria-label="Resumen de módulos">
          <div>
            <span aria-hidden="true" className={styles.summaryIcon}>
              <SummaryIcon kind="folder" />
            </span>
            <span>
              <strong>{modules.length}</strong>
              <span>Módulos registrados</span>
            </span>
          </div>
          <div>
            <span aria-hidden="true" className={styles.summaryIcon}>
              <SummaryIcon kind="layers" />
            </span>
            <span>
              <strong>
                {modules.reduce(
                  (total, module) => total + module.submoduleCount,
                  0,
                )}
              </strong>
              <span>Submódulos en total</span>
            </span>
          </div>
          <div>
            <span aria-hidden="true" className={styles.summaryIcon}>
              <SummaryIcon kind="documents" />
            </span>
            <span>
              <strong>
                {modules.some((module) => module.canManage === false)
                  ? "—"
                  : modules.reduce(
                      (total, module) => total + module.documentCount,
                      0,
                    )}
              </strong>
              <span>Documentos vinculados</span>
            </span>
          </div>
        </div>
      ) : null}
      {isRoot ? (
        <>
          <div className={styles.toolbar}>
            <div className={styles.visuallyHidden}>
              <h2 className={styles.title}>Módulos</h2>
              <span className={styles.count}>{modules.length} en total</span>
            </div>
            {/* El buscador va primero y a la izquierda; el botón de crear queda
                al extremo derecho. En móvil el botón sube a la primera línea a
                ancho completo. */}
            <div className={styles.toolbarActions}>
              <input
                aria-label="Buscar módulo por nombre o código"
                className={styles.search}
                id={`${searchId}-search`}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar módulo por nombre o código…"
                type="search"
                value={query}
              />
              <div
                className={styles.viewToggle}
                role="group"
                aria-label="Vista de módulos"
              >
                <button
                  type="button"
                  aria-label="Vista de tarjetas"
                  aria-pressed={view === "grid"}
                  onClick={() => changeView("grid")}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="4" y="4" width="6.5" height="6.5" rx="1" />
                    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1" />
                    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1" />
                    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1" />
                  </svg>
                </button>
                <button
                  type="button"
                  aria-label="Vista de lista"
                  aria-pressed={view === "list"}
                  onClick={() => changeView("list")}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              </div>
              {showCreate ? (
                <button
                  className={`avend-button avend-button--primary ${styles.createButton}`}
                  onClick={() => setCreateOpen(true)}
                  type="button"
                >
                  + Crear módulo
                </button>
              ) : null}
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className={styles.empty}>{emptyMessage}</p>
          ) : (
            <ul
              className={`${styles.grid} ${view === "list" ? styles.listView : ""}`}
              role="list"
            >
          {filtered.map((module, index) => {
            const isNew = highlightId === module.id;
            return (
              <li
                className={`${styles.card} ${isNew ? styles.cardNew : ""}`}
                data-highlighted={isNew ? "true" : undefined}
                key={module.id}
                style={
                  {
                    "--module-index": Math.min(index, 8),
                    viewTransitionName: `module-card-${module.id.replace(/[^A-Za-z0-9_-]/gu, "")}`,
                  } as CSSProperties
                }
                onBlur={
                  focusedCardId === module.id
                    ? (event) => {
                        if (event.target === event.currentTarget) {
                          setFocusedCardId(undefined);
                        }
                      }
                    : undefined
                }
                ref={(element) => {
                  if (element) cardRefs.current.set(module.id, element);
                  else cardRefs.current.delete(module.id);
                }}
                tabIndex={isNew || focusedCardId === module.id ? -1 : undefined}
              >
                <div className={styles.cardHeader}>
                  {/* Repite el nombre del título: se oculta al lector de
                      pantalla para que no lo lea dos veces. */}
                  <div aria-hidden="true" className={styles.moduleTag}>
                    <ModuleIcon name={module.name} />
                  </div>
                  <span
                    className={
                      module.isActive
                        ? styles.badgeActive
                        : styles.badgeInactive
                    }
                  >
                    {module.isActive ? "Activo" : "Inactivo"}
                  </span>
                </div>
                <h3 className={styles.cardTitle}>{module.name}</h3>
                {module.description ? (
                  <p className={styles.cardDescription}>{module.description}</p>
                ) : null}
                <div className={styles.cardStats}>
                  <span className={styles.cardChip}>
                    <StatIcon kind="layers" />
                    {module.submoduleCount}{" "}
                    {submoduleWord(module.submoduleCount)}
                  </span>
                  {module.canManage === false ? (
                    <span className={styles.cardChip}>
                      Conteo de documentos no disponible
                    </span>
                  ) : (
                    <span className={styles.cardChip}>
                      <StatIcon kind="documents" />
                      {module.documentCount}{" "}
                      {documentWord(module.documentCount)}
                    </span>
                  )}
                </div>
                <div className={styles.cardFooter}>
                  <Link
                    className={styles.cardLink}
                    href={`/admin/modules/${module.id}`}
                  >
                    Ingresar <span aria-hidden="true">→</span>
                  </Link>
                </div>
              </li>
            );
          })}
            </ul>
          )}
        </>
      ) : (
        <div className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <div className={styles.tableHeading}>
              <h2 className={styles.title}>Submódulos</h2>
              <span className={styles.countBadge}>{modules.length}</span>
            </div>
            <div className={styles.tableTools}>
              <input
                aria-label="Buscar submódulo por nombre o código"
                className={styles.search}
                id={`${searchId}-search`}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar submódulo…"
                type="search"
                value={query}
              />
              {showCreate ? (
                <button
                  className={`avend-button avend-button--primary ${styles.createButton}`}
                  onClick={() => setCreateOpen(true)}
                  type="button"
                >
                  + Crear submódulo
                </button>
              ) : null}
            </div>
          </div>
          {canCreate && hasDirectDocuments ? (
            <p className={styles.tableNote} role="note">
              Este módulo ya tiene documentos propios, por eso no admite
              submódulos. Si necesitas submódulos, primero cambia esos
              documentos a otro módulo o submódulo.
            </p>
          ) : null}
          {filtered.length === 0 ? (
            <p className={styles.emptyTable}>{emptyMessage}</p>
          ) : (
            <div className={styles.tableScroll}>
              <table className={styles.table} role="table">
                <caption className={styles.visuallyHidden}>
                  Submódulos de{" "}
                  {context.kind === "module" ? context.moduleName : ""}
                </caption>
                <thead role="rowgroup">
                  <tr role="row">
                    <th role="columnheader" scope="col">
                      Submódulo
                    </th>
                    <th role="columnheader" scope="col">
                      Código
                    </th>
                    <th role="columnheader" scope="col">
                      Orden
                    </th>
                    <th role="columnheader" scope="col">
                      Estado
                    </th>
                    <th role="columnheader" scope="col">
                      Documentos
                    </th>
                    <th role="columnheader" scope="col">
                      <span className={styles.visuallyHidden}>Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {filtered.map((module) => {
                    const isNew = highlightId === module.id;
                    return (
                      <tr
                        className={`${styles.row} ${isNew ? styles.rowNew : ""}`}
                        data-highlighted={isNew ? "true" : undefined}
                        key={module.id}
                        role="row"
                        onBlur={
                          focusedCardId === module.id
                            ? (event) => {
                                if (event.target === event.currentTarget) {
                                  setFocusedCardId(undefined);
                                }
                              }
                            : undefined
                        }
                        ref={(element) => {
                          if (element) cardRefs.current.set(module.id, element);
                          else cardRefs.current.delete(module.id);
                        }}
                        tabIndex={
                          isNew || focusedCardId === module.id ? -1 : undefined
                        }
                      >
                        <th
                          className={styles.rowModule}
                          role="rowheader"
                          scope="row"
                        >
                          <div className={styles.rowModuleInner}>                            <span aria-hidden="true" className={styles.rowIcon}>
                              <ModuleIcon name={module.name} />
                            </span>
                            <span className={styles.rowText}>
                              <h3 className={styles.rowTitle}>{module.name}</h3>
                              {module.description ? (
                                <span className={styles.rowDescription}>
                                  {module.description}
                                </span>
                              ) : null}
                            </span>
                          </div>
                        </th>
                        <td data-label="Código" role="cell">
                          <code className={styles.codeChip}>
                            {module.code}
                          </code>
                        </td>
                        <td data-label="Orden" role="cell">
                          <span className={styles.orderBadge}>
                            {module.sortOrder}
                          </span>
                        </td>
                        <td data-label="Estado" role="cell">
                          <span
                            className={
                              module.isActive
                                ? styles.badgeActive
                                : styles.badgeInactive
                            }
                          >
                            {module.isActive ? "Activo" : "Inactivo"}
                          </span>
                        </td>
                        <td data-label="Documentos" role="cell">
                          <span className={styles.docCount}>
                            <StatIcon kind="documents" />
                            {module.documentCount}{" "}
                            {documentWord(module.documentCount)}
                          </span>
                        </td>
                        <td data-label="Acciones" role="cell">
                          <div className={styles.rowActions}>
                            <Link
                              aria-label={`Ver ${module.name}`}
                              className={`${styles.iconButton} ${styles.viewButton}`}
                              href={`/admin/modules/${module.id}`}
                              title="Ver contenido"
                            >
                              <EyeIcon />
                            </Link>
                            <button
                              aria-label={`Editar ${module.name}`}
                              className={`${styles.iconButton} ${styles.rowEditButton}`}
                              onClick={() => setEditingId(module.id)}
                              title="Editar"
                              type="button"
                            >
                              <PencilIcon />
                            </button>
                            <button
                              aria-label={`Eliminar ${module.name}`}
                              className={`${styles.iconButton} ${styles.rowDeleteButton}`}
                              onClick={() => setDeletingId(module.id)}
                              title="Eliminar"
                              type="button"
                            >
                              <TrashIcon />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {editingModule ? (
        <Modal
          canClose
          onClose={closeEdit}
          title={`Editar ${editingModule.name}`}
          titleId={`${searchId}-edit-title`}
        >
          <div className={styles.manageGrid}>
            <ModuleEditForm
              fieldId={`${searchId}-edit`}
              module={editingModule}
              onDone={closeEdit}
              parents={parents}
            />
            <div className={styles.manageSide}>
              <ModuleStatusForm
                fieldId={`${searchId}-edit`}
                module={editingModule}
                onDone={closeEdit}
              />
              {editingModule.submoduleCount > 0 ? (
                <p className={styles.presetParent} role="note">
                  Este módulo tiene {editingModule.submoduleCount}{" "}
                  {submoduleWord(editingModule.submoduleCount)}. Elimina primero
                  sus submódulos para poder eliminar el módulo.
                </p>
              ) : (
                <DeleteDisclosure
                  description={
                    <p>
                      El submódulo dejará de aparecer para los docentes y en la
                      gestión. La eliminación es lógica: se conserva su
                      historial.
                    </p>
                  }
                  title="¿Eliminar este submódulo?"
                  triggerLabel="Eliminar submódulo"
                >
                  <ModuleDeleteForm
                    fieldId={`${searchId}-edit`}
                    module={editingModule}
                    onDone={closeEdit}
                  />
                </DeleteDisclosure>
              )}
            </div>
          </div>
        </Modal>
      ) : null}

      {deletingModule ? (
        <Modal
          canClose
          onClose={closeDelete}
          title="Eliminar submódulo"
          titleId={`${searchId}-delete-title`}
        >
          {deletingModule.submoduleCount > 0 ? (
            <p className={styles.modalText} role="note">
              Este submódulo tiene {deletingModule.submoduleCount}{" "}
              {submoduleWord(deletingModule.submoduleCount)}. Elimina primero
              sus submódulos para poder eliminarlo.
            </p>
          ) : (
            <>
              <p className={styles.modalText}>
                <strong>{deletingModule.name}</strong> dejará de aparecer para
                los docentes y en la gestión. La eliminación es lógica: se
                conserva su historial.
              </p>
              <ModuleDeleteForm
                fieldId={`${searchId}-delete`}
                module={deletingModule}
                onDone={closeDelete}
              />
              <div className={styles.modalActions}>
                <button
                  className="avend-button avend-button--secondary"
                  onClick={closeDelete}
                  type="button"
                >
                  Cancelar
                </button>
              </div>
            </>
          )}
        </Modal>
      ) : null}

      {isCreateOpen ? (
        <Modal
          canClose={!isSubmitting}
          onClose={closeCreate}
          title={isRoot ? "Crear módulo o submódulo" : "Crear submódulo"}
          titleId={modalTitleId}
        >
          <CreateModuleForm
            context={context}
            fieldId={searchId}
            modules={modules}
            onPendingChange={setSubmitting}
            onSuccess={finishCreate}
            parents={parents}
          />
        </Modal>
      ) : null}
    </div>
  );
}
