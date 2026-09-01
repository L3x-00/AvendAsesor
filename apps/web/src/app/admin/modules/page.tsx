import { AdminActionForm } from '@/components/admin/admin-action-form';
import { AdminShell } from '@/components/admin/admin-shell';
import { createAuthorizedAdminApiContext } from '@/lib/admin-api/authorized-client';
import {
  createModuleAction,
  deleteModuleAction,
  setModuleStatusAction,
  updateModuleAction,
} from '../actions';

export default async function ModulesPage() {
  const { access, client } = await createAuthorizedAdminApiContext();
  const modules = await client.listModules('all');
  const availableParents = modules.filter((module) => !module.isDeleted);

  return (
    <AdminShell
      activeSection="modules"
      description="Crea y administra la jerarquía de módulos. Todas las acciones se validan nuevamente en la API."
      title="Módulos"
      userName={access.fullName}
      userRole={access.role}
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="module-list-title" className="space-y-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-bold" id="module-list-title">
              Módulos registrados
            </h2>
            <span className="text-base text-avend-text-muted">{modules.length} en total</span>
          </div>

          {modules.length === 0 ? (
            <p className="rounded-lg border border-dashed border-avend-border bg-avend-surface p-5 text-base text-avend-text-muted">
              Aún no hay módulos. El primer módulo se crea aquí cuando el responsable administrativo lo defina.
            </p>
          ) : (
            <ul className="space-y-3">
              {modules.map((module) => (
                <li className="avend-elevated rounded-lg border border-avend-border bg-avend-surface p-4" key={module.id}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="font-semibold">{module.name}</h3>
                      <p className="mt-1 text-base text-avend-text-muted">
                        Código {module.code} · Orden {module.sortOrder} ·{' '}
                        {module.isActive ? 'Activo' : 'Inactivo'}
                      </p>
                      {module.description ? (
                        <p className="mt-2 text-base text-avend-text">{module.description}</p>
                      ) : null}
                    </div>
                    <span className="rounded-full bg-avend-surface-muted px-2 py-1 text-base font-semibold text-avend-text">
                      {module.parentModuleId ? 'Submódulo' : 'Módulo raíz'}
                    </span>
                  </div>

                  <details className="mt-4 rounded-md border border-avend-border p-3">
                    <summary className="cursor-pointer font-semibold">Editar, ordenar o cambiar estado</summary>
                    <div className="mt-4 grid gap-5 lg:grid-cols-2">
                      <AdminActionForm action={updateModuleAction} submitLabel="Guardar cambios">
                        <input name="moduleId" type="hidden" value={module.id} />
                        <label className="block text-base font-medium" htmlFor={`module-name-${module.id}`}>
                          Nombre
                        </label>
                        <input
                          className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3"
                          defaultValue={module.name}
                          id={`module-name-${module.id}`}
                          name="name"
                          required
                        />
                        <label className="block text-base font-medium" htmlFor={`module-code-${module.id}`}>
                          Código
                        </label>
                        <input
                          className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3"
                          defaultValue={module.code}
                          id={`module-code-${module.id}`}
                          name="code"
                          required
                        />
                        <label className="block text-base font-medium" htmlFor={`module-description-${module.id}`}>
                          Descripción (opcional)
                        </label>
                        <textarea
                          aria-describedby={`module-description-help-${module.id}`}
                          className="mt-1 min-h-20 w-full rounded-md border border-avend-border px-3 py-2"
                          defaultValue={module.description ?? ''}
                          id={`module-description-${module.id}`}
                          maxLength={500}
                          minLength={2}
                          name="description"
                        />
                        <p
                          className="mt-1 text-base text-avend-text-muted"
                          id={`module-description-help-${module.id}`}
                        >
                          Déjala vacía para quitarla; si escribes una descripción,
                          usa entre 2 y 500 caracteres.
                        </p>
                        <label className="block text-base font-medium" htmlFor={`module-order-${module.id}`}>
                          Orden
                        </label>
                        <input
                          className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3"
                          defaultValue={module.sortOrder}
                          id={`module-order-${module.id}`}
                          min="0"
                          name="sortOrder"
                          type="number"
                        />
                        <label className="block text-base font-medium" htmlFor={`module-parent-${module.id}`}>
                          Padre (opcional)
                        </label>
                        <select
                          className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3"
                          defaultValue={module.parentModuleId ?? ''}
                          id={`module-parent-${module.id}`}
                          name="parentModuleId"
                        >
                          <option value="__keep__">Mantener padre actual</option>
                          {module.parentModuleId ? (
                            <option value="__root__">Convertir en módulo raíz</option>
                          ) : null}
                          {availableParents
                            .filter((parent) => parent.id !== module.id)
                            .map((parent) => (
                              <option key={parent.id} value={parent.id}>
                                {parent.name} ({parent.code})
                              </option>
                            ))}
                        </select>
                      </AdminActionForm>

                      <div className="space-y-5">
                        <AdminActionForm
                          action={setModuleStatusAction}
                          submitLabel={module.isActive ? 'Desactivar módulo' : 'Activar módulo'}
                        >
                          <input name="moduleId" type="hidden" value={module.id} />
                          <input name="isActive" type="hidden" value={String(!module.isActive)} />
                          {!module.isActive ? null : (
                            <label className="block text-base font-medium" htmlFor={`module-status-reason-${module.id}`}>
                              Motivo de desactivación
                              <input
                                className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3"
                                id={`module-status-reason-${module.id}`}
                                name="reason"
                                required
                              />
                            </label>
                          )}
                        </AdminActionForm>

                        <AdminActionForm action={deleteModuleAction} submitLabel="Eliminar lógicamente">
                          <input name="moduleId" type="hidden" value={module.id} />
                          <label className="block text-base font-medium" htmlFor={`module-delete-reason-${module.id}`}>
                            Motivo de baja
                            <input
                              className="mt-1 min-h-11 w-full rounded-md border border-avend-navy px-3"
                              id={`module-delete-reason-${module.id}`}
                              name="reason"
                              required
                            />
                          </label>
                        </AdminActionForm>
                      </div>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="avend-elevated h-fit rounded-lg border border-avend-border bg-avend-surface p-5">
          <h2 className="text-lg font-bold">Crear módulo</h2>
          <p className="mt-1 text-base leading-6 text-avend-text-muted">
            No se generan módulos de negocio automáticamente.
          </p>
          <AdminActionForm action={createModuleAction} className="mt-4 space-y-3" submitLabel="Crear módulo">
            <label className="block text-base font-medium" htmlFor="new-module-name">
              Nombre
              <input
                className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3"
                id="new-module-name"
                name="name"
                required
              />
            </label>
            <label className="block text-base font-medium" htmlFor="new-module-code">
              Código
              <input
                className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3"
                id="new-module-code"
                name="code"
                pattern="[A-Za-z][A-Za-z0-9_]{1,63}"
                required
              />
            </label>
            <label className="block text-base font-medium" htmlFor="new-module-description">
              Descripción (opcional)
              <textarea
                aria-describedby="new-module-description-help"
                className="mt-1 min-h-20 w-full rounded-md border border-avend-border px-3 py-2"
                id="new-module-description"
                maxLength={500}
                minLength={2}
                name="description"
              />
              <span
                className="mt-1 block text-base text-avend-text-muted"
                id="new-module-description-help"
              >
                Opcional; si la completas, usa entre 2 y 500 caracteres.
              </span>
            </label>
            <label className="block text-base font-medium" htmlFor="new-module-order">
              Orden (opcional)
              <input
                className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3"
                id="new-module-order"
                min="0"
                name="sortOrder"
                type="number"
              />
            </label>
            <label className="block text-base font-medium" htmlFor="new-module-parent">
              Módulo padre (opcional)
              <select
                className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3"
                id="new-module-parent"
                name="parentModuleId"
              >
                <option value="">Sin padre</option>
                {availableParents.map((parent) => (
                  <option key={parent.id} value={parent.id}>
                    {parent.name} ({parent.code})
                  </option>
                ))}
              </select>
            </label>
          </AdminActionForm>
        </aside>
      </div>
    </AdminShell>
  );
}
