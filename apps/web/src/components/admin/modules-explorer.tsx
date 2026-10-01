"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal, useFormStatus } from "react-dom";
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

function submoduleWord(count: number): string {
  return count === 1 ? "submódulo" : "submódulos";
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
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

/**
 * Informa al explorador de si el formulario de alta está enviándose. Vive
 * dentro del `<form>` porque `useFormStatus` solo lee el formulario que lo
 * contiene.
 */
function PendingWatcher({ onChange }: { onChange: (pending: boolean) => void }) {
  const { pending } = useFormStatus();

  useEffect(() => {
    onChange(pending);
  }, [onChange, pending]);

  useEffect(() => () => onChange(false), [onChange]);

  return null;
}

/** Collapsible edit / status / logical-delete controls for a single module. */
export function ModuleManageDetails({
  module,
  parents,
  summary = "",
}: {
  module: ModuleView;
  parents: ModuleParentOption[];
  summary?: string;
}) {
  const fieldId = useId();
  const [isOpen, setIsOpen] = useState(false);

  const closeForm = useCallback(() => setIsOpen(false), []);

  return (
    <details
      className={styles.manage}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
      open={isOpen}
    >
      <summary className={styles.manageSummary}>{summary}</summary>
      <div className={styles.manageGrid}>
        <AdminActionForm
          action={updateModuleAction}
          rules={MODULE_RULES}
          submitLabel="Guardar cambios"
          successMessage="Módulo actualizado con éxito."
          onSuccess={closeForm}
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
          <label
            className={styles.fieldLabel}
            htmlFor={`${fieldId}-description`}
          >
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
              <label
                className={styles.fieldLabel}
                htmlFor={`${fieldId}-parent`}
              >
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
          <div style={{ marginTop: "1rem" }}>
            <button
              className="avend-button"
              onClick={closeForm}
              type="button"
            >
              Cancelar
            </button>
          </div>
        </AdminActionForm>

        <div className={styles.manageSide}>
          <AdminActionForm
            action={setModuleStatusAction}
            rules={module.isActive ? MODULE_REASON_RULES : {}}
            submitLabel={module.isActive ? "Desactivar" : "Activar"}
            onSuccess={closeForm}
          >
            <input name="moduleId" type="hidden" value={module.id} />
            <input
              name="isActive"
              type="hidden"
              value={String(!module.isActive)}
            />
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
                  {module.parentModuleId ? "El submódulo" : "El módulo"} dejará
                  de aparecer para los docentes y en la gestión. La eliminación
                  es lógica: se conserva su historial.
                </p>
              }
              title={
                module.parentModuleId
                  ? "¿Eliminar este submódulo?"
                  : "¿Eliminar este módulo?"
              }
              triggerLabel={
                module.parentModuleId ? "Eliminar submódulo" : "Eliminar módulo"
              }
            >
            <AdminActionForm
              action={deleteModuleAction}
              rules={MODULE_REASON_RULES}
              submitLabel={
                module.parentModuleId
                  ? "Sí, eliminar submódulo"
                  : "Sí, eliminar módulo"
              }
              onSuccess={closeForm}
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
            </DeleteDisclosure>
          )}
        </div>
      </div>
    </details>
  );
}

/**
 * Modal accesible y autónomo para el formulario de creación. Encapsula el
 * formulario que antes se desplegaba al final del listado: se abre desde el
 * botón de la cabecera y se cierra con Escape, al hacer clic fuera o en el botón
 * de cerrar. Atrapa el foco, bloquea el desplazamiento del fondo y lo devuelve
 * al control que lo abrió. No cambia la lógica del formulario que envuelve.
 *
 * Mientras el envío está en curso no se puede cerrar: el resultado del servidor
 * llega al formulario del modal, y si este se desmontara el alta se haría sin
 * aviso ni resaltado, y la persona podría repetirla creyendo que falló.
 */
function CreateModal({
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
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);
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
  const cardRefs = useRef(new Map<string, HTMLLIElement>());
  const closeCreate = useCallback(() => setCreateOpen(false), []);
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
    <div className={styles.explorer}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarHeading}>
          <h2 className={styles.title}>{isRoot ? "Módulos" : "Submódulos"}</h2>
          <span className={styles.count}>{modules.length} en total</span>
        </div>
        {/* El buscador va primero y a la izquierda en todas las páginas; el
            botón de crear, cuando existe, queda al extremo derecho. En móvil
            el botón sube a la primera línea a ancho completo. */}
        <div className={styles.toolbarActions}>
          <input
            aria-label={
              isRoot
                ? "Buscar módulo por nombre o código"
                : "Buscar submódulo por nombre o código"
            }
            className={styles.search}
            id={`${searchId}-search`}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={isRoot ? "Buscar módulo…" : "Buscar submódulo…"}
            type="search"
            value={query}
          />
          {showCreate ? (
            <button
              className={`avend-button avend-button--primary ${styles.createButton}`}
              onClick={() => setCreateOpen(true)}
              type="button"
            >
              {isRoot ? "+ Crear módulo" : "+ Crear submódulo"}
            </button>
          ) : null}
        </div>
        {canCreate && hasDirectDocuments ? (
          <p className={styles.presetParent} role="note">
            Este módulo ya tiene documentos propios, por eso no admite
            submódulos. Si necesitas submódulos, primero cambia esos documentos
            a otro módulo o submódulo.
          </p>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <p className={styles.empty}>
          {modules.length === 0
            ? isRoot
              ? canCreate
                ? "Aún no hay módulos. Crea el primero con el botón «Crear módulo»."
                : "No tienes módulos asignados."
              : hasDirectDocuments
                ? "Este módulo guarda sus documentos directamente, sin submódulos."
                : canCreate
                  ? "Este módulo aún no tiene submódulos. Puedes crear uno o ver sus documentos."
                  : "No tienes submódulos asignados."
            : "Ningún resultado coincide con la búsqueda."}
        </p>
      ) : (
        <ul className={styles.grid} role="list">
          {filtered.map((module) => {
            const isNew = highlightId === module.id;
            return (
              <li
                className={`${styles.card} ${isNew ? styles.cardNew : ""}`}
                data-highlighted={isNew ? "true" : undefined}
                key={module.id}
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
                <div className={styles.cardHeader}>
                  {/* Repite el nombre del título: se oculta al lector de
                      pantalla para que no lo lea dos veces. */}
                  <div aria-hidden="true" className={styles.moduleTag}>
                    {isRoot ? "Módulo" : "Submódulo"}: {module.name}
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
                <p className={styles.cardMeta}>
                  Código {module.code} · Orden {module.sortOrder}
                </p>
                {module.description ? (
                  <p className={styles.cardDescription}>{module.description}</p>
                ) : null}
                <p className={styles.cardStat}>
                  {isRoot
                    ? `${module.submoduleCount} ${submoduleWord(module.submoduleCount)} · ${module.documentCount} ${module.documentCount === 1 ? "documento" : "documentos"}`
                    : `${module.documentCount} ${module.documentCount === 1 ? "documento" : "documentos"}`}
                </p>
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

      {isCreateOpen ? (
        <CreateModal
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
        </CreateModal>
      ) : null}
    </div>
  );
}
