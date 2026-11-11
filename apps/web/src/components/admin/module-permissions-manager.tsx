"use client";

import { useId, useState } from "react";
import { FieldError } from "@/components/ui/form-field";
import type { FieldRules } from "@/lib/ui/field-validation";
import {
  setAdminModuleGrantsAction,
  setAdminModulePermissionAction,
} from "@/app/admin/actions";
import type { AdminModulePermission } from "@/lib/admin-api/types";
import { AdminActionForm } from "./admin-action-form";
import { userInitials } from "./user-format";
import styles from "./module-permissions-manager.module.css";

const PERMISSION_RULES: FieldRules = {
  reason: [
    { kind: "required", label: "El motivo" },
    { kind: "minLength", label: "El motivo", min: 4 },
    { kind: "maxLength", label: "El motivo", max: 500 },
  ],
};

function LockIcon() {
  return (
    <svg
      aria-hidden="true"
      className={styles.blockIcon}
      fill="none"
      viewBox="0 0 24 24"
    >
      <rect height="9" rx="2" width="14" x="5" y="11" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function LayersIcon() {
  return (
    <svg
      aria-hidden="true"
      className={styles.blockIcon}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path d="m12 3 8 4.5-8 4.5-8-4.5z" />
      <path d="m4 12 8 4.5 8-4.5M4 16.5 12 21l8-4.5" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      aria-hidden="true"
      className={styles.moduleChevron}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/**
 * Módulo principal con sus submódulos plegados: se despliegan al pulsar el
 * nombre, de modo que la lista de permisos no obligue a recorrer todo el
 * árbol. La casilla del módulo principal sigue a la vista para concederlo.
 */
function ModuleAccessCard({
  grantedIds,
  module,
  submodules,
}: {
  grantedIds: string[];
  module: PermissionModuleOption;
  submodules: PermissionModuleOption[];
}) {
  const inputId = useId();
  const panelId = useId();
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.moduleCard}>
      <div className={styles.moduleRoot}>
        <label className={styles.moduleCheck}>
          <input
            aria-label={module.name}
            defaultChecked={grantedIds.includes(module.id)}
            id={inputId}
            name="moduleId"
            type="checkbox"
            value={module.id}
          />
        </label>
        {submodules.length ? (
          <button
            aria-controls={panelId}
            aria-expanded={open}
            aria-label={`Submódulos de ${module.name}`}
            className={styles.moduleToggle}
            onClick={() => setOpen((current) => !current)}
            type="button"
          >
            <span className={styles.moduleName}>{module.name}</span>
            <ChevronIcon />
          </button>
        ) : (
          <label className={styles.moduleName} htmlFor={inputId}>
            {module.name}
          </label>
        )}
      </div>
      {submodules.length ? (
        <div
          className={styles.modulePanel}
          data-open={open}
          id={panelId}
          inert={!open}
        >
          <div className={styles.modulePanelInner}>
            <div className={styles.moduleChildren}>
              {submodules.map((child) => (
                <label className={styles.moduleChild} key={child.id}>
                  <input
                    defaultChecked={grantedIds.includes(child.id)}
                    name="moduleId"
                    type="checkbox"
                    value={child.id}
                  />
                  <span>{child.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export interface PermissionModuleOption {
  id: string;
  name: string;
  parentModuleId: string | null;
}

/**
 * Un administrador, con sus dos controles separados: el acceso al área
 * completa y los módulos permitidos. Los módulos se pliegan por defecto y
 * despliegan sus submódulos al pulsarlos, para no alargar la página.
 */
function AdminPermissionCard({
  modules,
  permission,
  prefix,
}: {
  modules: PermissionModuleOption[];
  permission: AdminModulePermission;
  prefix: string;
}) {
  const roots = modules.filter((module) => module.parentModuleId === null);
  const childrenOf = (rootId: string) =>
    modules.filter((module) => module.parentModuleId === rootId);
  const grantedCount = permission.moduleIds.filter((id) =>
    modules.some((module) => module.id === id),
  ).length;
  const accessTitleId = `${prefix}-${permission.userId}-access-title`;
  const modulesTitleId = `${prefix}-${permission.userId}-modules-title`;

  return (
    <li className={styles.card}>
      <div className={styles.cardHeader}>
        <span aria-hidden="true" className={styles.avatar}>
          {userInitials(permission.fullName)}
        </span>
        <div className={styles.identity}>
          <h3 className={styles.name}>{permission.fullName}</h3>
          <p className={styles.meta}>
            {grantedCount} de {modules.length} módulos con acceso
          </p>
        </div>
        <span
          className={
            permission.canAccess ? styles.pillEnabled : styles.pillBlocked
          }
        >
          <span aria-hidden="true" className={styles.pillDot} />
          {permission.canAccess ? "Habilitado" : "Bloqueado"}
        </span>
      </div>

      <div className={styles.blocks}>
        <section aria-labelledby={accessTitleId} className={styles.block}>
          <h4 className={styles.blockTitle} id={accessTitleId}>
            <LockIcon />
            Acceso al área
          </h4>
          <p className={styles.blockHint}>
            Habilita o retira Módulos e Historial de documentos completos para
            esta persona.
          </p>
          <AdminActionForm
            action={setAdminModulePermissionAction}
            className={styles.form}
            confirmMessage="¿Confirmas cambiar el acceso de este administrador a Módulos y Documentos?"
            rules={PERMISSION_RULES}
            submitLabel="Guardar acceso"
          >
            <input name="userId" type="hidden" value={permission.userId} />
            <fieldset className={styles.segmented}>
              <legend className={styles.segmentedLegend}>
                Estado del acceso
              </legend>
              <label className={styles.segment}>
                <input
                  defaultChecked={permission.canAccess}
                  name="canAccess"
                  type="radio"
                  value="true"
                />
                <span className={styles.segmentText}>Con acceso</span>
              </label>
              <label className={styles.segment}>
                <input
                  defaultChecked={!permission.canAccess}
                  name="canAccess"
                  type="radio"
                  value="false"
                />
                <span className={styles.segmentText}>Sin acceso</span>
              </label>
            </fieldset>
            <label
              className={styles.fieldLabel}
              htmlFor={`${prefix}-${permission.userId}-access-reason`}
            >
              Motivo (auditado)
            </label>
            <input
              className={styles.input}
              id={`${prefix}-${permission.userId}-access-reason`}
              maxLength={500}
              minLength={4}
              name="reason"
              required
              type="text"
            />
            <FieldError name="reason" />
          </AdminActionForm>
        </section>

        <section aria-labelledby={modulesTitleId} className={styles.block}>
          <h4 className={styles.blockTitle} id={modulesTitleId}>
            <LayersIcon />
            Módulos permitidos
          </h4>
          <p className={styles.blockHint}>
            Marca un módulo principal para dar acceso a él y a todos sus
            submódulos.
          </p>
          <AdminActionForm
            action={setAdminModuleGrantsAction}
            className={styles.form}
            confirmMessage="¿Confirmas reemplazar los módulos de este administrador con lo marcado?"
            rules={PERMISSION_RULES}
            submitLabel="Guardar módulos"
          >
            <input name="userId" type="hidden" value={permission.userId} />
            <fieldset className={styles.moduleFieldset}>
              <legend className="avend-visually-hidden">
                Módulos y submódulos permitidos
              </legend>
              {roots.map((root) => (
                <ModuleAccessCard
                  grantedIds={permission.moduleIds}
                  key={root.id}
                  module={root}
                  submodules={childrenOf(root.id)}
                />
              ))}
            </fieldset>
            <label
              className={styles.fieldLabel}
              htmlFor={`${prefix}-${permission.userId}-grants-reason`}
            >
              Motivo del cambio (auditado)
            </label>
            <input
              className={styles.input}
              id={`${prefix}-${permission.userId}-grants-reason`}
              maxLength={500}
              minLength={4}
              name="reason"
              required
              type="text"
            />
            <FieldError name="reason" />
            <p className={styles.blockHint}>
              Si dejas todo sin marcar, el administrador conserva el área
              habilitada pero sin módulos asignados.
            </p>
          </AdminActionForm>
        </section>
      </div>
    </li>
  );
}

export function ModulePermissionsManager({
  modules,
  permissions,
}: {
  modules: PermissionModuleOption[];
  permissions: AdminModulePermission[];
}) {
  const prefix = useId();
  const editable = permissions.filter(
    (permission) => permission.role === "admin",
  );

  return (
    <section aria-labelledby={`${prefix}-title`} className={styles.section}>
      <header className={styles.header}>
        <h2 className={styles.title} id={`${prefix}-title`}>
          Acceso a Módulos e Historial de documentos
        </h2>
      </header>
      <p className={styles.description}>
        Cada administrador tiene dos controles separados: el acceso al área
        completa y los módulos permitidos. Un permiso sobre un módulo principal
        cubre sus submódulos. Los superadministradores conservan acceso total.
      </p>
      {editable.length ? (
        <ul className={styles.list} role="list">
          {editable.map((permission) => (
            <AdminPermissionCard
              key={permission.userId}
              modules={modules}
              permission={permission}
              prefix={prefix}
            />
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>No hay administradores configurables.</p>
      )}
    </section>
  );
}
