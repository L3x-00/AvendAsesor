import Link from "next/link";
import { notFound } from "next/navigation";
import {
  deleteDocumentAction,
  linkDocumentModuleAction,
  setDocumentSituationAction,
  unlinkDocumentModuleAction,
  updateDocumentAction,
} from "@/app/admin/actions";
import { AdminActionForm } from "@/components/admin/admin-action-form";
import { AdminShell } from "@/components/admin/admin-shell";
import { DocumentPdfUploadForm } from "@/components/admin/document-pdf-upload-form";
import { createAuthorizedAdminApiContext } from "@/lib/admin-api/authorized-client";
import { AdminApiError } from "@/lib/admin-api/client";
import { getAdminApiUrl } from "@/lib/admin-api/config";
import {
  formatDocumentSituation,
  formatDocumentType,
  getDocumentIngestionStatusContent,
  getDocumentTechnicalStatusContent,
} from "@/lib/admin-api/labels";
import type {
  DocumentLibraryItem,
  DocumentTechnicalStatus,
  ManagedDocumentDetails,
  ManagedDocumentVersion,
  ManagedModule,
} from "@/lib/admin-api/types";

interface DocumentDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const dateTimeFormatter = new Intl.DateTimeFormat("es-PE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Lima",
});

const dateFormatter = new Intl.DateTimeFormat("es-PE", {
  dateStyle: "medium",
  timeZone: "UTC",
});

function technicalStatus(
  version: ManagedDocumentVersion | undefined,
): DocumentTechnicalStatus {
  if (!version || version.ingestionStatus === "failed") return "error";
  if (version.ingestionStatus === "indexed") return "ready";
  return "pending_approval";
}

function accessHref(
  documentId: string,
  disposition: "attachment" | "inline",
  versionId: string,
): string {
  const params = new URLSearchParams({ disposition, versionId });
  return `/api/admin/documents/${documentId}/access?${params.toString()}`;
}

function modulePath(module: ManagedModule, modules: ManagedModule[]): string {
  const parent = module.parentModuleId
    ? modules.find((candidate) => candidate.id === module.parentModuleId)
    : undefined;
  return parent ? `${parent.name} › ${module.name}` : module.name;
}

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export default async function DocumentDetailPage({
  params,
  searchParams,
}: DocumentDetailPageProps) {
  const [{ id }, rawSearchParams] = await Promise.all([params, searchParams]);
  const rawReplacementQuery = rawSearchParams.replacementQ;
  const replacementQuery = (
    Array.isArray(rawReplacementQuery)
      ? rawReplacementQuery[0]
      : (rawReplacementQuery ?? "")
  )
    .trim()
    .slice(0, 200);
  const { access, client } = await createAuthorizedAdminApiContext();

  let document: ManagedDocumentDetails;
  let modules: ManagedModule[];
  let replacementCandidates: DocumentLibraryItem[];

  try {
    const [documentResult, moduleResult, candidatePage] = await Promise.all([
      client.getDocument(id),
      client.listModules("all"),
      client.listDocumentLibrary({
        limit: 25,
        q: replacementQuery || undefined,
        situation: "current",
        sort: "title",
      }),
    ]);
    document = documentResult;
    modules = moduleResult;
    replacementCandidates = candidatePage.items;
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  const currentVersion = document.versions.find(
    (version) => version.id === document.currentVersionId,
  );
  const derivedTechnicalStatus = technicalStatus(currentVersion);
  const technicalContent = getDocumentTechnicalStatusContent(
    derivedTechnicalStatus,
  );
  const associatedModules = document.moduleIds
    .map((moduleId) => modules.find((module) => module.id === moduleId))
    .filter((module): module is ManagedModule => Boolean(module));
  const availableModules = modules.filter(
    (module) =>
      !module.isDeleted &&
      module.isActive &&
      !document.moduleIds.includes(module.id),
  );
  let replacementDocument: ManagedDocumentDetails | undefined;
  if (document.replacementDocumentId) {
    try {
      replacementDocument = await client.getDocument(
        document.replacementDocumentId,
      );
    } catch (error) {
      if (!(error instanceof AdminApiError && error.status === 404)) {
        throw error;
      }
    }
  }
  const liveReplacementCandidates = replacementCandidates.filter(
    (candidate) => candidate.id !== document.id,
  );

  return (
    <AdminShell
      activeSection="documents"
      description="Revisa trazabilidad, asociaciones, versiones y situación sin perder los PDF anteriores."
      title={document.title}
      userName={access.fullName}
      userRole={access.role}
    >
      <div className="space-y-6">
        <nav aria-label="Ruta de navegación" className="text-base">
          <ol className="flex flex-wrap items-center gap-2 text-avend-text-muted">
            <li>
              <Link className="hover:underline" href="/admin/documents">
                Historial de documentos
              </Link>
            </li>
            <li aria-hidden="true">›</li>
            <li aria-current="page" className="font-semibold text-avend-text">
              {document.title}
            </li>
          </ol>
        </nav>

        <section
          aria-labelledby="document-summary-title"
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
        >
          <h2 className="sr-only" id="document-summary-title">
            Resumen del documento
          </h2>
          <article className="rounded-xl border border-avend-border bg-avend-surface p-4">
            <h3 className="text-base font-semibold text-avend-text-muted">
              Situación
            </h3>
            <p className="mt-2 text-lg font-bold text-avend-navy">
              {formatDocumentSituation(document.situation)}
            </p>
          </article>
          <article className="rounded-xl border border-avend-border bg-avend-surface p-4">
            <h3 className="text-base font-semibold text-avend-text-muted">
              Estado técnico
            </h3>
            <p className="mt-2 text-lg font-bold text-avend-navy">
              {technicalContent.label}
            </p>
            <p className="mt-1 text-sm leading-5 text-avend-text-muted">
              {technicalContent.description}
            </p>
          </article>
          <article className="rounded-xl border border-avend-border bg-avend-surface p-4">
            <h3 className="text-base font-semibold text-avend-text-muted">
              Fecha de carga
            </h3>
            <p className="mt-2 text-base font-bold text-avend-navy">
              <time dateTime={document.createdAt}>
                {dateTimeFormatter.format(new Date(document.createdAt))}
              </time>
            </p>
          </article>
          <article className="rounded-xl border border-avend-border bg-avend-surface p-4">
            <h3 className="text-base font-semibold text-avend-text-muted">
              Administrador responsable
            </h3>
            <p className="mt-2 text-base font-bold text-avend-navy">
              {document.createdByName ?? "Cuenta no disponible"}
            </p>
          </article>
        </section>

        {document.situation === "replaced" ? (
          <section className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-amber-950">
            <h2 className="text-xl font-bold">Documento reemplazado</h2>
            <dl className="mt-3 grid gap-3 text-base md:grid-cols-2">
              <div>
                <dt className="font-semibold">Motivo</dt>
                <dd>{document.replacementReason ?? "No registrado"}</dd>
              </div>
              <div>
                <dt className="font-semibold">Fecha o año</dt>
                <dd>
                  {document.replacementDate
                    ? dateFormatter.format(
                        new Date(`${document.replacementDate}T00:00:00.000Z`),
                      )
                    : (document.replacementYear ?? "No registrado")}
                </dd>
              </div>
              {document.replacementObservation ? (
                <div className="md:col-span-2">
                  <dt className="font-semibold">Observación</dt>
                  <dd>{document.replacementObservation}</dd>
                </div>
              ) : null}
            </dl>
            {document.replacementDocumentId && replacementDocument ? (
              <Link
                className="mt-4 inline-flex min-h-11 items-center rounded-md border border-amber-700 px-4 text-base font-semibold hover:bg-amber-100"
                href={`/admin/documents/${document.replacementDocumentId}`}
              >
                Abrir documento reemplazante
                {`: ${replacementDocument.title}`}
              </Link>
            ) : document.replacementDocumentId ? (
              <p className="mt-4 text-base font-semibold">
                El documento reemplazante asociado ya no está disponible.
              </p>
            ) : (
              <p className="mt-4 text-base">
                El documento nuevo aún no fue vinculado al registro.
              </p>
            )}
          </section>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)]">
          <div className="space-y-6">
            <section className="rounded-xl border border-avend-border bg-avend-surface p-5">
              <h2 className="text-xl font-bold">Datos documentales</h2>
              <dl className="mt-4 grid gap-4 text-base sm:grid-cols-2">
                <div>
                  <dt className="font-semibold text-avend-text-muted">Tipo</dt>
                  <dd>{formatDocumentType(document.documentType)}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-avend-text-muted">Año</dt>
                  <dd>{document.issuanceYear ?? "No registrado"}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-avend-text-muted">
                    Entidad
                  </dt>
                  <dd>{document.issuingEntity ?? "No registrada"}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-avend-text-muted">
                    Número
                  </dt>
                  <dd>{document.resolutionNumber ?? "No registrado"}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="font-semibold text-avend-text-muted">
                    Referencia
                  </dt>
                  <dd>{document.articleReference ?? "No registrada"}</dd>
                </div>
              </dl>

              <details className="mt-5 rounded-lg border border-avend-border p-4">
                <summary className="cursor-pointer text-base font-bold">
                  Editar datos del documento
                </summary>
                <AdminActionForm
                  action={updateDocumentAction}
                  className="mt-4 grid gap-3 sm:grid-cols-2"
                  submitLabel="Guardar cambios"
                >
                  <input name="documentId" type="hidden" value={document.id} />
                  <label className="block sm:col-span-2" htmlFor="detail-title">
                    <span className="text-base font-semibold">Título</span>
                    <input
                      className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3"
                      defaultValue={document.title}
                      id="detail-title"
                      name="title"
                      required
                    />
                  </label>
                  <label className="block" htmlFor="detail-type">
                    <span className="text-base font-semibold">Tipo</span>
                    <input
                      className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3"
                      defaultValue={document.documentType}
                      id="detail-type"
                      name="documentType"
                      pattern="[A-Za-z][A-Za-z0-9_]{1,63}"
                      required
                    />
                  </label>
                  <label className="block" htmlFor="detail-year">
                    <span className="text-base font-semibold">Año</span>
                    <input
                      className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3"
                      defaultValue={document.issuanceYear ?? ""}
                      id="detail-year"
                      max="2200"
                      min="1800"
                      name="issuanceYear"
                      type="number"
                    />
                  </label>
                  <label className="block" htmlFor="detail-entity">
                    <span className="text-base font-semibold">Entidad</span>
                    <input
                      className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3"
                      defaultValue={document.issuingEntity ?? ""}
                      id="detail-entity"
                      name="issuingEntity"
                    />
                  </label>
                  <label className="block" htmlFor="detail-number">
                    <span className="text-base font-semibold">Número</span>
                    <input
                      className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3"
                      defaultValue={document.resolutionNumber ?? ""}
                      id="detail-number"
                      name="resolutionNumber"
                    />
                  </label>
                  <label
                    className="block sm:col-span-2"
                    htmlFor="detail-reference"
                  >
                    <span className="text-base font-semibold">Referencia</span>
                    <input
                      className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3"
                      defaultValue={document.articleReference ?? ""}
                      id="detail-reference"
                      name="articleReference"
                    />
                  </label>
                  <label
                    className="block sm:col-span-2"
                    htmlFor="detail-metadata"
                  >
                    <span className="text-base font-semibold">
                      Metadatos JSON
                    </span>
                    <textarea
                      className="mt-1 min-h-24 w-full rounded-md border border-avend-border px-3 py-2 font-mono text-base"
                      defaultValue={JSON.stringify(document.metadata, null, 2)}
                      id="detail-metadata"
                      name="metadata"
                    />
                  </label>
                  <button
                    className="inline-flex min-h-11 items-center justify-center rounded-md border border-avend-border px-4 text-base font-semibold"
                    type="reset"
                  >
                    Cancelar
                  </button>
                </AdminActionForm>
              </details>
            </section>

            <section className="rounded-xl border border-avend-border bg-avend-surface p-5">
              <h2 className="text-xl font-bold">Historial de versiones</h2>
              <p className="mt-1 text-base text-avend-text-muted">
                Las versiones anteriores se conservan y permanecen disponibles.
              </p>
              <ol className="mt-4 space-y-4">
                {document.versions.map((version) => {
                  const ingestion = getDocumentIngestionStatusContent(
                    version.ingestionStatus,
                  );
                  const isCurrent = version.id === document.currentVersionId;
                  return (
                    <li
                      className="rounded-lg border border-avend-border p-4"
                      key={version.id}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h3 className="text-base font-bold">
                            Versión {version.versionNumber} ·{" "}
                            {version.originalFileName}
                          </h3>
                          <p className="mt-1 text-base text-avend-text-muted">
                            {version.pageCount} páginas ·{" "}
                            {fileSize(version.fileSizeBytes)}
                          </p>
                        </div>
                        {isCurrent ? (
                          <span className="rounded-full border border-blue-300 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-900">
                            Versión actual
                          </span>
                        ) : null}
                      </div>
                      <dl className="mt-3 grid gap-2 text-base sm:grid-cols-2">
                        <div>
                          <dt className="font-semibold">Fecha</dt>
                          <dd>
                            <time dateTime={version.uploadedAt}>
                              {dateTimeFormatter.format(
                                new Date(version.uploadedAt),
                              )}
                            </time>
                          </dd>
                        </div>
                        <div>
                          <dt className="font-semibold">Administrador</dt>
                          <dd>
                            {version.uploadedByName ?? "Cuenta no disponible"}
                          </dd>
                        </div>
                        <div className="sm:col-span-2">
                          <dt className="font-semibold">Procesamiento</dt>
                          <dd>
                            {ingestion.label}. {ingestion.description}
                          </dd>
                        </div>
                      </dl>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <a
                          className="inline-flex min-h-11 items-center rounded-md border border-avend-border px-4 text-base font-semibold hover:bg-avend-soft-blue"
                          href={accessHref(document.id, "inline", version.id)}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Ver PDF
                        </a>
                        <a
                          className="inline-flex min-h-11 items-center rounded-md border border-avend-border px-4 text-base font-semibold hover:bg-avend-soft-blue"
                          href={accessHref(
                            document.id,
                            "attachment",
                            version.id,
                          )}
                        >
                          Descargar
                        </a>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          </div>

          <div className="space-y-6">
            <section className="rounded-xl border border-avend-border bg-avend-surface p-5">
              <h2 className="text-xl font-bold">Cambiar situación</h2>
              <p className="mt-1 text-base leading-7 text-avend-text-muted">
                La situación determina si el documento está vigente, fue
                reemplazado o se conserva archivado.
              </p>

              {document.situation !== "current" ? (
                <AdminActionForm
                  action={setDocumentSituationAction}
                  className="mt-4 space-y-3"
                  submitLabel="Marcar como vigente"
                >
                  <input name="documentId" type="hidden" value={document.id} />
                  <input name="situation" type="hidden" value="current" />
                </AdminActionForm>
              ) : null}

              {document.situation !== "archived" ? (
                <details className="mt-4 rounded-lg border border-avend-border p-4">
                  <summary className="cursor-pointer text-base font-bold">
                    Archivar / Desactivar
                  </summary>
                  <AdminActionForm
                    action={setDocumentSituationAction}
                    className="mt-4 space-y-3"
                    submitLabel="Archivar documento"
                  >
                    <input
                      name="documentId"
                      type="hidden"
                      value={document.id}
                    />
                    <input name="situation" type="hidden" value="archived" />
                    <label className="block" htmlFor="archive-reason">
                      <span className="text-base font-semibold">Motivo</span>
                      <textarea
                        className="mt-1 min-h-20 w-full rounded-md border border-avend-border px-3 py-2 text-base"
                        id="archive-reason"
                        maxLength={500}
                        minLength={2}
                        name="reason"
                        required
                      />
                    </label>
                  </AdminActionForm>
                </details>
              ) : null}

              {document.situation !== "replaced" ? (
                <details
                  className="mt-4 rounded-lg border border-amber-300 p-4"
                  id="replacement-management"
                  open={replacementQuery.length > 0}
                >
                  <summary className="cursor-pointer text-base font-bold">
                    Marcar como reemplazado / Sin vigencia
                  </summary>
                  <form
                    className="mt-4 rounded-lg bg-amber-50 p-3"
                    method="get"
                  >
                    <label
                      className="block"
                      htmlFor="replacement-candidate-search"
                    >
                      <span className="text-base font-semibold">
                        Buscar documento reemplazante
                      </span>
                      <span
                        className="mt-1 block text-sm text-avend-text-muted"
                        id="replacement-candidate-help"
                      >
                        Busca en todos los documentos vigentes por título,
                        número, entidad o palabras clave.
                      </span>
                      <input
                        aria-describedby="replacement-candidate-help"
                        className="mt-2 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
                        defaultValue={replacementQuery}
                        id="replacement-candidate-search"
                        maxLength={200}
                        name="replacementQ"
                        placeholder="Buscar documento..."
                        type="search"
                      />
                    </label>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        className="inline-flex min-h-11 items-center justify-center rounded-md bg-avend-navy px-4 text-base font-semibold text-white hover:bg-avend-blue"
                        type="submit"
                      >
                        Buscar
                      </button>
                      {replacementQuery ? (
                        <Link
                          className="inline-flex min-h-11 items-center justify-center rounded-md border border-avend-border bg-white px-4 text-base font-semibold text-avend-navy"
                          href={`/admin/documents/${document.id}#replacement-management`}
                        >
                          Limpiar búsqueda
                        </Link>
                      ) : null}
                    </div>
                    <p aria-live="polite" className="mt-2 text-sm">
                      {replacementQuery
                        ? `${liveReplacementCandidates.length} coincidencia(s) disponible(s).`
                        : "Se muestran hasta 25 documentos vigentes. Busca para localizar cualquier otro registro."}
                    </p>
                  </form>
                  <AdminActionForm
                    action={setDocumentSituationAction}
                    className="mt-4 space-y-3"
                    submitLabel="Registrar reemplazo"
                  >
                    <input
                      name="documentId"
                      type="hidden"
                      value={document.id}
                    />
                    <input name="situation" type="hidden" value="replaced" />
                    <label className="block" htmlFor="replacement-reason">
                      <span className="text-base font-semibold">Motivo</span>
                      <textarea
                        className="mt-1 min-h-20 w-full rounded-md border border-avend-border px-3 py-2 text-base"
                        id="replacement-reason"
                        maxLength={500}
                        minLength={2}
                        name="reason"
                        required
                      />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block" htmlFor="replacement-date">
                        <span className="text-base font-semibold">
                          Fecha (opcional)
                        </span>
                        <input
                          className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3"
                          id="replacement-date"
                          name="replacementDate"
                          type="date"
                        />
                      </label>
                      <label className="block" htmlFor="replacement-year">
                        <span className="text-base font-semibold">
                          Año (opcional)
                        </span>
                        <input
                          className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3"
                          id="replacement-year"
                          max="2200"
                          min="1800"
                          name="replacementYear"
                          type="number"
                        />
                      </label>
                    </div>
                    <p className="text-sm text-avend-text-muted">
                      Completa al menos la fecha o el año. Si usas ambos, deben
                      coincidir.
                    </p>
                    <label className="block" htmlFor="replacement-document">
                      <span className="text-base font-semibold">
                        Documento nuevo ya registrado (opcional)
                      </span>
                      <select
                        className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
                        defaultValue=""
                        id="replacement-document"
                        name="replacementDocumentId"
                      >
                        <option value="">Aún no está registrado</option>
                        {replacementQuery &&
                        liveReplacementCandidates.length === 0 ? (
                          <option disabled>Sin coincidencias</option>
                        ) : null}
                        {liveReplacementCandidates.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block" htmlFor="replacement-observation">
                      <span className="text-base font-semibold">
                        Observación (opcional)
                      </span>
                      <textarea
                        className="mt-1 min-h-20 w-full rounded-md border border-avend-border px-3 py-2 text-base"
                        id="replacement-observation"
                        maxLength={1000}
                        minLength={2}
                        name="observation"
                      />
                    </label>
                  </AdminActionForm>
                </details>
              ) : null}
            </section>

            <section className="rounded-xl border border-avend-border bg-avend-surface p-5">
              <h2 className="text-xl font-bold">Nueva versión</h2>
              <p className="mt-1 text-base text-avend-text-muted">
                La versión anterior permanecerá intacta.
              </p>
              <DocumentPdfUploadForm
                apiBaseUrl={getAdminApiUrl()}
                className="mt-4 space-y-3"
                endpoint={`/admin/documents/${encodeURIComponent(document.id)}/versions`}
                submitLabel="Crear nueva versión"
                successMessage="Nueva versión creada."
              >
                <label className="block" htmlFor="detail-file">
                  <span className="text-base font-semibold">Archivo PDF</span>
                  <input
                    accept="application/pdf,.pdf"
                    className="mt-1 block min-h-11 w-full text-base"
                    id="detail-file"
                    name="file"
                    required
                    type="file"
                  />
                </label>
              </DocumentPdfUploadForm>
            </section>

            <section className="rounded-xl border border-avend-border bg-avend-surface p-5">
              <h2 className="text-xl font-bold">Módulos y submódulos</h2>
              {associatedModules.length === 0 ? (
                <p className="mt-3 text-base text-avend-text-muted">
                  Sin asociaciones.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {associatedModules.map((module) => (
                    <li
                      className="flex flex-col gap-2 rounded-md bg-avend-surface-muted p-3 text-base sm:flex-row sm:items-center sm:justify-between"
                      key={module.id}
                    >
                      <Link
                        className="font-semibold hover:underline"
                        href={`/admin/modules/${module.id}`}
                      >
                        {modulePath(module, modules)}
                      </Link>
                      <AdminActionForm
                        action={unlinkDocumentModuleAction}
                        className="space-y-0"
                        submitLabel="Desvincular"
                      >
                        <input
                          name="documentId"
                          type="hidden"
                          value={document.id}
                        />
                        <input
                          name="moduleId"
                          type="hidden"
                          value={module.id}
                        />
                      </AdminActionForm>
                    </li>
                  ))}
                </ul>
              )}
              {availableModules.length > 0 ? (
                <AdminActionForm
                  action={linkDocumentModuleAction}
                  className="mt-4 space-y-3"
                  submitLabel="Asociar ubicación"
                >
                  <input name="documentId" type="hidden" value={document.id} />
                  <label className="block" htmlFor="detail-module">
                    <span className="text-base font-semibold">
                      Módulo o submódulo
                    </span>
                    <select
                      className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
                      id="detail-module"
                      name="moduleId"
                      required
                    >
                      {availableModules.map((module) => (
                        <option key={module.id} value={module.id}>
                          {modulePath(module, modules)}
                        </option>
                      ))}
                    </select>
                  </label>
                </AdminActionForm>
              ) : null}
            </section>

            <section className="rounded-xl border border-red-300 bg-red-50 p-5">
              <h2 className="text-xl font-bold text-red-900">
                Eliminar registro
              </h2>
              <p className="mt-1 text-base text-red-800">
                La baja es lógica: las versiones se conservan para auditoría,
                pero el documento deja de aparecer en la biblioteca.
              </p>
              <AdminActionForm
                action={deleteDocumentAction}
                className="mt-4 space-y-3"
                submitLabel="Eliminar lógicamente"
              >
                <input name="documentId" type="hidden" value={document.id} />
                <label className="block" htmlFor="detail-delete-reason">
                  <span className="text-base font-semibold text-red-900">
                    Motivo de baja
                  </span>
                  <input
                    className="mt-1 min-h-11 w-full rounded-md border border-red-400 px-3"
                    id="detail-delete-reason"
                    name="reason"
                    required
                  />
                </label>
              </AdminActionForm>
            </section>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
