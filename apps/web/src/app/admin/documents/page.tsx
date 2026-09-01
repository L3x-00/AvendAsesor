import Link from 'next/link';
import { AdminShell } from '@/components/admin/admin-shell';
import { DocumentPdfUploadForm } from '@/components/admin/document-pdf-upload-form';
import { createAuthorizedAdminApiContext } from '@/lib/admin-api/authorized-client';
import { getAdminApiUrl } from '@/lib/admin-api/config';

export default async function DocumentsPage() {
  const { access, client } = await createAuthorizedAdminApiContext();
  const apiBaseUrl = getAdminApiUrl();
  const [documents, modules] = await Promise.all([
    client.listDocuments('all'),
    client.listModules('active'),
  ]);

  return (
    <AdminShell
      activeSection="documents"
      description="Carga PDFs y consulta su estado. El backend valida el archivo, conserva el historial y controla todas las descargas."
      title="Documentos PDF"
      userName={access.fullName}
      userRole={access.role}
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <section aria-labelledby="document-list-title" className="space-y-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-bold" id="document-list-title">
              Documentos registrados
            </h2>
            <span className="text-base text-avend-text-muted">{documents.length} en total</span>
          </div>
          {documents.length === 0 ? (
            <p className="rounded-lg border border-dashed border-avend-border bg-avend-surface p-5 text-base text-avend-text-muted">
              No hay documentos cargados. Solo se admiten PDFs de hasta 20 MiB y 300 páginas.
            </p>
          ) : (
            <ul className="space-y-3">
              {documents.map((document) => (
                <li className="avend-elevated rounded-lg border border-avend-border bg-avend-surface p-4" key={document.id}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="font-semibold">{document.title}</h3>
                      <p className="mt-1 text-base text-avend-text-muted">
                        {document.documentType} · {document.publicationStatus === 'active' ? 'Activo' : 'Inactivo'}
                        {document.issuanceYear ? ` · ${document.issuanceYear}` : ''}
                      </p>
                    </div>
                    <Link
                      className="inline-flex min-h-11 items-center justify-center rounded-md border border-avend-border px-3 py-2 text-base font-semibold hover:bg-avend-soft-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-avend-accent"
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

        <aside className="avend-elevated h-fit rounded-lg border border-avend-border bg-avend-surface p-5">
          <h2 className="text-lg font-bold">Cargar documento PDF</h2>
          <p className="mt-1 text-base leading-6 text-avend-text-muted">
            El formulario conservará todos los datos si ocurre un error. Se admiten PDFs de hasta 20 MiB.
          </p>
          <DocumentPdfUploadForm
            apiBaseUrl={apiBaseUrl}
            className="mt-4 space-y-3"
            endpoint="/admin/documents"
            submitLabel="Cargar PDF"
            successMessage="Documento PDF creado."
          >
            <label className="block text-base font-medium" htmlFor="document-file">
              Archivo PDF
              <input
                accept="application/pdf,.pdf"
                className="mt-1 block w-full text-base"
                id="document-file"
                name="file"
                required
                type="file"
              />
            </label>
            <label className="block text-base font-medium" htmlFor="document-title">
              Título
              <input
                className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3"
                id="document-title"
                maxLength={500}
                minLength={2}
                name="title"
                required
              />
            </label>
            <label className="block text-base font-medium" htmlFor="document-type">
              Tipo documental
              <input
                className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3"
                id="document-type"
                maxLength={64}
                minLength={2}
                name="documentType"
                pattern="[A-Za-z][A-Za-z0-9_]{1,63}"
                placeholder="RESOLUCION_MINISTERIAL"
                required
                title="Use solo letras, números y guion bajo, sin espacios ni acentos. Ejemplo: RESOLUCION_MINISTERIAL"
              />
              <span className="mt-1 block text-sm text-avend-text-muted">
                Código sin espacios ni acentos (letras, números y guion bajo). El
                título descriptivo va en el campo «Título».
              </span>
            </label>
            <label className="block text-base font-medium" htmlFor="document-entity">
              Entidad emisora (opcional)
              <input
                className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3"
                id="document-entity"
                maxLength={255}
                minLength={2}
                name="issuingEntity"
              />
            </label>
            <label className="block text-base font-medium" htmlFor="document-year">
              Año de emisión (opcional)
              <input
                className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3"
                id="document-year"
                max="2200"
                min="1800"
                name="issuanceYear"
                type="number"
              />
            </label>
            <fieldset>
              <legend className="text-base font-medium">Módulos asociados (opcional)</legend>
              <div className="mt-2 max-h-36 space-y-2 overflow-y-auto rounded-md border border-avend-border p-3">
                {modules.length === 0 ? (
                  <p className="text-base text-avend-text-muted">No hay módulos activos para asociar.</p>
                ) : (
                  modules.map((module) => (
                    <label className="flex gap-2 text-base" key={module.id}>
                      <input name="moduleId" type="checkbox" value={module.id} />
                      <span>{module.name}</span>
                    </label>
                  ))
                )}
              </div>
            </fieldset>
            <label className="block text-base font-medium" htmlFor="document-metadata">
              Metadatos JSON (opcional)
              <textarea
                className="mt-1 min-h-20 w-full rounded-md border border-avend-border px-3 py-2 font-mono text-base"
                id="document-metadata"
                name="metadata"
                placeholder='{"origen":"administración"}'
              />
            </label>
          </DocumentPdfUploadForm>
        </aside>
      </div>
    </AdminShell>
  );
}
