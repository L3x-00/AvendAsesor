"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ChatSources } from "@/components/chat/chat-sources";
import { useToast } from "@/components/ui/toast";
import { ValidatedForm } from "@/components/ui/validated-form";
import {
  ORIENTATION_DISCLAIMER,
  ORIENTATION_FIELD_LIMITS,
  formatOrientationDate,
  sanitizePresentationText,
  type OrientationContext,
} from "@/lib/orientation-document/model";
import type { FieldRules } from "@/lib/ui/field-validation";
import styles from "./orientation-preview.module.css";

type DownloadFormat = "docx" | "pdf";

const PRESENTATION_RULES: FieldRules = {
  teacherName: [{ kind: "maxLength", label: "El nombre del docente", max: ORIENTATION_FIELD_LIMITS.teacherName }],
  institution: [{ kind: "maxLength", label: "La institución educativa", max: ORIENTATION_FIELD_LIMITS.institution }],
  caseTitle: [{ kind: "maxLength", label: "El título del caso", max: ORIENTATION_FIELD_LIMITS.caseTitle }],
  caseNotes: [{ kind: "maxLength", label: "Las notas del caso", max: ORIENTATION_FIELD_LIMITS.caseNotes }],
};

interface OrientationPreviewProps {
  context: OrientationContext;
  initialTeacherName: string;
}

function downloadError(status: number): string {
  if (status === 401) return "Tu sesión expiró. Inicia sesión nuevamente.";
  if (status === 403) return "No tienes permiso para generar esta ficha.";
  if (status === 404)
    return "Esta orientación ya no está disponible. Regresa a la conversación y vuelve a intentarlo.";
  if (status === 400)
    return "Revisa la longitud y el contenido de los datos opcionales.";
  return "No fue posible preparar el archivo. Inténtalo nuevamente.";
}

function responseFileName(response: Response, format: DownloadFormat): string {
  const disposition = response.headers.get("content-disposition") ?? "";
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];

  if (encoded) {
    try {
      const decoded = decodeURIComponent(encoded).replace(/[\\/]/g, "-");
      if (decoded) return decoded;
    } catch {
      // Fall through to the deterministic local name.
    }
  }

  return `ficha-orientacion-avend.${format}`;
}

export function OrientationPreview({
  context,
  initialTeacherName,
}: OrientationPreviewProps) {
  const { showToast } = useToast();
  const downloadInFlight = useRef(false);
  const [teacherName, setTeacherName] = useState(
    sanitizePresentationText(initialTeacherName).slice(
      0,
      ORIENTATION_FIELD_LIMITS.teacherName,
    ),
  );
  const [institution, setInstitution] = useState("");
  const [caseTitle, setCaseTitle] = useState(
    sanitizePresentationText(
      context.conversationTitle ?? "Ficha de orientación AVEND",
    ).slice(0, ORIENTATION_FIELD_LIMITS.caseTitle),
  );
  const [caseNotes, setCaseNotes] = useState("");
  const [downloading, setDownloading] = useState<DownloadFormat | null>(null);
  const [feedback, setFeedback] = useState<{
    kind: "error" | "success";
    message: string;
  } | null>(null);
  const previewTeacherName = sanitizePresentationText(teacherName);
  const previewInstitution = sanitizePresentationText(institution);
  const previewTitle = sanitizePresentationText(caseTitle);
  const previewNotes = sanitizePresentationText(caseNotes, true);

  async function download(formData: FormData) {
    if (downloadInFlight.current) return;
    downloadInFlight.current = true;
    const format: DownloadFormat = formData.get("format") === "pdf" ? "pdf" : "docx";
    formData.delete("format");

    setDownloading(format);
    setFeedback(null);

    try {
      const response = await fetch(
        `/api/chat/conversations/${encodeURIComponent(context.conversationId)}/messages/${encodeURIComponent(context.messageId)}/orientacion/${format}`,
        {
          body: formData,
          credentials: "same-origin",
          method: "POST",
        },
      );

      if (!response.ok) {
        setFeedback({ kind: "error", message: downloadError(response.status) });
        return;
      }

      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = responseFileName(response, format);
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      const message = `La descarga ${format.toUpperCase()} está lista.`;
      setFeedback({ kind: "success", message });
      showToast(message);
    } catch {
      setFeedback({
        kind: "error",
        message:
          "Se interrumpió la descarga. Revisa tu conexión e inténtalo nuevamente.",
      });
    } finally {
      downloadInFlight.current = false;
      setDownloading(null);
    }
  }

  return (
    <section aria-labelledby="orientation-title" className={styles.page}>
      <header className={styles.header}>
        <p className="avend-eyebrow">Documento orientativo</p>
        <h1 id="orientation-title">Ficha de orientación AVEND</h1>
        <p>
          Revisa la orientación y completa únicamente los datos de presentación
          que desees incluir antes de descargar.
        </p>
      </header>

      <aside className={styles.disclaimer} role="note">
        <strong>Alcance del documento:</strong> {ORIENTATION_DISCLAIMER}
      </aside>

      <div className={styles.layout}>
        <ValidatedForm
          aria-busy={downloading !== null}
          className={`${styles.form} avend-form-surface`}
          onValidSubmit={(formData) => void download(formData)}
          rules={PRESENTATION_RULES}
        >
          <div>
            <h2>Datos opcionales</h2>
            <p>
              No se modifica la consulta, la respuesta ni sus fuentes. Esos
              datos se recuperan de la conversación autenticada.
            </p>
          </div>

          <label htmlFor="orientation-teacher-name">
            Nombre del docente
            <input
              autoComplete="name"
              id="orientation-teacher-name"
              maxLength={ORIENTATION_FIELD_LIMITS.teacherName}
              name="teacherName"
              onChange={(event) => setTeacherName(event.target.value)}
              placeholder="Ejemplo: María Pérez"
              value={teacherName}
            />
          </label>

          <label htmlFor="orientation-institution">
            Institución educativa
            <input
              autoComplete="organization"
              id="orientation-institution"
              maxLength={ORIENTATION_FIELD_LIMITS.institution}
              name="institution"
              onChange={(event) => setInstitution(event.target.value)}
              placeholder="Nombre de la institución"
              value={institution}
            />
          </label>

          <label htmlFor="orientation-case-title">
            Título del caso
            <input
              id="orientation-case-title"
              maxLength={ORIENTATION_FIELD_LIMITS.caseTitle}
              name="caseTitle"
              onChange={(event) => setCaseTitle(event.target.value)}
              placeholder="Ficha de orientación AVEND"
              value={caseTitle}
            />
          </label>

          <label htmlFor="orientation-case-notes">
            Notas del caso
            <textarea
              aria-describedby="orientation-notes-help"
              id="orientation-case-notes"
              maxLength={ORIENTATION_FIELD_LIMITS.caseNotes}
              name="caseNotes"
              onChange={(event) => setCaseNotes(event.target.value)}
              placeholder="Añade solo información necesaria para presentar la ficha."
              rows={6}
              value={caseNotes}
            />
          </label>
          <p className={styles.help} id="orientation-notes-help">
            Evita incluir datos personales sensibles que no sean necesarios.
          </p>

          <div className={styles.actions}>
            <button
              className="avend-button avend-button--primary"
              disabled={downloading !== null}
              name="format"
              type="submit"
              value="docx"
            >
              {downloading === "docx" ? "Preparando DOCX…" : "Descargar DOCX"}
            </button>
            <button
              className="avend-button avend-button--secondary"
              disabled={downloading !== null}
              name="format"
              type="submit"
              value="pdf"
            >
              {downloading === "pdf" ? "Preparando PDF…" : "Descargar PDF"}
            </button>
          </div>

          <div className={styles.feedback}>
            {feedback ? (
              <p
                className={`avend-feedback avend-feedback--${feedback.kind}`}
                role={feedback.kind === "error" ? "alert" : "status"}
              >
                {feedback.kind === "success" ? (
                  <svg aria-hidden="true" className={styles.feedbackIcon} fill="none" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="9" />
                    <path d="m8 12.5 2.5 2.5L16 9.5" />
                  </svg>
                ) : null}
                {feedback.message}
              </p>
            ) : null}
          </div>

          <Link
            className={styles.backLink}
            href={`/chat/${encodeURIComponent(context.conversationId)}`}
          >
            Volver a la conversación
          </Link>
        </ValidatedForm>

        <article
          aria-label="Vista previa de la ficha"
          className={styles.preview}
        >
          <div className={styles.previewBrand}>AVEND ASESOR</div>
          <p className={styles.previewType}>Ficha de orientación AVEND</p>
          <h2>{previewTitle || "Ficha de orientación AVEND"}</h2>
          <p className={styles.previewDisclaimer}>{ORIENTATION_DISCLAIMER}</p>

          <dl className={styles.identity}>
            {previewTeacherName ? (
              <div>
                <dt>Docente</dt>
                <dd>{previewTeacherName}</dd>
              </div>
            ) : null}
            {previewInstitution ? (
              <div>
                <dt>Institución</dt>
                <dd>{previewInstitution}</dd>
              </div>
            ) : null}
            <div>
              <dt>Fecha de respuesta</dt>
              <dd>{formatOrientationDate(context.answeredAt)}</dd>
            </div>
          </dl>

          <section className={styles.previewSection}>
            <h3>Consulta</h3>
            <p>{context.question}</p>
          </section>
          <section className={styles.previewSection}>
            <h3>Orientación recibida</h3>
            <p>{context.answer}</p>
          </section>
          {previewNotes ? (
            <section className={styles.previewSection}>
              <h3>Notas del caso</h3>
              <p>{previewNotes}</p>
            </section>
          ) : null}

          <ChatSources defaultOpen sources={context.sources} />
        </article>
      </div>
    </section>
  );
}
