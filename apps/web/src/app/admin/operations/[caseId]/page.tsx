import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminActionForm } from "@/components/admin/admin-action-form";
import { ConsultationRouteFields } from "@/components/admin/consultation-route-fields";
import { AdminPage } from "@/components/admin/admin-page";
import styles from "@/components/admin/consultation-reports.module.css";
import { createAuthorizedAdminApiContext } from "@/lib/admin-api/authorized-client";
import type {
  ManagedDocument,
  ManagedModuleSummary,
} from "@/lib/admin-api/types";
import { createAuthorizedConsultationReportsApiContext } from "@/lib/consultation-reports-api/authorized-client";
import { ConsultationReportsApiError } from "@/lib/consultation-reports-api/client";
import {
  decideConsultationAttachmentAction,
  linkConsultationCaseDocumentAction,
  updateConsultationCaseAction,
} from "../consultation-actions";

const statusLabels = {
  pending: "Pendiente",
  in_review: "En revisión",
  resolved: "Resuelto",
  discarded: "Descartado",
} as const;

const reportReasonLabels = {
  answer_not_relevant: "La respuesta no corresponde a la consulta",
  information_outdated: "La información parece desactualizada",
  citation_does_not_support: "La referencia no sustenta la respuesta",
  missing_information: "Falta información importante",
  answer_unclear: "La respuesta no es clara",
  other: "Otro",
} as const;

const eventLabels: Record<string, string> = {
  attachment_accessed: "Adjunto abierto o descargado",
  attachment_decided: "Decisión sobre adjunto",
  case_created: "Caso creado",
  document_linked: "Documento relacionado",
  document_unlinked: "Documento desvinculado",
  legacy_review_imported: "Revisión histórica importada",
  note_added: "Nota agregada",
  routing_corrected: "Ruta corregida",
  status_changed: "Estado actualizado",
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Lima",
  }).format(new Date(value));
}

function formatSituation(value: "archived" | "current" | "replaced"): string {
  if (value === "current") return "Vigente";
  if (value === "replaced") return "Reemplazado / sin vigencia · Histórico";
  return "Archivado · Antecedente histórico";
}

function metadataText(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function eventDescription(event: {
  eventType: string;
  metadata: Record<string, unknown>;
}): string | null {
  if (event.eventType === "status_changed") {
    const status = metadataText(event.metadata, "status");
    return status && status in statusLabels
      ? `Nuevo estado: ${statusLabels[status as keyof typeof statusLabels]}`
      : null;
  }
  if (event.eventType === "attachment_decided") {
    const disposition = metadataText(event.metadata, "disposition");
    return disposition === "incorporated"
      ? "El archivo fue incorporado al documento relacionado."
      : disposition === "not_incorporated"
        ? "Se decidió no incorporar el archivo."
        : null;
  }
  if (event.eventType === "note_added" && metadataText(event.metadata, "attachmentId")) {
    return "El archivo adjunto quedó disponible para revisión.";
  }
  return null;
}

export default async function ConsultationCasePage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const { access, client: reportsClient } =
    await createAuthorizedConsultationReportsApiContext();
  let detail;
  try {
    detail = await reportsClient.getCase(caseId);
  } catch (error) {
    if (error instanceof ConsultationReportsApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  const caseData = detail.case;
  let modules: ManagedModuleSummary[] = [];
  let documents: ManagedDocument[] = [];
  if (access.modulesAccess) {
    const { client } = await createAuthorizedAdminApiContext({
      requireModulesAccess: true,
    });
    [modules, documents] = await Promise.all([
      client.listModuleSummaries("active"),
      client.listDocuments("all"),
    ]);
  }
  const roots = modules.filter((module) => module.parentModuleId === null);
  const submodules = modules.filter((module) => module.parentModuleId !== null);

  return (
    <AdminPage
      description="Revisa el caso con sus fuentes y conserva cada decisión en el historial operativo."
      title="Detalle de caso"
    >
      <main className={styles.page}>
        <Link className={styles.backLink} href="/admin/operations">
          ‹ Volver a Consultas y reportes
        </Link>
        <section className={styles.section} aria-labelledby="case-detail-title">
          <div className={styles.sectionHeader}>
            <div>
              <h2 id="case-detail-title">
                Caso de{" "}
                {caseData.kind === "teacher_suggestion"
                  ? "sugerencia"
                  : "consulta"}
              </h2>
              <p>
                Creado {formatDate(caseData.createdAt)} · última actualización{" "}
                {formatDate(caseData.updatedAt)}
              </p>
            </div>
            <span className={styles.badge} data-status={caseData.status}>
              {statusLabels[caseData.status]}
            </span>
          </div>
          <div className={styles.detailGrid}>
            <section className={styles.detailBlock}>
              <h3>Consulta original</h3>
              <p className={styles.caseText}>
                {caseData.questionSnapshot ??
                  "No hay una consulta asociada a esta sugerencia."}
              </p>
            </section>
            <section className={styles.detailBlock}>
              <h3>Respuesta original</h3>
              <p className={styles.caseText}>
                {caseData.answerSnapshot ??
                  "No hay una respuesta asociada a esta sugerencia."}
              </p>
            </section>
            <section className={styles.detailBlock}>
              <h3>Contexto y ruta</h3>
              <p className={styles.caseText}>
                Solicitado: {caseData.requestedModuleName ?? "Chat general"}
                {"\n"}Detectado:{" "}
                {caseData.detectedModuleName ?? "Sin detección"}
                {caseData.detectedSubmoduleName
                  ? ` › ${caseData.detectedSubmoduleName}`
                  : ""}
                {"\n"}Alcance:{" "}
                {caseData.retrievalScope === "historical"
                  ? "Histórico solicitado"
                  : caseData.retrievalScope === "archived_explicit"
                    ? "Archivado solicitado expresamente"
                    : "Situación actual"}
              </p>
            </section>
            <section className={styles.detailBlock}>
              <h3>Motivo y comentario</h3>
              <p className={styles.caseText}>
                {caseData.reportReason
                  ? reportReasonLabels[caseData.reportReason]
                  : "Control automático o sugerencia"}
                {caseData.reporterComment
                  ? `\n${caseData.reporterComment}`
                  : ""}
                {caseData.reviewExcerpt ? `\n${caseData.reviewExcerpt}` : ""}
              </p>
            </section>
          </div>
          {!caseData.snapshotComplete ? (
            <p className={styles.empty} role="status">
              El contexto histórico de este caso no está completo. Verifica la
              ruta y las fuentes antes de tomar una decisión.
            </p>
          ) : null}
        </section>

        <section className={styles.section} aria-labelledby="case-action-title">
          <h2 className={styles.detailTitle} id="case-action-title">
            Gestionar caso
          </h2>
          <p className={styles.description}>
            Cambia el estado, agrega una nota o corrige la ruta. Las notas nunca
            reemplazan el historial previo.
          </p>
          <AdminActionForm
            action={updateConsultationCaseAction}
            className={styles.compactForm}
            submitLabel="Guardar cambios"
          >
            <input name="caseId" type="hidden" value={caseId} />
            <div className={styles.formGrid}>
              <label htmlFor="case-status-change">
                Estado
                <select defaultValue="" id="case-status-change" name="status">
                  <option value="">Conservar estado actual</option>
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor="case-note">
                Nota de revisión
                <textarea
                  id="case-note"
                  maxLength={2000}
                  name="note"
                  rows={3}
                />
              </label>
            </div>
            {access.modulesAccess ? (
              <details>
                <summary>Corregir ruta de módulo o submódulo</summary>
                <label className={styles.meta}>
                  <input name="changeRouting" type="checkbox" value="true" />
                  Guardar la corrección de ruta mostrada abajo
                </label>
                <ConsultationRouteFields
                  initialModuleId={caseData.detectedModuleId}
                  initialSubmoduleId={caseData.detectedSubmoduleId}
                  roots={roots}
                  submodules={submodules}
                />
              </details>
            ) : null}
          </AdminActionForm>
        </section>

        <section
          className={styles.section}
          aria-labelledby="case-sources-title"
        >
          <h2 className={styles.detailTitle} id="case-sources-title">
            Fuentes utilizadas
          </h2>
          {detail.sources.length === 0 ? (
            <p className={styles.empty}>
              Este caso no tiene fuentes persistidas. Se conserva para controlar
              una ausencia de sustento, ambigüedad, error técnico o sugerencia.
            </p>
          ) : (
            <ol className={styles.sourceList}>
              {detail.sources.map((source) => (
                <li className={styles.source} key={source.id}>
                  <h3>
                    [{source.sourceRank}] {source.documentTitle}
                  </h3>
                  <p className={styles.meta}>
                    {formatSituation(source.documentSituation)} · versión{" "}
                    {source.versionNumber} · página {source.pageStart}
                    {source.pageEnd === source.pageStart
                      ? ""
                      : `–${source.pageEnd}`}
                  </p>
                  <p className={styles.caseText}>
                    Sección: {source.sectionTitle ?? "No especificada"} ·
                    Artículo: {source.articleReference ?? "No especificado"} ·
                    Numeral: {source.numeralReference ?? "No especificado"}
                  </p>
                  {source.evidenceExcerpt ? (
                    <p className={styles.caseText}>{source.evidenceExcerpt}</p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </section>

        <section
          className={styles.section}
          aria-labelledby="case-documents-title"
        >
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.detailTitle} id="case-documents-title">
                Documentos relacionados
              </h2>
              <p>
                Vincula un documento existente. Para cargar uno nuevo, usa
                siempre el flujo Módulos → Módulo → Submódulo → Agregar
                documento.
              </p>
            </div>
            {access.modulesAccess ? (
              <Link
                className="avend-button avend-button--secondary"
                href="/admin/modules"
              >
                Agregar nuevo documento en Módulos
              </Link>
            ) : null}
          </div>
          {detail.linkedDocuments.length ? (
            <ul className={styles.documentList}>
              {detail.linkedDocuments.map((document) => (
                <li className={styles.badge} key={document.id}>
                  {document.title} · {formatSituation(document.situation)}
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>Aún no hay documentos vinculados.</p>
          )}
          {access.modulesAccess ? (
            <AdminActionForm
              action={linkConsultationCaseDocumentAction}
              className={styles.compactForm}
              submitLabel="Vincular documento"
            >
              <input name="caseId" type="hidden" value={caseId} />
              <label htmlFor="case-document-link">
                Documento existente
                <select id="case-document-link" name="documentId" required>
                  <option value="">Selecciona un documento</option>
                  {documents
                    .filter((document) => !document.isDeleted)
                    .map((document) => (
                      <option key={document.id} value={document.id}>
                        {document.title}
                      </option>
                    ))}
                </select>
              </label>
            </AdminActionForm>
          ) : null}
        </section>

        <section
          className={styles.section}
          aria-labelledby="case-attachments-title"
        >
          <h2 className={styles.detailTitle} id="case-attachments-title">
            Adjuntos del docente
          </h2>
          {detail.attachments.length === 0 ? (
            <p className={styles.empty}>No hay adjuntos para este caso.</p>
          ) : (
            <ul className={styles.attachmentList}>
              {detail.attachments.map((attachment) => (
                <li className={styles.attachment} key={attachment.id}>
                  <h3>{attachment.originalFileName}</h3>
                  <p className={styles.meta}>
                    {attachment.mimeType} ·{" "}
                    {Math.ceil(attachment.fileSizeBytes / 1024)} KB ·{" "}
                    {attachment.disposition === "incorporated"
                      ? "Incorporado"
                      : attachment.disposition === "not_incorporated"
                        ? "No incorporado"
                        : "Pendiente de revisión"}
                  </p>
                  <div className={styles.detailActions}>
                    <Link
                      className={styles.caseLink}
                      href={`/api/admin/consultation-cases/${caseId}/attachments/${attachment.id}/download?mode=view`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Abrir adjunto
                    </Link>
                    <Link
                      className={styles.caseLink}
                      href={`/api/admin/consultation-cases/${caseId}/attachments/${attachment.id}/download?mode=download`}
                    >
                      Descargar adjunto
                    </Link>
                  </div>
                  {access.modulesAccess ? (
                    <AdminActionForm
                      action={decideConsultationAttachmentAction}
                      className={styles.compactForm}
                      submitLabel="Registrar decisión"
                    >
                      <input name="caseId" type="hidden" value={caseId} />
                      <input
                        name="attachmentId"
                        type="hidden"
                        value={attachment.id}
                      />
                      <div className={styles.formGrid}>
                        {attachment.attachmentKind === "suggestion_file" ? (
                          <>
                            <label>
                              Decisión
                              <select
                                defaultValue="not_incorporated"
                                name="disposition"
                              >
                                <option value="not_incorporated">
                                  No incorporar
                                </option>
                                <option value="incorporated">
                                  Incorporar al documento vinculado
                                </option>
                              </select>
                            </label>
                            <label>
                              Documento vinculado (requerido al incorporar)
                              <select defaultValue="" name="documentId">
                                <option value="">
                                  Selecciona un documento vinculado
                                </option>
                                {detail.linkedDocuments.map((document) => (
                                  <option key={document.id} value={document.id}>
                                    {document.title}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </>
                        ) : (
                          <>
                            <input
                              name="disposition"
                              type="hidden"
                              value="not_incorporated"
                            />
                            <p className={styles.meta}>
                              La imagen del reporte se conserva para revisión y
                              no se incorpora automáticamente a la biblioteca.
                            </p>
                          </>
                        )}
                        <label>
                          Nota{" "}
                          <textarea maxLength={2000} name="note" rows={2} />
                        </label>
                      </div>
                    </AdminActionForm>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          className={styles.section}
          aria-labelledby="case-history-title"
        >
          <h2 className={styles.detailTitle} id="case-history-title">
            Historial del caso
          </h2>
          {detail.events.length === 0 ? (
            <p className={styles.empty}>Todavía no hay eventos registrados.</p>
          ) : (
            <ol className={styles.eventList}>
              {detail.events.map((event) => (
                <li className={styles.event} key={event.id}>
                  <h3>{eventLabels[event.eventType] ?? "Actualización del caso"}</h3>
                  <p className={styles.meta}>
                    {formatDate(event.createdAt)}
                    {event.actorName ? ` · ${event.actorName}` : ""}
                  </p>
                  {eventDescription(event) ? (
                    <p className={styles.historyText}>{eventDescription(event)}</p>
                  ) : null}
                  {event.note ? (
                    <p className={styles.historyText}>{event.note}</p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>
    </AdminPage>
  );
}
