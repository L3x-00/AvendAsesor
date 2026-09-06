"use client";

import { useId } from "react";
import { setAdminModulePermissionAction } from "@/app/admin/actions";
import type { AdminModulePermission } from "@/lib/admin-api/types";
import { AdminActionForm } from "./admin-action-form";

export function ModulePermissionsManager({
  permissions,
}: {
  permissions: AdminModulePermission[];
}) {
  const prefix = useId();
  const editable = permissions.filter(
    (permission) => permission.role === "admin",
  );

  return (
    <section
      aria-labelledby={`${prefix}-title`}
      className="rounded-xl border border-avend-border bg-avend-surface p-5"
    >
      <h2 className="text-xl font-bold" id={`${prefix}-title`}>
        Acceso a Módulos e Historial de documentos
      </h2>
      <p className="mt-1 text-base leading-7 text-avend-text-muted">
        Un solo permiso cubre las dos secciones: «Módulos» y «Historial de
        documentos». Controla la navegación, las URLs directas y todas las APIs
        de módulos, biblioteca y PDF. Los superadministradores conservan acceso.
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
                </label>
              </AdminActionForm>
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
