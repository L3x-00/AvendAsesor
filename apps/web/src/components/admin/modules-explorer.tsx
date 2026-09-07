"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import {
  createModuleAction,
  deleteModuleAction,
  setModuleStatusAction,
  updateModuleAction,
} from "@/app/admin/actions";
import { AdminActionForm } from "@/components/admin/admin-action-form";
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
  description: [{ kind: "maxLength", label: "La descripción", max: 500 }],
  name: [
    { kind: "required", label: "El nombre" },
    { kind: "maxLength", label: "El nombre", max: 160 },
  ],
};
const CODE_TITLE =
  "Use solo letras, números y guion bajo, sin espacios ni acentos.";

function submoduleWord(count: number): string {
  return count === 1 ? "submódulo" : "submódulos";
}

/** Collapsible edit / status / logical-delete controls for a single module. */
export function ModuleManageDetails({
  module,
  parents,
  summary = "Editar, ordenar o cambiar estado",
}: {
  module: ModuleView;
  parents: ModuleParentOption[];
  summary?: string;
}) {
  const fieldId = useId();

  return (
    <details className={styles.manage}>
      <summary className={styles.manageSummary}>{summary}</summary>
      <div className={styles.manageGrid}>
        <AdminActionForm
          action={updateModuleAction}
          rules={MODULE_RULES}
          submitLabel="Guardar cambios"
          successMessage="Módulo actualizado con éxito."
        >
          <input name="moduleId" type="hidden" value={module.id} />
          <label className={styles.fieldLabel} htmlFor={`${fieldId}-name`}>
            Nombre
          </label>
          <input
            className={styles.input}
            defaultValue={module.name}
            id={`${fieldId}-name`}
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
            </>
          ) : (
            <p className={styles.presetParent}>
              Módulo padre: <strong>Sin padre</strong>
            </p>
          )}
        </AdminActionForm>

        <div className={styles.manageSide}>
          <AdminActionForm
            action={setModuleStatusAction}
            submitLabel={module.isActive ? "Desactivar" : "Activar"}
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
                  name="reason"
                  required
                />
              </label>
            ) : null}
          </AdminActionForm>

          <AdminActionForm
            action={deleteModuleAction}
            submitLabel="Eliminar (lógico)"
          >
            <input name="moduleId" type="hidden" value={module.id} />
            <label
              className={styles.fieldLabel}
              htmlFor={`${fieldId}-delete-reason`}
            >
              Motivo de baja
              <input
                className={styles.input}
                id={`${fieldId}-delete-reason`}
                name="reason"
                required
              />
            </label>
          </AdminActionForm>
        </div>
      </div>
    </details>
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
  const searchId = useId();
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
      </div>

      {filtered.length === 0 ? (
        <p className={styles.empty}>
          {modules.length === 0
            ? isRoot
              ? "Aún no hay módulos. Crea el primero con el formulario de abajo."
              : "Este módulo aún no tiene submódulos. Puedes crear uno o ver sus documentos."
            : "Ningún resultado coincide con la búsqueda."}
        </p>
      ) : (
        <ul className={styles.grid} role="list">
          {filtered.map((module) => {
            const hasSubmodules = module.submoduleCount > 0;
            const primaryHref = `/admin/modules/${module.id}`;
            const primaryLabel = hasSubmodules
              ? "Ver submódulos"
              : "Gestionar documentos";

            return (
              <li className={styles.card} key={module.id}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>{module.name}</h3>
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
                <Link className={styles.cardLink} href={primaryHref}>
                  {primaryLabel}
                </Link>
                <ModuleManageDetails module={module} parents={parents} />
              </li>
            );
          })}
        </ul>
      )}

      <details className={styles.createPanel}>
        <summary className={styles.createTitle} id={`${searchId}-create`}>
          {isRoot ? "+ Crear módulo o submódulo" : "+ Crear submódulo"}
        </summary>
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
            </>
          ) : isRoot ? (
            <input name="parentModuleId" type="hidden" value="__root__" />
          ) : (
            <p className={styles.presetParent}>
              Módulo padre: <strong>{context.moduleName}</strong>
            </p>
          )}
        </AdminActionForm>
      </details>
    </div>
  );
}

function isRootContext(context: ExplorerContext): context is { kind: "root" } {
  return context.kind === "root";
}
