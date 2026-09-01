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
import styles from "./modules-explorer.module.css";

export interface ModuleView {
  code: string;
  description: string | null;
  id: string;
  isActive: boolean;
  name: string;
  parentModuleId: string | null;
  sortOrder: number;
  submoduleCount: number;
}

export interface ModuleParentOption {
  code: string;
  id: string;
  name: string;
}

export type ExplorerContext =
  | { kind: "root" }
  | { kind: "module"; moduleId: string; moduleName: string };

interface ModulesExplorerProps {
  context: ExplorerContext;
  modules: ModuleView[];
  parents: ModuleParentOption[];
}

const CODE_PATTERN = "[A-Za-z][A-Za-z0-9_]{1,63}";
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
        <AdminActionForm action={updateModuleAction} submitLabel="Guardar cambios">
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
            {module.parentModuleId ? (
              <option value="__root__">Convertir en módulo principal</option>
            ) : null}
            {parents
              .filter((parent) => parent.id !== module.id)
              .map((parent) => (
                <option key={parent.id} value={parent.id}>
                  {parent.name} ({parent.code})
                </option>
              ))}
          </select>
        </AdminActionForm>

        <div className={styles.manageSide}>
          <AdminActionForm
            action={setModuleStatusAction}
            submitLabel={module.isActive ? "Desactivar" : "Activar"}
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
            const primaryHref = hasSubmodules
              ? `/admin/modules/${module.id}`
              : "/admin/documents";
            const primaryLabel = hasSubmodules
              ? "Ver submódulos"
              : "Ver documentos";

            return (
              <li className={styles.card} key={module.id}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>{module.name}</h3>
                  <span
                    className={
                      module.isActive ? styles.badgeActive : styles.badgeInactive
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
                  {hasSubmodules
                    ? `${module.submoduleCount} ${submoduleWord(module.submoduleCount)}`
                    : "Sin submódulos"}
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

      <section
        aria-labelledby={`${searchId}-create`}
        className={styles.createPanel}
      >
        <h3 className={styles.createTitle} id={`${searchId}-create`}>
          {isRoot
            ? "Crear módulo o submódulo"
            : `Crear submódulo en ${context.moduleName}`}
        </h3>
        <AdminActionForm
          action={createModuleAction}
          submitLabel={isRoot ? "Crear" : "Crear submódulo"}
        >
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
          <label className={styles.fieldLabel} htmlFor={`${searchId}-new-order`}>
            Orden (opcional)
          </label>
          <input
            className={styles.input}
            id={`${searchId}-new-order`}
            min="0"
            name="sortOrder"
            type="number"
          />
          {isRoot ? (
            <>
              <label
                className={styles.fieldLabel}
                htmlFor={`${searchId}-new-parent`}
              >
                Módulo padre (opcional)
              </label>
              <select
                className={styles.input}
                defaultValue=""
                id={`${searchId}-new-parent`}
                name="parentModuleId"
              >
                <option value="">Sin padre (módulo principal)</option>
                {parents.map((parent) => (
                  <option key={parent.id} value={parent.id}>
                    {parent.name} ({parent.code})
                  </option>
                ))}
              </select>
            </>
          ) : (
            <p className={styles.presetParent}>
              Módulo padre: <strong>{context.moduleName}</strong>
            </p>
          )}
        </AdminActionForm>
      </section>
    </div>
  );
}
