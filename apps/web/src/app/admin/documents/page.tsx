import Link from 'next/link';
import { AdminActionForm } from '@/components/admin/admin-action-form';
import { AdminShell } from '@/components/admin/admin-shell';
import { createAuthorizedAdminApiClient } from '@/lib/admin-api/authorized-client';
import { createDocumentAction } from '../actions';

export default async function DocumentsPage() {
  const client = await createAuthorizedAdminApiClient();
  const [documents, modules] = await Promise.all([
    client.listDocuments('all'),
    client.listModules('active'),
  ]);

  return (
    <AdminShell
      description="Carga PDFs y consulta su estado. El backend valida el archivo, conserva el historial y controla todas las descargas."
      title="Documentos PDF"
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <section aria-labelledby="document-list-title" className="space-y-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-bold" id="document-list-title">
              Documentos registrados
            </h2>
            <span className="text-sm text-slate-600">{documents.length} en total</span>
          </div>
          {documents.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
              No hay documentos cargados. Solo se admiten PDFs de hasta 20 MiB y 300 páginas.
            </p>
          ) : (
            <ul className="space-y-3">
              {documents.map((document) => (
                <li className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" key={document.id}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="font-semibold">{document.title}</h3>
                      <p className="mt-1 text-sm text-slate-600">
                        {document.documentType} · {document.publicationStatus === 'active' ? 'Activo' : 'Inactivo'}
                        {document.issuanceYear ? ` · ${document.issuanceYear}` : ''}
                      </p>
                    </div>
                    <Link
                      className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
                      href={`/admin/documents/${document.id}`}
                    >
                      Ver detalle
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="h-fit rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">Cargar documento PDF</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            No cierres ni reenvíes este formulario mientras se procesa. Ante un error de confirmación, actualiza el listado antes de repetir la carga.
          </p>
          <AdminActionForm action={createDocumentAction} className="mt-4 space-y-3" submitLabel="Cargar PDF">
            <label className="block text-sm font-medium" htmlFor="document-file">
              Archivo PDF
              <input
                accept="application/pdf,.pdf"
                className="mt-1 block w-full text-sm"
                id="document-file"
                name="file"
                required
                type="file"
              />
            </label>
            <label className="block text-sm font-medium" htmlFor="document-title">
              Título
              <input
                className="mt-1 min-h-10 w-full rounded-md border border-slate-300 px-3"
                id="document-title"
                name="title"
                required
              />
            </label>
            <label className="block text-sm font-medium" htmlFor="document-type">
              Tipo documental
              <input
                className="mt-1 min-h-10 w-full rounded-md border border-slate-300 px-3"
                id="document-type"
                name="documentType"
                pattern="[A-Za-z][A-Za-z0-9_]{1,63}"
                required
              />
            </label>
            <label className="block text-sm font-medium" htmlFor="document-entity">
              Entidad emisora (opcional)
              <input
                className="mt-1 min-h-10 w-full rounded-md border border-slate-300 px-3"
                id="document-entity"
                name="issuingEntity"
              />
            </label>
            <label className="block text-sm font-medium" htmlFor="document-year">
              Año de emisión (opcional)
              <input
                className="mt-1 min-h-10 w-full rounded-md border border-slate-300 px-3"
                id="document-year"
                max="2200"
                min="1800"
                name="issuanceYear"
                type="number"
              />
            </label>
            <fieldset>
              <legend className="text-sm font-medium">Módulos asociados (opcional)</legend>
              <div className="mt-2 max-h-36 space-y-2 overflow-y-auto rounded-md border border-slate-200 p-3">
                {modules.length === 0 ? (
                  <p className="text-sm text-slate-600">No hay módulos activos para asociar.</p>
                ) : (
                  modules.map((module) => (
                    <label className="flex gap-2 text-sm" key={module.id}>
                      <input name="moduleId" type="checkbox" value={module.id} />
                      <span>{module.name}</span>
                    </label>
                  ))
                )}
              </div>
            </fieldset>
            <label className="block text-sm font-medium" htmlFor="document-metadata">
              Metadatos JSON (opcional)
              <textarea
                className="mt-1 min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
                id="document-metadata"
                name="metadata"
                placeholder='{"origen":"administración"}'
              />
            </label>
          </AdminActionForm>
        </aside>
      </div>
    </AdminShell>
  );
}
