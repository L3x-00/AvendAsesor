import { notFound } from 'next/navigation';
import { AdminActionForm } from '@/components/admin/admin-action-form';
import { AdminShell } from '@/components/admin/admin-shell';
import { AdminApiError } from '@/lib/admin-api/client';
import { createAuthorizedAdminApiClient } from '@/lib/admin-api/authorized-client';
import type {
  ManagedDocumentDetails,
  ManagedModule,
} from '@/lib/admin-api/types';
import {
  addDocumentVersionAction,
  createDownloadUrlAction,
  deleteDocumentAction,
  linkDocumentModuleAction,
  setDocumentStatusAction,
  unlinkDocumentModuleAction,
  updateDocumentAction,
} from '../../actions';

interface DocumentDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function DocumentDetailPage({ params }: DocumentDetailPageProps) {
  const { id } = await params;
  const client = await createAuthorizedAdminApiClient();
  let document: ManagedDocumentDetails;
  let modules: ManagedModule[];

  try {
    [document, modules] = await Promise.all([
      client.getDocument(id),
      client.listModules('active'),
    ]);
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 404) {
      notFound();
    }

    throw error;
  }

  const associatedModuleIds = new Set(document.moduleIds);
  const availableModules = modules.filter(
    (module) => !module.isDeleted && !associatedModuleIds.has(module.id),
  );

  return (
    <AdminShell
      activeSection="documents"
      description="Gestiona versiones, asociaciones, estado y descarga sin exponer la ubicación privada del archivo."
      title={document.title}
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-5">
          <article className="avend-elevated rounded-lg border border-avend-border bg-avend-surface p-5">
            <h2 className="text-lg font-bold">Información actual</h2>
            <dl className="mt-3 grid gap-2 text-base sm:grid-cols-2">
              <div><dt className="font-medium">Tipo</dt><dd>{document.documentType}</dd></div>
              <div><dt className="font-medium">Estado</dt><dd>{document.publicationStatus}</dd></div>
              <div><dt className="font-medium">Entidad</dt><dd>{document.issuingEntity ?? '—'}</dd></div>
              <div><dt className="font-medium">Año</dt><dd>{document.issuanceYear ?? '—'}</dd></div>
            </dl>
          </article>

          <article className="avend-elevated rounded-lg border border-avend-border bg-avend-surface p-5">
            <h2 className="text-lg font-bold">Actualizar metadatos</h2>
            <AdminActionForm action={updateDocumentAction} className="mt-4 space-y-3" submitLabel="Guardar metadatos">
              <input name="documentId" type="hidden" value={document.id} />
              <label className="block text-base font-medium" htmlFor="detail-title">
                Título
                <input className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3" defaultValue={document.title} id="detail-title" name="title" required />
              </label>
              <label className="block text-base font-medium" htmlFor="detail-type">
                Tipo documental
                <input className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3" defaultValue={document.documentType} id="detail-type" name="documentType" required />
              </label>
              <label className="block text-base font-medium" htmlFor="detail-entity">
                Entidad emisora
                <input className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3" defaultValue={document.issuingEntity ?? ''} id="detail-entity" name="issuingEntity" />
              </label>
              <label className="block text-base font-medium" htmlFor="detail-year">
                Año de emisión
                <input className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3" defaultValue={document.issuanceYear ?? ''} id="detail-year" max="2200" min="1800" name="issuanceYear" type="number" />
              </label>
              <label className="block text-base font-medium" htmlFor="detail-metadata">
                Metadatos JSON
                <textarea className="mt-1 min-h-24 w-full rounded-md border border-avend-border px-3 py-2 font-mono text-base" defaultValue={JSON.stringify(document.metadata)} id="detail-metadata" name="metadata" />
              </label>
            </AdminActionForm>
          </article>

          <article className="avend-elevated rounded-lg border border-avend-border bg-avend-surface p-5">
            <h2 className="text-lg font-bold">Estado y baja lógica</h2>
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              <AdminActionForm action={setDocumentStatusAction} submitLabel={document.publicationStatus === 'active' ? 'Desactivar' : 'Activar'}>
                <input name="documentId" type="hidden" value={document.id} />
                <input name="isActive" type="hidden" value={String(document.publicationStatus !== 'active')} />
                {document.publicationStatus === 'active' ? (
                  <label className="block text-base font-medium" htmlFor="detail-status-reason">
                    Motivo de desactivación
                    <input className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3" id="detail-status-reason" name="reason" required />
                  </label>
                ) : null}
              </AdminActionForm>
              <AdminActionForm action={deleteDocumentAction} submitLabel="Eliminar lógicamente">
                <input name="documentId" type="hidden" value={document.id} />
                <label className="block text-base font-medium" htmlFor="detail-delete-reason">
                  Motivo de baja
                  <input className="mt-1 min-h-11 w-full rounded-md border border-avend-navy px-3" id="detail-delete-reason" name="reason" required />
                </label>
              </AdminActionForm>
            </div>
          </article>
        </section>

        <section className="space-y-5">
          <article className="avend-elevated rounded-lg border border-avend-border bg-avend-surface p-5">
            <h2 className="text-lg font-bold">Cargar una nueva versión</h2>
            <p className="mt-1 text-base text-avend-text-muted">La versión anterior permanece intacta. No reenvíes automáticamente ante un resultado incierto.</p>
            <AdminActionForm action={addDocumentVersionAction} className="mt-4 space-y-3" submitLabel="Crear nueva versión">
              <input name="documentId" type="hidden" value={document.id} />
              <label className="block text-base font-medium" htmlFor="detail-file">
                Archivo PDF
                <input accept="application/pdf,.pdf" className="mt-1 block w-full text-base" id="detail-file" name="file" required type="file" />
              </label>
            </AdminActionForm>
          </article>

          <article className="avend-elevated rounded-lg border border-avend-border bg-avend-surface p-5">
            <h2 className="text-lg font-bold">Versiones y descargas</h2>
            <ul className="mt-4 space-y-3">
              {document.versions.map((version) => (
                <li className="rounded-md bg-avend-surface-muted p-3" key={version.id}>
                  <p className="text-base font-semibold">Versión {version.versionNumber} · {version.originalFileName}</p>
                  <p className="mt-1 text-base text-avend-text-muted">{version.pageCount} páginas · {version.fileSizeBytes} bytes</p>
                  <AdminActionForm action={createDownloadUrlAction} className="mt-3 space-y-2" submitLabel="Generar enlace temporal">
                    <input name="documentId" type="hidden" value={document.id} />
                    <input name="versionId" type="hidden" value={version.id} />
                  </AdminActionForm>
                </li>
              ))}
            </ul>
          </article>

          <article className="avend-elevated rounded-lg border border-avend-border bg-avend-surface p-5">
            <h2 className="text-lg font-bold">Módulos asociados</h2>
            {document.moduleIds.length === 0 ? (
              <p className="mt-3 text-base text-avend-text-muted">No hay módulos asociados.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {document.moduleIds.map((moduleId) => (
                  <li className="flex items-center justify-between gap-3 rounded-md bg-avend-surface-muted p-3 text-base" key={moduleId}>
                    <span>{modules.find((module) => module.id === moduleId)?.name ?? moduleId}</span>
                    <AdminActionForm action={unlinkDocumentModuleAction} className="space-y-0" submitLabel="Desvincular">
                      <input name="documentId" type="hidden" value={document.id} />
                      <input name="moduleId" type="hidden" value={moduleId} />
                    </AdminActionForm>
                  </li>
                ))}
              </ul>
            )}
            {availableModules.length > 0 ? (
              <AdminActionForm action={linkDocumentModuleAction} className="mt-4 space-y-3" submitLabel="Asociar módulo">
                <input name="documentId" type="hidden" value={document.id} />
                <label className="block text-base font-medium" htmlFor="detail-module">
                  Módulo disponible
                  <select className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3" id="detail-module" name="moduleId" required>
                    {availableModules.map((module) => (
                      <option key={module.id} value={module.id}>{module.name} ({module.code})</option>
                    ))}
                  </select>
                </label>
              </AdminActionForm>
            ) : null}
          </article>
        </section>
      </div>
    </AdminShell>
  );
}
