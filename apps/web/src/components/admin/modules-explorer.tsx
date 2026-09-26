"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  createModuleAction,
  deleteModuleAction,
  setModuleStatusAction,
  updateModuleAction,
} from "@/app/admin/actions";
import { AdminActionForm } from "@/components/admin/admin-action-form";
import { DeleteDisclosure } from "@/components/admin/delete-disclosure";
import { FieldError } from "@/components/ui/form-field";
import type { FieldRules } from "@/lib/ui/field-validation";
import styles from "./modules-explorer.module.css";

export interface ModuleView {
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
  { kind: "root" } | { kind: "module"; moduleId: string; moduleName: string };

interface ModulesExplorerProps {
  context: ExplorerContext;
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

function submoduleWord(count: number): string {
  return count === 1 ? "submódulo" : "submódulos";
}

/** Collapsible edit / status / logical-delete controls for a single module. */
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
 */
function CreateModal({
  children,
  onClose,
  title,
  titleId,
}: {
  children: ReactNode;
  onClose: () => void;
  title: string;
  titleId: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
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
  }, [onClose]);

  return createPortal(
    <div
      className={styles.modalOverlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
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
            onClick={onClose}
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
 * Hierarchical, searchable view of modules or the submodules of a module.
 * Navigation only: it reuses the existing module Server Actions and links to
 * the documents view; it performs no document management itself.
 */
export function ModulesExplorer({
  context,
  modules,
  parents,
}: ModulesExplorerProps) {
  const [query, setQuery] = useState("");
  const [createKind, setCreateKind] = useState<"module" | "submodule">(
    isRootContext(context) ? "module" : "submodule",
  );
  const [isCreateOpen, setCreateOpen] = useState(false);
  const closeCreate = useCallback(() => setCreateOpen(false), []);
  const searchId = useId();
  const modalTitleId = `${searchId}-create-title`;
  const isRoot = context.kind === "root";
  const normalized = query.trim().toLocaleLowerCase("es");

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

  return (
    <div className={styles.explorer}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarHeading}>
          <h2 className={styles.title}>{isRoot ? "Módulos" : "Submódulos"}</h2>
          <span className={styles.count}>{modules.length} en total</span>
        </div>
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
          <button
            className={`avend-button avend-button--primary ${styles.createButton}`}
            onClick={() => setCreateOpen(true)}
            type="button"
          >
            {isRoot ? "+ Crear módulo" : "+ Crear submódulo"}
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className={styles.empty}>
          {modules.length === 0
            ? isRoot
              ? "Aún no hay módulos. Crea el primero con el botón «Crear módulo o submódulo»."
              : "Este módulo aún no tiene submódulos. Puedes crear uno o ver sus documentos."
            : "Ningún resultado coincide con la búsqueda."}
        </p>
      ) : (
        <ul className={styles.grid} role="list">
          {filtered.map((module) => {
            return (
              <li className={styles.card} key={module.id}>
                <div className={styles.cardHeader}>
                  <div className={styles.moduleTag}>
                    {isRoot ? "Módulo" : "Sub Módulo"}: {module.name}
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
          onClose={closeCreate}
          title={isRoot ? "Crear módulo o submódulo" : "Crear submódulo"}
          titleId={modalTitleId}
        >
          <AdminActionForm
            action={createModuleAction}
            className={styles.createForm}
            rules={MODULE_RULES}
            submitLabel={isRoot ? "Crear" : "Crear submódulo"}
            successMessage="Módulo creado con éxito."
          >
          {isRoot ? (
            <label className={styles.fieldLabel} htmlFor={`${searchId}-kind`}>
              Tipo de elemento
              <select
                className={styles.input}
                id={`${searchId}-kind`}
                onChange={(event) =>
                  setCreateKind(event.target.value as "module" | "submodule")
                }
                value={createKind}
              >
                <option value="module">Módulo principal</option>
                <option value="submodule">Submódulo</option>
              </select>
            </label>
          ) : null}
          {isRoot ? null : (
            <input
              name="parentModuleId"
              type="hidden"
              value={context.moduleId}
            />
          )}
          <label className={styles.fieldLabel} htmlFor={`${searchId}-new-name`}>
            Nombre
          </label>
          <input
            className={styles.input}
            id={`${searchId}-new-name`}
            maxLength={255}
            minLength={2}
            name="name"
            required
          />
          <FieldError name="name" />
          <label className={styles.fieldLabel} htmlFor={`${searchId}-new-code`}>
            Código
          </label>
          <input
            className={styles.input}
            id={`${searchId}-new-code`}
            name="code"
            pattern={CODE_PATTERN}
            placeholder="EVALUACION_DOCENTE"
            required
            title={CODE_TITLE}
          />
          <FieldError name="code" />
          <label
            className={styles.fieldLabel}
            htmlFor={`${searchId}-new-description`}
          >
            Descripción (opcional)
          </label>
          <textarea
            className={styles.textarea}
            id={`${searchId}-new-description`}
            maxLength={500}
            minLength={2}
            name="description"
          />
          <FieldError name="description" />
          <label
            className={styles.fieldLabel}
            htmlFor={`${searchId}-new-order`}
          >
            Orden (opcional)
          </label>
          <input
            className={styles.input}
            id={`${searchId}-new-order`}
            min="0"
            name="sortOrder"
            type="number"
          />
          <FieldError name="sortOrder" />
          <label
            className={styles.fieldLabel}
            htmlFor={`${searchId}-new-status`}
          >
            Estado
            <select
              className={styles.input}
              defaultValue="true"
              id={`${searchId}-new-status`}
              name="isActive"
            >
              <option value="true">Activo</option>
              <option value="false">Inactivo</option>
            </select>
          </label>
          {isRoot && createKind === "submodule" ? (
            <>
              <label
                className={styles.fieldLabel}
                htmlFor={`${searchId}-new-parent`}
              >
                Módulo padre
              </label>
              <select
                className={styles.input}
                defaultValue=""
                id={`${searchId}-new-parent`}
                name="parentModuleId"
                required
              >
                <option disabled value="">
                  Selecciona un módulo principal
                </option>
                {parents.map((parent) => (
                  <option key={parent.id} value={parent.id}>
                    {parent.name} ({parent.code})
                  </option>
                ))}
              </select>
              <FieldError name="parentModuleId" />
            </>
          ) : isRoot ? (
            <input name="parentModuleId" type="hidden" value="__root__" />
          ) : (
            <p className={styles.presetParent}>
              Módulo padre: <strong>{context.moduleName}</strong>
            </p>
          )}
          </AdminActionForm>
        </CreateModal>
      ) : null}
    </div>
  );
}

function isRootContext(context: ExplorerContext): context is { kind: "root" } {
  return context.kind === "root";
}
