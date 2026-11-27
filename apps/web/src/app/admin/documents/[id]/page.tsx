import Link from "next/link";
import { notFound } from "next/navigation";
import {
  deleteDocumentAction,
  linkDocumentModuleAction,
  unlinkDocumentModuleAction,
  updateDocumentAction,
} from "@/app/admin/actions";
import { AdminActionForm } from "@/components/admin/admin-action-form";
import { AdminPage } from "@/components/admin/admin-page";
import { DeleteDisclosure } from "@/components/admin/delete-disclosure";
import { DocumentAuditHistory } from "@/components/admin/document-audit-history";
import { DocumentEditButton } from "@/components/admin/document-edit-button";
import { DocumentEditCancelButton } from "@/components/admin/document-edit-cancel-button";
import {
  DocumentEditDataButton,
  DocumentEditSection,
} from "@/components/admin/document-edit-section";
import { DocumentHistoryDialog } from "@/components/admin/document-history-dialog";
import { DocumentIngestionRecovery } from "@/components/admin/document-ingestion-recovery";
import { DocumentMetadataFields } from "@/components/admin/document-metadata-fields";
import { DocumentPdfUploadForm } from "@/components/admin/document-pdf-upload-form";
import { DocumentSituationActions } from "@/components/admin/document-situation-actions";
import { DocumentSituationSummary } from "@/components/admin/document-situation-summary";
import { DocumentTechnicalStatusForm } from "@/components/admin/document-technical-status-form";
import { createAuthorizedAdminApiContext } from "@/lib/admin-api/authorized-client";
import { AdminApiError } from "@/lib/admin-api/client";
import { getAdminApiUrl } from "@/lib/admin-api/config";
import {
  documentTypeLabel,
  issuingEntityLabel,
} from "@/lib/admin-api/document-taxonomy";
import {
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

function isPdfVersion(version: ManagedDocumentVersion): boolean {
  return version.originalFileName.toLocaleLowerCase("en").endsWith(".pdf");
}

function editableMetadata(metadata: Record<string, unknown>): string {
  const editable = { ...metadata };
  delete editable.additionalDetail;
  delete editable.documentTypeOther;
  delete editable.issuingEntityOther;
  delete editable.specificDependency;
  return Object.keys(editable).length ? JSON.stringify(editable) : "";
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
  const statusColorClass =
    status === "ready"
      ? "text-emerald-700"
      : status === "pending_approval"
        ? "text-amber-800"
        : "text-red-700";

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

        <div className="flex flex-wrap items-center gap-6 border-b border-avend-border">
          <DocumentEditButton />
          <HistoryModal
            document={document}
            modules={modules}
            replacementDocument={replacementDocument}
          />
        </div>

        <section
          aria-labelledby="document-summary"
          className="grid gap-3 overflow-hidden rounded-xl border border-avend-border bg-avend-surface md:grid-cols-2 md:divide-x xl:grid-cols-3"
        >
          <h2 className="sr-only" id="document-summary">
            Resumen del documento
          </h2>
          <article className="flex items-center gap-3 p-4">
            <span aria-hidden="true" className="flex flex-none items-center justify-center rounded-full bg-emerald-100 p-1 text-emerald-700">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" viewBox="0 0 24 24">
                <path d="m5 12.5 4.5 4.5L19 7" />
              </svg>
            </span>
            <div>
              <h3 className="text-base font-semibold text-avend-text-muted">
                Estado técnico
              </h3>
              <p className={`mt-1 text-lg font-bold ${statusColorClass}`}>
                {technicalContent.label}
              </p>
              <p className="mt-0.5 text-base text-avend-text-muted">
                {technicalContent.description}
              </p>
            </div>
          </article>

          <article className="flex items-center gap-3 p-4">
            <span aria-hidden="true" className="flex flex-none items-center justify-center rounded-lg bg-blue-50 p-2 text-blue-600">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                <path d="M12 4 4 8l8 4 8-4zM4 12l8 4 8-4M4 16l8 4 8-4" />
              </svg>
            </span>
            <div>
              <h3 className="text-base font-semibold text-avend-text-muted">
                Versión para consultas
              </h3>
              <p className="mt-1 text-lg font-bold text-avend-navy">
                {approvedVersion
                  ? `v${approvedVersion.versionNumber}`
                  : status === "error"
                    ? "Sin versión aprobada"
                    : "Pendiente de aprobación"}
              </p>
            </div>
          </article>
          <article className="flex items-center gap-3 p-4">
            <span aria-hidden="true" className="flex flex-none items-center justify-center rounded-lg bg-blue-50 p-2 text-blue-600">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                <circle cx="12" cy="8" r="3.5" />
                <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
              </svg>
            </span>
            <div>
              <h3 className="text-base font-semibold text-avend-text-muted">
                Responsable
              </h3>
              <p className="mt-1 text-base font-bold text-avend-navy">
                {document.createdByName ?? "Cuenta no disponible"}
              </p>
            </div>
          </article>
        </section>

        <DocumentSituationSummary
          document={document}
          replacement={replacementDocument}
        />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
          <div className="space-y-4">
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
                        ? viewerVersion.pageCount
                          ? ` · ${viewerVersion.pageCount} páginas`
                          : " · total de páginas por verificar"
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
              className="mt-4 h-[15rem] w-full rounded-lg border border-avend-border bg-white md:h-[18rem]"
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

            <section className="rounded-xl border border-avend-border bg-avend-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold">Datos documentales</h2>
                  <p className="mt-1 text-base text-avend-text-muted">
                    Información principal y clasificación del documento.
                  </p>
                </div>
                <DocumentEditDataButton />
              </div>
              <dl className="mt-4 grid gap-3 text-base sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-lg border border-avend-border bg-avend-surface-muted p-3">
                  <dt className="font-semibold text-avend-text-muted">
                    Título
                  </dt>
                  <dd>{document.title}</dd>
                </div>
                <div className="rounded-lg border border-avend-border bg-avend-surface-muted p-3">
                  <dt className="font-semibold text-avend-text-muted">Año</dt>
                  <dd>{document.issuanceYear ?? "No registrado"}</dd>
                </div>
                <div className="rounded-lg border border-avend-border bg-avend-surface-muted p-3">
                  <dt className="font-semibold text-avend-text-muted">
                    Tipo documental
                  </dt>
                  <dd>
                    {document.documentType === "OTRO"
                      ? document.documentTypeOther
                      : documentTypeLabel(document.documentType)}
                  </dd>
                </div>
                <div className="rounded-lg border border-avend-border bg-avend-surface-muted p-3">
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
                <div className="rounded-lg border border-avend-border bg-avend-surface-muted p-3">
                  <dt className="font-semibold text-avend-text-muted">
                    Dependencia específica
                  </dt>
                  <dd>{document.specificDependency ?? "No registrada"}</dd>
                </div>
                <div className="rounded-lg border border-avend-border bg-avend-surface-muted p-3">
                  <dt className="font-semibold text-avend-text-muted">
                    Detalle / Área / Oficina
                  </dt>
                  <dd>{document.additionalDetail ?? "No registrado"}</dd>
                </div>
                <div className="rounded-lg border border-avend-border bg-avend-surface-muted p-3">
                  <dt className="font-semibold text-avend-text-muted">
                    Número
                  </dt>
                  <dd>{document.resolutionNumber ?? "No registrado"}</dd>
                </div>
                <div className="rounded-lg border border-avend-border bg-avend-surface-muted p-3">
                  <dt className="font-semibold text-avend-text-muted">
                    Referencia
                  </dt>
                  <dd>{document.articleReference ?? "No registrada"}</dd>
                </div>
              </dl>

              <DocumentEditSection id="edit-document" showTrigger={false}>
                <AdminActionForm
                  action={updateDocumentAction}
                  className="grid gap-3 sm:grid-cols-2"
                  rules={{
                    title: [
                      { kind: "required", label: "El título" },
                      { kind: "minLength", label: "El título", min: 2 },
                      { kind: "maxLength", label: "El título", max: 500 },
                    ],
                  }}
                  submitLabel="Guardar cambios"
                >
                  <input name="documentId" type="hidden" value={document.id} />
                  {/* El campo JSON no se muestra, pero se reenvía el metadata
                      vigente para no borrar palabras clave ni otras claves. */}
                  <input
                    name="metadata"
                    type="hidden"
                    value={editableMetadata(document.metadata)}
                  />
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
                  <DocumentEditCancelButton />
                </AdminActionForm>
              </DocumentEditSection>
            </section>
          </div>

          <div className="space-y-4">
            <section className="rounded-xl border border-avend-border bg-avend-surface p-5">
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className="flex flex-none items-center justify-center rounded-lg bg-blue-50 p-2 text-blue-600">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2 2-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2h-2.8v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-2-2 .1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H4v-2.8h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 2-2 .1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V4h2.8v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 2 2-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.2v2.8h-.2a1.7 1.7 0 0 0-1.5 1Z" />
                  </svg>
                </span>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold">Estado técnico</h2>
                  <p className="mt-1 text-base text-avend-text-muted">
                    Define el estado de procesamiento del documento.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <div className="min-w-0 flex-1">
                  {status === "error" ? (
                    <DocumentIngestionRecovery
                      canRetry={currentVersion?.ingestionStatus === "failed"}
                      cause={currentVersion?.ingestionFailureCause}
                      documentId={document.id}
                    />
                  ) : (
                    <DocumentTechnicalStatusForm
                      approvalStatus={document.approvalStatus}
                      approvedVersionId={document.approvedVersionId}
                      currentIngestionStatus={currentVersion?.ingestionStatus}
                      documentId={document.id}
                    />
                  )}
                </div>
                <div className="shrink-0" id="delete-document">
                  <DeleteDisclosure
                    description={
                      <p>
                        La eliminación es lógica: el documento sale de la gestión
                        habitual, pero se conservan el PDF, sus versiones y el
                        historial.
                      </p>
                    }
                    size="compact"
                    title="¿Eliminar este documento?"
                    triggerLabel="Eliminar documento"
                  >
                    <AdminActionForm
                      action={deleteDocumentAction}
                      className="space-y-3"
                      submitLabel="Sí, eliminar documento"
                      tone="danger"
                      rules={{
                        reason: [
                          { kind: "required", label: "El motivo" },
                          { kind: "minLength", label: "El motivo", min: 2 },
                        ],
                      }}
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
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-avend-border bg-avend-surface p-5" id="document-lifecycle">
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className="flex flex-none items-center justify-center rounded-lg bg-blue-50 p-2 text-blue-600">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                    <path d="M4 7.5h16v12H4zM8 7.5V5h8v2.5M4 12h16" />
                  </svg>
                </span>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold">Gestión documental</h2>
                  <p className="mt-1 text-base text-avend-text-muted">
                    Cambia la vigencia o archiva el documento. Se conserva el
                    historial con el motivo de cada cambio.
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <DocumentSituationActions
                  documentId={document.id}
                  embedded
                  replacementCandidates={replacementCandidates}
                  situation={document.situation}
                />
              </div>
            </section>

            <section className="rounded-xl border border-avend-border bg-avend-surface p-5" id="new-version">
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className="flex flex-none items-center justify-center rounded-lg bg-blue-50 p-2 text-blue-600">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                    <path d="M12 4 4 8l8 4 8-4zM4 12l8 4 8-4M4 16l8 4 8-4" />
                  </svg>
                </span>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold">Nueva versión</h2>
                  <p className="mt-1 text-base text-avend-text-muted">
                    Sube una nueva versión del documento. La anterior se conserva
                    en el historial.
                  </p>
                </div>
              </div>
              <div className="mt-4">
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
                  <label className="block" htmlFor="detail-version-year">
                    <span className="text-base font-semibold avend-field-label--required">
                      Año del documento
                    </span>
                    <input
                      className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
                      defaultValue={
                        currentVersion?.issuanceYear ??
                        document.issuanceYear ??
                        ""
                      }
                      id="detail-version-year"
                      max={2100}
                      min={1900}
                      name="issuanceYear"
                      required
                      type="number"
                    />
                  </label>
                  <label className="block" htmlFor="detail-version-relation">
                    <span className="text-base font-semibold avend-field-label--required">
                      Relación con la versión anterior
                    </span>
                    <select
                      className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
                      defaultValue="complements"
                      id="detail-version-relation"
                      name="versionRelation"
                      required
                    >
                      <option value="complements">
                        Complementa (aporta información adicional)
                      </option>
                      <option value="replaces">
                        Reemplaza (sustituye a la versión anterior)
                      </option>
                    </select>
                  </label>
                </DocumentPdfUploadForm>
              </div>
            </section>

            <section className="rounded-xl border border-avend-border bg-avend-surface p-5">
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className="flex flex-none items-center justify-center rounded-lg bg-blue-50 p-2 text-blue-600">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                    <path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1" />
                  </svg>
                </span>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold">Módulos y submódulos</h2>
                  <p className="mt-1 text-base text-avend-text-muted">
                    Gestiona la asociación del documento con un módulo y
                    submódulo.
                  </p>
                </div>
              </div>
              <div className="mt-4">
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
                                  El documento dejará de estar en este módulo.
                                  El PDF y sus demás asociaciones se conservan.
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
                    Sin asociaciones. Corrige el registro agregando una
                    ubicación.
                  </p>
                )}
                {validAssociationTargets.length ? (
                  <AdminActionForm
                    action={linkDocumentModuleAction}
                    className="mt-4 space-y-3"
                    submitLabel="Agregar asociación"
                    rules={{
                      moduleId: [{ kind: "required", label: "La ubicación" }],
                    }}
                  >
                    <input
                      name="documentId"
                      type="hidden"
                      value={document.id}
                    />
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
              </div>
            </section>
          </div>
        </div>
      </div>
    </AdminPage>
  );
}

function HistoryModal({
  document,
  modules,
  replacementDocument,
}: {
  document: ManagedDocumentDetails;
  modules: ManagedModuleSummary[];
  replacementDocument: { id: string; title: string } | null;
}) {
  return (
    <DocumentHistoryDialog documentTitle={document.title}>
      <div className="space-y-6">
        <section id="version-history">
          <h3 className="text-xl font-bold">Historial de versiones</h3>
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
                        <h4 className="text-base font-bold">
                          Versión {version.versionNumber} ·{" "}
                          {version.originalFileName}
                        </h4>
                        <p className="mt-1 text-base text-avend-text-muted">
                          {isPdfVersion(version)
                            ? version.pageCount
                              ? `${version.pageCount} páginas · `
                              : "Total de páginas por verificar · "
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
                      <div>
                        <dt className="font-semibold text-avend-text-muted">
                          Año del documento
                        </dt>
                        <dd>{version.issuanceYear ?? "No registrado"}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-avend-text-muted">
                          Relación con la versión anterior
                        </dt>
                        <dd>
                          {version.versionRelation === "replaces"
                            ? "Reemplaza a la versión anterior"
                            : version.versionRelation === "complements"
                              ? "Complementa la versión anterior"
                              : "No registrada"}
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
                        href={accessHref(document.id, "attachment", version.id)}
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

        <section className="border-t border-avend-border pt-6">
          <h3 className="text-xl font-bold">Uso del documento</h3>
          <p className="mt-1 text-base text-avend-text-muted">
            Veces abierto y descargado desde la plataforma, y la última descarga
            registrada.
          </p>
          <dl className="mt-4 grid gap-4 text-base sm:grid-cols-3">
            <div>
              <dt className="font-semibold">Veces abierto</dt>
              <dd className="mt-1">{document.usage?.opens ?? 0}</dd>
            </div>
            <div>
              <dt className="font-semibold">Veces descargado</dt>
              <dd className="mt-1">{document.usage?.downloads ?? 0}</dd>
            </div>
            <div>
              <dt className="font-semibold">Última descarga</dt>
              <dd className="mt-1">
                {document.usage?.lastDownloadAt
                  ? dateTimeFormatter.format(
                      new Date(document.usage.lastDownloadAt),
                    )
                  : "Aún sin descargas"}
              </dd>
            </div>
          </dl>
        </section>

        <div className="border-t border-avend-border pt-6">
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
      </div>
    </DocumentHistoryDialog>
  );
}
