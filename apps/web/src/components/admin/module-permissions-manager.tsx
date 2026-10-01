"use client";

import { useId } from "react";
import { FieldError } from "@/components/ui/form-field";
import type { FieldRules } from "@/lib/ui/field-validation";
import {
  setAdminModuleGrantsAction,
  setAdminModulePermissionAction,
} from "@/app/admin/actions";
import type { AdminModulePermission } from "@/lib/admin-api/types";
import { AdminActionForm } from "./admin-action-form";

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
  const roots = modules.filter((module) => module.parentModuleId === null);
  const childrenOf = (rootId: string) =>
    modules.filter((module) => module.parentModuleId === rootId);

  return (
    <section
      aria-labelledby={`${prefix}-title`}
      className="rounded-xl border border-avend-border bg-avend-surface p-5"
    >
      <h2 className="text-xl font-bold" id={`${prefix}-title`}>
        Acceso a Módulos e Historial de documentos
      </h2>
      <p className="mt-1 text-base leading-7 text-avend-text-muted">
        El interruptor habilita el área completa; las casillas deciden a qué
        módulos y submódulos puede entrar cada administrador. Un permiso sobre un
        módulo principal cubre sus submódulos. Los superadministradores
        conservan acceso total.
      </p>
      {editable.length ? (
        <ul className="mt-4 space-y-3" role="list">
          {editable.map((permission) => (
            <li
              className="rounded-lg border border-avend-border p-4"
              key={permission.userId}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold">{permission.fullName}</h3>
                  <p className="text-sm text-avend-text-muted">
                    Estado actual:{" "}
                    {permission.canAccess ? "Con acceso" : "Sin acceso"}
                  </p>
                </div>
                <span
                  className={
                    permission.canAccess
                      ? "rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-800"
                      : "rounded-full bg-red-50 px-3 py-1 text-sm font-bold text-red-800"
                  }
                >
                  {permission.canAccess ? "Habilitado" : "Bloqueado"}
                </span>
              </div>
              <AdminActionForm
                action={setAdminModulePermissionAction}
                rules={PERMISSION_RULES}
                className="mt-3 grid gap-3 md:grid-cols-[12rem_minmax(0,1fr)_auto] md:items-end"
                confirmMessage="¿Confirmas cambiar el acceso de este administrador a Módulos y Documentos?"
                submitLabel="Guardar permiso"
              >
                <input name="userId" type="hidden" value={permission.userId} />
                <label
                  className="block"
                  htmlFor={`${prefix}-${permission.userId}-access`}
                >
                  <span className="text-base font-semibold">Nuevo acceso</span>
                  <select
                    className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
                    defaultValue={String(!permission.canAccess)}
                    id={`${prefix}-${permission.userId}-access`}
                    // Vuelve a montarse con el acceso guardado: un <select> ya
                    // montado no actualiza su valor por defecto tras guardar.
                    key={String(permission.canAccess)}
                    name="canAccess"
                  >
                    <option value="true">Habilitar</option>
                    <option value="false">Retirar</option>
                  </select>
                </label>
                <label
                  className="block"
                  htmlFor={`${prefix}-${permission.userId}-reason`}
                >
                  <span className="text-base font-semibold">
                    Motivo (auditado)
                  </span>
                  <input
                    className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
                    id={`${prefix}-${permission.userId}-reason`}
                    maxLength={500}
                    minLength={4}
                    name="reason"
                    required
                  />
                  <FieldError name="reason" />
                </label>
              </AdminActionForm>

              <details className="mt-3 rounded-lg border border-avend-border p-4">
                <summary className="cursor-pointer text-base font-bold">
                  Módulos con acceso ({permission.moduleIds.length})
                </summary>
                <AdminActionForm
                  action={setAdminModuleGrantsAction}
                  rules={PERMISSION_RULES}
                  className="mt-3 space-y-4"
                  confirmMessage="¿Confirmas reemplazar los módulos de este administrador con lo marcado?"
                  submitLabel="Guardar módulos"
                >
                  <input
                    name="userId"
                    type="hidden"
                    value={permission.userId}
                  />
                  <fieldset className="grid gap-3 md:grid-cols-2">
                    <legend className="text-base font-semibold">
                      Marca los módulos y submódulos permitidos
                    </legend>
                    {roots.map((root) => (
                      <div
                        className="rounded-md border border-avend-border p-3"
                        key={root.id}
                      >
                        <label className="flex min-h-11 items-center gap-2 text-base font-semibold">
                          <input
                            defaultChecked={permission.moduleIds.includes(
                              root.id,
                            )}
                            name="moduleId"
                            type="checkbox"
                            value={root.id}
                          />
                          {root.name}
                        </label>
                        {childrenOf(root.id).map((child) => (
                          <label
                            className="ml-6 flex min-h-11 items-center gap-2 text-base"
                            key={child.id}
                          >
                            <input
                              defaultChecked={permission.moduleIds.includes(
                                child.id,
                              )}
                              name="moduleId"
                              type="checkbox"
                              value={child.id}
                            />
                            {child.name}
                          </label>
                        ))}
                      </div>
                    ))}
                  </fieldset>
                  <label
                    className="block"
                    htmlFor={`${prefix}-${permission.userId}-grants-reason`}
                  >
                    <span className="text-base font-semibold">
                      Motivo del cambio (auditado)
                    </span>
                    <input
                      className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
                      id={`${prefix}-${permission.userId}-grants-reason`}
                      maxLength={500}
                      minLength={4}
                      name="reason"
                      required
                    />
                    <FieldError name="reason" />
                  </label>
                  <p className="text-sm text-avend-text-muted">
                    Si dejas todo sin marcar, el administrador conserva el área
                    habilitada pero sin módulos asignados.
                  </p>
                </AdminActionForm>
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-avend-border p-4 text-base text-avend-text-muted">
          No hay administradores configurables.
        </p>
      )}
    </section>
  );
}
