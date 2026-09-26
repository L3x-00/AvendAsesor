import Link from "next/link";
import { notFound } from "next/navigation";
import {
  deleteDocumentAction,
  linkDocumentModuleAction,
  setDocumentTechnicalStatusAction,
  unlinkDocumentModuleAction,
  updateDocumentAction,
} from "@/app/admin/actions";
import { AdminActionForm } from "@/components/admin/admin-action-form";
import { AdminPage } from "@/components/admin/admin-page";
import { DeleteDisclosure } from "@/components/admin/delete-disclosure";
import { DocumentAuditHistory } from "@/components/admin/document-audit-history";
import { DocumentEditButton } from "@/components/admin/document-edit-button";
import { DocumentEditCancelButton } from "@/components/admin/document-edit-cancel-button";
import { DocumentEditSection } from "@/components/admin/document-edit-section";
import { DocumentMetadataFields } from "@/components/admin/document-metadata-fields";
import { DocumentPdfUploadForm } from "@/components/admin/document-pdf-upload-form";
import { DocumentSituationActions } from "@/components/admin/document-situation-actions";
import { DocumentSituationSummary } from "@/components/admin/document-situation-summary";
import { createAuthorizedAdminApiContext } from "@/lib/admin-api/authorized-client";
import { AdminApiError } from "@/lib/admin-api/client";
import { getAdminApiUrl } from "@/lib/admin-api/config";
import {
  documentTypeLabel,
  issuingEntityLabel,
} from "@/lib/admin-api/document-taxonomy";
import {
  formatDocumentSituation,
  getDocumentIngestionStatusContent,
  getDocumentTechnicalStatusContent,
} from "@/lib/admin-api/labels";
import { listReplacementDocumentCandidates } from "@/lib/admin-api/replacement-candidates";
import type {
  DocumentTechnicalStatus,
  ManagedDocumentDetails,
  ManagedDocumentVersion,
  ManagedModuleSummary,
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


function accessHref(
  documentId: string,
  disposition: "attachment" | "inline",
  versionId: string,
): string {
  const params = new URLSearchParams({ disposition, versionId });
  return `/api/admin/documents/${documentId}/access?${params.toString()}`;
}

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

// Solo el PDF se puede previsualizar en un iframe; Word y Markdown se ofrecen
// para descarga. La extensión del nombre original es la fuente fiable.
function isPdfVersion(version: ManagedDocumentVersion): boolean {
  return version.originalFileName.toLocaleLowerCase("en").endsWith(".pdf");
}

function technicalStatus(
  document: ManagedDocumentDetails,
  version: ManagedDocumentVersion | undefined,
): DocumentTechnicalStatus {
  if (!version || version.ingestionStatus === "failed") return "error";
  if (
    version.ingestionStatus === "indexed" &&
    document.approvalStatus === "ready" &&
    document.approvedVersionId === version.id
  ) {
    return "ready";
  }
  return "pending_approval";
}

function modulePath(
  module: ManagedModuleSummary,
  modules: ManagedModuleSummary[],
): string {
  const parent = module.parentModuleId
    ? modules.find((candidate) => candidate.id === module.parentModuleId)
    : undefined;
  return parent ? `${parent.name} › ${module.name}` : module.name;
}

function editableMetadata(metadata: Record<string, unknown>): string {
  const editable = { ...metadata };
  delete editable.additionalDetail;
  delete editable.documentTypeOther;
  delete editable.issuingEntityOther;
  delete editable.specificDependency;
  return Object.keys(editable).length ? JSON.stringify(editable, null, 2) : "";
}

export default async function DocumentDetailPage({
  params,
  searchParams,
}: DocumentDetailPageProps) {
  const [{ id }, rawSearchParams] = await Promise.all([params, searchParams]);
  const requestedVersion = rawSearchParams.versionId;
  const requestedVersionId = Array.isArray(requestedVersion)
    ? requestedVersion[0]
    : requestedVersion;
  const { client } = await createAuthorizedAdminApiContext({
    requireModulesAccess: true,
  });

  let document: ManagedDocumentDetails;
  try {
    document = await client.getDocument(id);
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 404) notFound();
    throw error;
  }

  const [modules, suggestions, replacementCandidates] = await Promise.all([
    client.listModuleSummaries("all"),
    client.getDocumentSuggestions(),
    listReplacementDocumentCandidates(client, document.id),
  ]);

  // El documento que reemplaza se muestra por su título y con enlace directo.
  // Puede haber sido eliminado después de registrarse el reemplazo, así que su
  // ausencia no debe romper la ficha ni dejar un vínculo muerto.
  let replacementDocument: { id: string; title: string } | null = null;
  if (document.replacementDocumentId) {
    try {
      const replacement = await client.getDocument(
        document.replacementDocumentId,
      );
      replacementDocument = { id: replacement.id, title: replacement.title };
    } catch {
      replacementDocument = null;
    }
  }
  const currentVersion = document.versions.find(
    (version) => version.id === document.currentVersionId,
  );
  const approvedVersion = document.versions.find(
    (version) => version.id === document.approvedVersionId,
  );
  const viewerVersion =
    document.versions.find((version) => version.id === requestedVersionId) ??
    currentVersion;
  const status = technicalStatus(document, currentVersion);
  const technicalContent = getDocumentTechnicalStatusContent(status);
  const associatedModules = document.moduleIds
    .map((moduleId) => modules.find((module) => module.id === moduleId))
    .filter((module): module is ManagedModuleSummary => Boolean(module));
  const validAssociationTargets = modules.filter((module) => {
    if (
      module.isDeleted ||
      !module.isActive ||
      document.moduleIds.includes(module.id)
    )
      return false;
    if (module.parentModuleId) {
      const parent = modules.find(
        (candidate) => candidate.id === module.parentModuleId,
      );
      return Boolean(parent?.isActive && !parent.isDeleted);
    }
    return module.submoduleCount === 0;
  });
  const primaryLocation = associatedModules[0];
  const parentLocation = primaryLocation?.parentModuleId
    ? modules.find((module) => module.id === primaryLocation.parentModuleId)
    : undefined;

  return (
    <AdminPage
      description="Visualiza el PDF, edita sus datos, gestiona asociaciones, versiones, vigencia y trazabilidad."
      title={document.title}
    >
      <div className="space-y-6">
        <nav aria-label="Ruta de navegación" className="text-base">
          <ol className="flex flex-wrap items-center gap-2 text-avend-text-muted">
            <li>
              <Link className="hover:underline" href="/admin/modules">
                Módulos
              </Link>
            </li>
            {parentLocation ? (
              <>
                <li aria-hidden="true">›</li>
                <li>
                  <Link
                    className="hover:underline"
                    href={`/admin/modules/${parentLocation.id}`}
                  >
                    {parentLocation.name}
                  </Link>
                </li>
              </>
            ) : null}
            {primaryLocation ? (
              <>
                <li aria-hidden="true">›</li>
                <li>
                  <Link
                    className="hover:underline"
                    href={`/admin/modules/${primaryLocation.id}`}
                  >
                    {primaryLocation.name}
                  </Link>
                </li>
              </>
            ) : (
              <>
                <li aria-hidden="true">›</li>
                <li>
                  <Link className="hover:underline" href="/admin/documents">
                    Todos los documentos
                  </Link>
                </li>
              </>
            )}
            <li aria-hidden="true">›</li>
            <li aria-current="page" className="font-semibold text-avend-text">
              {document.title}
            </li>
          </ol>
        </nav>

        <div aria-label="Acciones principales" className="flex flex-wrap gap-2">
          <DocumentEditButton />
          <a className="avend-button" href="#pdf-viewer">
            Ver PDF
          </a>
          {currentVersion ? (
            <a
              className="avend-button"
              href={accessHref(document.id, "attachment", currentVersion.id)}
            >
              Descargar PDF
              {currentVersion.id !== document.approvedVersionId
                ? " (versión más reciente)"
                : ""}
            </a>
          ) : null}
          <a className="avend-button" href="#version-history">
            Ver historial de versiones
          </a>
          <a className="avend-button" href="#new-version">
            Nueva versión
          </a>
          <a className="avend-button" href="#document-lifecycle">
            Archivar / Desactivar
          </a>
          <a className="avend-button" href="#delete-document">
            Eliminar
          </a>
        </div>

        <section
          aria-labelledby="document-summary"
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
        >
          <h2 className="sr-only" id="document-summary">
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
            <p className="mt-1 text-base text-avend-text-muted">
              {technicalContent.description}
            </p>
          </article>
          <article className="rounded-xl border border-avend-border bg-avend-surface p-4">
            <h3 className="text-base font-semibold text-avend-text-muted">
              Versión para consultas
            </h3>
            <p className="mt-2 text-lg font-bold text-avend-navy">
              {approvedVersion
                ? `v${approvedVersion.versionNumber}`
                : status === "error"
                  ? "Sin versión aprobada"
                  : "Pendiente de aprobación"}
            </p>
          </article>
          <article className="rounded-xl border border-avend-border bg-avend-surface p-4">
            <h3 className="text-base font-semibold text-avend-text-muted">
              Responsable
            </h3>
            <p className="mt-2 text-base font-bold text-avend-navy">
              {document.createdByName ?? "Cuenta no disponible"}
            </p>
          </article>
        </section>

        <DocumentSituationSummary
          document={document}
          replacement={replacementDocument}
        />

        <section
          className="rounded-xl border border-avend-border bg-avend-surface p-5"
          id="pdf-viewer"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">Vista del documento</h2>
              <p className="mt-1 text-base text-avend-text-muted">
                {viewerVersion
                  ? `Versión ${viewerVersion.versionNumber} · ${
                      viewerVersion.originalFileName
                    }${
                      isPdfVersion(viewerVersion)
                        ? ` · ${viewerVersion.pageCount} páginas`
                        : ""
                    }`
                  : "No hay un documento disponible."}
              </p>
            </div>
            {viewerVersion ? (
              <a
                className="avend-button"
                href={accessHref(document.id, "attachment", viewerVersion.id)}
              >
                Descargar PDF
              </a>
            ) : null}
          </div>
          {viewerVersion && isPdfVersion(viewerVersion) ? (
            <iframe
              className="mt-4 h-[50vh] min-h-[24rem] w-full rounded-lg border border-avend-border bg-white md:h-[70vh] md:min-h-[32rem]"
              src={accessHref(document.id, "inline", viewerVersion.id)}
              title={`PDF de ${document.title}, versión ${viewerVersion.versionNumber}`}
            />
          ) : viewerVersion ? (
            <div className="mt-4 rounded-lg border border-dashed border-avend-border p-6 text-center">
              <p className="text-base text-avend-text-muted">
                La vista previa integrada solo está disponible para PDF.
                Descarga el archivo para abrirlo en tu equipo.
              </p>
              <a
                className="avend-button mt-4 inline-flex"
                href={accessHref(document.id, "attachment", viewerVersion.id)}
              >
                Descargar {viewerVersion.originalFileName}
              </a>
            </div>
          ) : (
            <p className="mt-4 rounded-lg border border-dashed border-avend-border p-4 text-base text-avend-text-muted">
              El registro no tiene una versión visualizable.
            </p>
          )}
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
          <div className="space-y-6">
            <section className="rounded-xl border border-avend-border bg-avend-surface p-5">
              <h2 className="text-xl font-bold">Datos documentales</h2>
              <dl className="mt-4 grid gap-4 text-base sm:grid-cols-2">
                <div>
                  <dt className="font-semibold text-avend-text-muted">
                    Título
                  </dt>
                  <dd>{document.title}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-avend-text-muted">Año</dt>
                  <dd>{document.issuanceYear ?? "No registrado"}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-avend-text-muted">
                    Tipo documental
                  </dt>
                  <dd>
                    {document.documentType === "OTRO"
                      ? document.documentTypeOther
                      : documentTypeLabel(document.documentType)}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-avend-text-muted">
                    Entidad
                  </dt>
                  <dd>
                    {document.issuingEntity === "OTRA_INSTITUCION"
                      ? document.issuingEntityOther
                      : document.issuingEntity
                        ? issuingEntityLabel(document.issuingEntity)
                        : "No registrada"}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-avend-text-muted">
                    Dependencia específica
                  </dt>
                  <dd>{document.specificDependency ?? "No registrada"}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-avend-text-muted">
                    Detalle / Área / Oficina
                  </dt>
                  <dd>{document.additionalDetail ?? "No registrado"}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-avend-text-muted">
                    Número
                  </dt>
                  <dd>{document.resolutionNumber ?? "No registrado"}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-avend-text-muted">
                    Referencia
                  </dt>
                  <dd>{document.articleReference ?? "No registrada"}</dd>
                </div>
              </dl>

              <DocumentEditSection id="edit-document">
                <AdminActionForm
                  action={updateDocumentAction}
                  className="grid gap-3 sm:grid-cols-2"
                  rules={{
                    title: [
                      { kind: "required", label: "El título" },
                      { kind: "minLength", label: "El título", min: 2 },
                      { kind: "maxLength", label: "El título", max: 500 },
                    ],
                    metadata: [{ kind: "jsonObject", label: "Los metadatos" }],
                  }}
                  submitLabel="Guardar cambios"
                >
                  <input name="documentId" type="hidden" value={document.id} />
                  <label className="block sm:col-span-2" htmlFor="detail-title">
                    <span className="text-base font-semibold avend-field-label--required">
                      Título
                    </span>
                    <input
                      className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
                      defaultValue={document.title}
                      id="detail-title"
                      maxLength={500}
                      minLength={2}
                      name="title"
                      required
                    />
                  </label>
                  <DocumentMetadataFields
                    initial={{
                      additionalDetail: document.additionalDetail,
                      documentType: document.documentType,
                      documentTypeOther: document.documentTypeOther,
                      issuanceYear: document.issuanceYear,
                      issuingEntity: document.issuingEntity,
                      issuingEntityOther: document.issuingEntityOther,
                      keywords: document.keywords,
                      specificDependency: document.specificDependency,
                    }}
                    required
                    suggestions={suggestions}
                  />
                  <label className="block" htmlFor="detail-number">
                    <span className="text-base font-semibold">
                      Número (opcional)
                    </span>
                    <input
                      className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
                      defaultValue={document.resolutionNumber ?? ""}
                      id="detail-number"
                      name="resolutionNumber"
                    />
                  </label>
                  <label className="block" htmlFor="detail-reference">
                    <span className="text-base font-semibold">
                      Referencia (opcional)
                    </span>
                    <input
                      className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
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
                      Palabras clave JSON (opcional)
                    </span>
                    <textarea
                      className="mt-1 min-h-24 w-full rounded-md border border-avend-border px-3 py-2 font-mono text-base"
                      defaultValue={editableMetadata(document.metadata)}
                      id="detail-metadata"
                      name="metadata"
                    />
                  </label>
                  <DocumentEditCancelButton />
                </AdminActionForm>
              </DocumentEditSection>
            </section>

            <section
              className="rounded-xl border border-avend-border bg-avend-surface p-5"
              id="version-history"
            >
              <h2 className="text-xl font-bold">Historial de versiones</h2>
              <p className="mt-1 text-base text-avend-text-muted">
                Cada PDF anterior se conserva y puede verse o descargarse.
              </p>
              {document.versions.length ? (
                <ol className="mt-4 space-y-4">
                  {document.versions.map((version) => {
                    const ingestion = getDocumentIngestionStatusContent(
                      version.ingestionStatus,
                    );
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
                              {isPdfVersion(version)
                                ? `${version.pageCount} páginas · `
                                : ""}
                              {fileSize(version.fileSizeBytes)}
                            </p>
                          </div>
                          <div className="flex flex-wrap justify-end gap-2">
                            {version.id === document.currentVersionId ? (
                              <span className="rounded-full border border-blue-300 bg-blue-50 px-3 py-1 text-base font-semibold text-blue-900">
                                Versión más reciente
                              </span>
                            ) : null}
                            {version.id === document.approvedVersionId ? (
                              <span className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-base font-semibold text-emerald-900">
                                Aprobada para consultas
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <p className="mt-3 text-base">
                          <strong>{ingestion.label}.</strong>{" "}
                          {ingestion.description}
                        </p>
                        {/* Fecha y Administrador son dos de las cinco columnas
                            que el cliente pide: van rotuladas y a 16px, no como
                            texto secundario sin etiqueta. */}
                        <dl className="mt-3 grid gap-2 text-base sm:grid-cols-2">
                          <div>
                            <dt className="font-semibold text-avend-text-muted">
                              Fecha
                            </dt>
                            <dd>
                              <time dateTime={version.uploadedAt}>
                                {dateTimeFormatter.format(
                                  new Date(version.uploadedAt),
                                )}
                              </time>
                            </dd>
                          </div>
                          <div>
                            <dt className="font-semibold text-avend-text-muted">
                              Administrador
                            </dt>
                            <dd>
                              {version.uploadedByName ?? "Cuenta no disponible"}
                            </dd>
                          </div>
                        </dl>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Link
                            aria-label={`Ver la versión ${version.versionNumber} de ${document.title}`}
                            className="avend-button"
                            href={`/admin/documents/${document.id}?versionId=${encodeURIComponent(version.id)}#pdf-viewer`}
                          >
                            Ver
                          </Link>
                          <a
                            aria-label={`Descargar la versión ${version.versionNumber} de ${document.title}`}
                            className="avend-button"
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
              ) : (
                <p className="mt-4 text-base text-avend-text-muted">
                  No hay versiones registradas.
                </p>
              )}
            </section>

            <DocumentAuditHistory
              context={{
                documentTitleById: new Map(
                  replacementDocument
                    ? [[replacementDocument.id, replacementDocument.title]]
                    : [],
                ),
                moduleNameById: new Map(
                  modules.map((module) => [module.id, module.name]),
                ),
              }}
              events={document.auditEvents}
            />
          </div>

          <div className="space-y-6">
            <section className="rounded-xl border border-avend-border bg-avend-surface p-5">
              <h2 className="text-xl font-bold">Estado técnico</h2>
              {status === "error" ? (
                <p className="mt-3 rounded-lg border border-red-300 bg-red-50 p-4 text-base text-red-900">
                  Error asignado automáticamente por una falla de lectura,
                  procesamiento o indexación. No puede seleccionarse
                  manualmente.
                </p>
              ) : (
                <AdminActionForm
                  action={setDocumentTechnicalStatusAction}
                  className="mt-4 space-y-3"
                  submitLabel="Guardar estado técnico"
                >
                  <input name="documentId" type="hidden" value={document.id} />
                  <label className="block" htmlFor="technical-status">
                    <span className="text-base font-semibold">Estado</span>
                    <select
                      className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
                      defaultValue={document.approvalStatus}
                      id="technical-status"
                      name="technicalStatus"
                    >
                      <option value="pending_approval">
                        Pendiente de aprobación
                      </option>
                      <option
                        disabled={currentVersion?.ingestionStatus !== "indexed"}
                        value="ready"
                      >
                        Listo
                      </option>
                      <option disabled value="error">
                        Error (solo automático)
                      </option>
                    </select>
                  </label>
                  {currentVersion?.ingestionStatus !== "indexed" ? (
                    <p className="text-base text-avend-text-muted">
                      Para aprobarla como Listo, la versión debe estar indexada.
                      Si el procesamiento automático no está activo o aún no
                      termina, permanecerá en Pendiente.
                    </p>
                  ) : null}
                </AdminActionForm>
              )}
            </section>

            <div id="document-lifecycle">
              <DocumentSituationActions
                documentId={document.id}
                replacementCandidates={replacementCandidates}
                situation={document.situation}
              />
            </div>

            <section
              className="rounded-xl border border-avend-border bg-avend-surface p-5"
              id="new-version"
            >
              <h2 className="text-xl font-bold">Nueva versión</h2>
              <p className="mt-1 text-base text-avend-text-muted">
                La versión anterior permanecerá intacta y disponible en el
                historial.
              </p>
              <DocumentPdfUploadForm
                apiBaseUrl={getAdminApiUrl()}
                className="mt-4 space-y-3"
                endpoint={`/admin/documents/${encodeURIComponent(document.id)}/versions`}
                submitLabel="Subir nueva versión"
                successMessage="Nueva versión creada."
              >
                <label className="block" htmlFor="detail-file">
                  <span className="text-base font-semibold avend-field-label--required">
                    Archivo (PDF, Word o Markdown)
                  </span>
                  <input
                    accept=".pdf,.docx,.doc,.md,application/pdf"
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
              {associatedModules.length ? (
                <ul className="mt-3 space-y-2">
                  {associatedModules.map((module) => (
                    <li
                      className="rounded-md bg-avend-surface-muted p-3 text-base"
                      key={module.id}
                    >
                      <Link
                        className="font-semibold hover:underline"
                        href={`/admin/modules/${module.id}`}
                      >
                        {modulePath(module, modules)}
                      </Link>
                      {associatedModules.length > 1 ? (
                        <div className="mt-2">
                        <DeleteDisclosure
                          description={
                            <p>
                              El documento dejará de estar en este módulo. El
                              PDF y sus demás asociaciones se conservan.
                            </p>
                          }
                          size="compact"
                          title="¿Quitar esta asociación?"
                          triggerLabel="Quitar asociación"
                        >
                        <AdminActionForm
                          action={unlinkDocumentModuleAction}
                          className="space-y-2"
                          submitLabel="Sí, quitar asociación"
                          tone="danger"
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
                        </DeleteDisclosure>
                        </div>
                      ) : (
                        <p className="mt-1 text-base text-avend-text-muted">
                          Asociación principal; agrega otra antes de quitarla.
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-base text-red-800">
                  Sin asociaciones. Corrige el registro agregando una ubicación.
                </p>
              )}
              {validAssociationTargets.length ? (
                <AdminActionForm
                  action={linkDocumentModuleAction}
                  className="mt-4 space-y-3"
                  submitLabel="Agregar asociación"
                  rules={{ moduleId: [{ kind: "required", label: "La ubicación" }] }}
                >
                  <input name="documentId" type="hidden" value={document.id} />
                  <label className="block" htmlFor="detail-module">
                    <span className="text-base font-semibold">Ubicación</span>
                    <select
                      className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
                      id="detail-module"
                      name="moduleId"
                      required
                    >
                      {validAssociationTargets.map((module) => (
                        <option key={module.id} value={module.id}>
                          {modulePath(module, modules)}
                        </option>
                      ))}
                    </select>
                  </label>
                </AdminActionForm>
              ) : null}
            </section>

            <section
              aria-label="Eliminar documento"
              className="rounded-xl border border-avend-border bg-avend-surface p-5"
              id="delete-document"
            >
              <DeleteDisclosure
                description={
                  <p>
                    La eliminación es lógica: el documento sale de la gestión
                    habitual, pero se conservan el PDF, sus versiones y el
                    historial.
                  </p>
                }
                title="¿Eliminar este documento?"
                triggerLabel="Eliminar documento"
              >
              <AdminActionForm
                action={deleteDocumentAction}
                className="space-y-3"
                submitLabel="Sí, eliminar documento"
                tone="danger"
                rules={{ reason: [
                  { kind: "required", label: "El motivo" },
                  { kind: "minLength", label: "El motivo", min: 2 },
                ] }}
              >
                <input name="documentId" type="hidden" value={document.id} />
                <label className="block" htmlFor="detail-delete-reason">
                  <span className="text-base font-semibold text-red-900">
                    Motivo
                  </span>
                  <input
                    className="mt-1 min-h-11 w-full rounded-md border border-red-400 px-3 text-base"
                    id="detail-delete-reason"
                    minLength={2}
                    name="reason"
                    required
                  />
                </label>
              </AdminActionForm>
              </DeleteDisclosure>
            </section>
          </div>
        </div>
      </div>
    </AdminPage>
  );
}
