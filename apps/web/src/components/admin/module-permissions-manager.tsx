"use client";

import { useId, useRef } from "react";
import { FieldError } from "@/components/ui/form-field";
import type { FieldRules } from "@/lib/ui/field-validation";
import {
  setAdminModuleGrantsAction,
  setAdminModulePermissionAction,
} from "@/app/admin/actions";
import type { AdminModulePermission } from "@/lib/admin-api/types";
import { AdminActionForm } from "./admin-action-form";
import styles from "./module-permissions-manager.module.css";

const PERMISSION_RULES: FieldRules = {
  reason: [
    { kind: "required", label: "El motivo" },
    { kind: "minLength", label: "El motivo", min: 4 },
    { kind: "maxLength", label: "El motivo", max: 500 },
  ],
};

export interface PermissionModuleOption {
  id: string;
  name: string;
  parentModuleId: string | null;
}

/**
 * Un administrador, con sus dos controles separados: el acceso al área
 * completa y los módulos permitidos. Nada queda plegado tras un triángulo:
 * todo lo que se puede tocar está a la vista (PO, 2026-10-11).
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
  const grantsRef = useRef<HTMLFieldSetElement | null>(null);
  const roots = modules.filter((module) => module.parentModuleId === null);
  const childrenOf = (rootId: string) =>
    modules.filter((module) => module.parentModuleId === rootId);
  const grantedCount = permission.moduleIds.filter((id) =>
    modules.some((module) => module.id === id),
  ).length;
  const accessTitleId = `${prefix}-${permission.userId}-access-title`;
  const modulesTitleId = `${prefix}-${permission.userId}-modules-title`;

  function setAllModules(checked: boolean) {
    grantsRef.current
      ?.querySelectorAll<HTMLInputElement>('input[name="moduleId"]')
      .forEach((input) => {
        input.checked = checked;
      });
  }

  return (
    <li className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
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
          {permission.canAccess ? "Habilitado" : "Bloqueado"}
        </span>
      </div>

      <div className={styles.blocks}>
        <section aria-labelledby={accessTitleId} className={styles.block}>
          <h4 className={styles.blockTitle} id={accessTitleId}>
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
            Módulos permitidos
          </h4>
          <p className={styles.blockHint}>
            Marca un módulo principal para dar acceso a él y a todos sus
            submódulos.
          </p>
          <div className={styles.quickToggles}>
            <button
              className={styles.quickToggle}
              onClick={() => setAllModules(true)}
              type="button"
            >
              Marcar todos
            </button>
            <button
              className={styles.quickToggle}
              onClick={() => setAllModules(false)}
              type="button"
            >
              Desmarcar todos
            </button>
          </div>
          <AdminActionForm
            action={setAdminModuleGrantsAction}
            className={styles.form}
            confirmMessage="¿Confirmas reemplazar los módulos de este administrador con lo marcado?"
            rules={PERMISSION_RULES}
            submitLabel="Guardar módulos"
          >
            <input name="userId" type="hidden" value={permission.userId} />
            <fieldset className={styles.moduleFieldset} ref={grantsRef}>
              <legend className="avend-visually-hidden">
                Módulos y submódulos permitidos
              </legend>
              {roots.map((root) => (
                <div className={styles.moduleCard} key={root.id}>
                  <label className={styles.moduleRoot}>
                    <input
                      defaultChecked={permission.moduleIds.includes(root.id)}
                      name="moduleId"
                      type="checkbox"
                      value={root.id}
                    />
                    <span>{root.name}</span>
                  </label>
                  {childrenOf(root.id).length ? (
                    <div className={styles.moduleChildren}>
                      {childrenOf(root.id).map((child) => (
                        <label className={styles.moduleChild} key={child.id}>
                          <input
                            defaultChecked={permission.moduleIds.includes(
                              child.id,
                            )}
                            name="moduleId"
                            type="checkbox"
                            value={child.id}
                          />
                          <span>{child.name}</span>
                        </label>
                      ))}
                    </div>
                  ) : null}
                </div>
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
      <h2 className={styles.title} id={`${prefix}-title`}>
        Acceso a Módulos e Historial de documentos
      </h2>
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
