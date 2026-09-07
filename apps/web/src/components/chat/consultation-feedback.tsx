"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { FormField } from "@/components/ui/form-field";
import { useToast } from "@/components/ui/toast";
import { ValidatedForm } from "@/components/ui/validated-form";
import type { FieldRules } from "@/lib/ui/field-validation";
import styles from "./consultation-feedback.module.css";

const reportReasons = [
  {
    label: "La respuesta no corresponde a mi consulta",
    value: "answer_not_relevant",
  },
  {
    label: "La información parece desactualizada",
    value: "information_outdated",
  },
  {
    label: "La referencia no sustenta la respuesta",
    value: "citation_does_not_support",
  },
  { label: "Falta información importante", value: "missing_information" },
  { label: "La respuesta no es clara", value: "answer_unclear" },
  { label: "Otro", value: "other" },
] as const;

type FeedbackDialog = "report" | "suggestion" | null;

/** 10 MB es el máximo que acepta el endpoint; decirlo antes ahorra la subida. */
const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

const REPORT_RULES: FieldRules = {
  file: [
    {
      accept: [".jpg", ".jpeg", ".png", ".webp"],
      kind: "file",
      label: "La captura",
      maxBytes: ATTACHMENT_MAX_BYTES,
    },
  ],
  reason: [{ kind: "required", label: "El motivo del reporte" }],
};

const SUGGESTION_RULES: FieldRules = {
  comment: [{ kind: "required", label: "La sugerencia" }],
  file: [
    {
      accept: [".jpg", ".jpeg", ".png", ".webp", ".pdf", ".doc", ".docx"],
      kind: "file",
      label: "El archivo",
      maxBytes: ATTACHMENT_MAX_BYTES,
    },
  ],
};

interface ConsultationFeedbackProps {
  answerMessageId?: string;
  conversationId?: string;
  disabled?: boolean;
}

function submissionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function requestMessage(response: Response): Promise<string> {
  if (response.status === 401)
    return "Tu sesión expiró. Inicia sesión nuevamente.";
  if (response.status === 403)
    return "No tienes permiso para enviar este comentario.";
  if (response.status === 413)
    return "El archivo supera el tamaño máximo permitido de 10 MB.";
  if (response.status === 429)
    return "Enviaste comentarios muy rápido. Espera un minuto.";
  if (response.status === 503)
    return "No se pudo guardar el comentario por el momento.";
  return "Revisa los datos o el archivo e inténtalo nuevamente.";
}

/**
 * The feedback controls deliberately post only a canonical answer id or the
 * active conversation id. The server reconstructs question, answer, sources
 * and route; a browser never gets to submit those sensitive fields itself.
 */
export function ConsultationFeedback({
  answerMessageId,
  conversationId,
  disabled = false,
}: ConsultationFeedbackProps) {
  const [dialog, setDialog] = useState<FeedbackDialog>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const { showToast } = useToast();
  const dialogRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const reportSubmissionIdRef = useRef<string | null>(null);
  const suggestionSubmissionIdRef = useRef<string | null>(null);
  const reportTitleId = useId();
  const suggestionTitleId = useId();

  const closeDialog = useCallback(() => {
    setDialog(null);
    window.setTimeout(() => openerRef.current?.focus(), 0);
  }, []);

  function open(
    nextDialog: Exclude<FeedbackDialog, null>,
    opener: HTMLButtonElement,
  ) {
    setMessage(null);
    setIsError(false);
    openerRef.current = opener;
    if (nextDialog === "report") {
      reportSubmissionIdRef.current = submissionId();
    } else {
      suggestionSubmissionIdRef.current = submissionId();
    }
    setDialog(nextDialog);
  }

  useEffect(() => {
    if (!dialog) return;

    const target = dialogRef.current;
    if (!target) return;
    const focusable = () =>
      [...target.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
      )].filter((element) => !element.hasAttribute("hidden"));
    focusable()[0]?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSubmitting) {
        event.preventDefault();
        closeDialog();
        return;
      }
      if (event.key !== "Tab") return;

      const elements = focusable();
      const first = elements[0];
      const last = elements.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeDialog, dialog, isSubmitting]);

  async function submitReport(data: FormData, form: HTMLFormElement) {
    if (!answerMessageId || isSubmitting) return;

    data.set("answerMessageId", answerMessageId);
    data.set("submissionId", reportSubmissionIdRef.current ?? submissionId());
    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/consultation-feedback/reports", {
        body: data,
        method: "POST",
      });
      if (!response.ok) {
        setIsError(true);
        setMessage(await requestMessage(response));
        return;
      }
      form.reset();
      reportSubmissionIdRef.current = null;
      setIsError(false);
      setMessage("Gracias. Tu reporte fue enviado para revisión.");
      showToast("Gracias. Tu reporte fue enviado para revisión.");
      closeDialog();
    } catch {
      setIsError(true);
      setMessage(
        "No se pudo enviar el reporte. Conservamos tus datos para que lo intentes nuevamente.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitSuggestion(data: FormData, form: HTMLFormElement) {
    if (isSubmitting) return;

    if (conversationId) data.set("conversationId", conversationId);
    data.set(
      "submissionId",
      suggestionSubmissionIdRef.current ?? submissionId(),
    );
    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/consultation-feedback/suggestions", {
        body: data,
        method: "POST",
      });
      if (!response.ok) {
        setIsError(true);
        setMessage(await requestMessage(response));
        return;
      }
      form.reset();
      suggestionSubmissionIdRef.current = null;
      setIsError(false);
      setMessage(
        "Gracias por tu sugerencia. La tendremos en cuenta para seguir mejorando AVEND ASESOR.",
      );
      showToast("Gracias por tu sugerencia. Ya la registramos.");
      closeDialog();
    } catch {
      setIsError(true);
      setMessage(
        "No se pudo enviar la sugerencia. Conservamos tus datos para que lo intentes nuevamente.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section aria-label="Reportes y sugerencias" className={styles.feedback}>
      <div>
        <h2>¿La respuesta necesita revisión?</h2>
        <p>
          Reporta la última respuesta o comparte una sugerencia. Tu sugerencia
          no se incorpora automáticamente a las respuestas.
        </p>
      </div>
      <div className={styles.actions}>
        <button
          className="avend-button avend-button--secondary"
          disabled={disabled || !answerMessageId || isSubmitting}
          onClick={(event) => open("report", event.currentTarget)}
          type="button"
        >
          Reportar
        </button>
        <button
          className="avend-button avend-button--secondary"
          disabled={disabled || isSubmitting}
          onClick={(event) => open("suggestion", event.currentTarget)}
          type="button"
        >
          Sugerencia
        </button>
      </div>
      {!answerMessageId ? (
        <p className={styles.hint}>
          Podrás reportar cuando recibas una respuesta del asistente.
        </p>
      ) : null}
      {message ? (
        <p
          className={
            isError
              ? "avend-feedback avend-feedback--error"
              : "avend-feedback avend-feedback--success"
          }
          role={isError ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}

      {dialog === "report" ? (
        <div className={styles.overlay} role="presentation">
          <section
            aria-labelledby={reportTitleId}
            aria-modal="true"
            className={styles.dialog}
            ref={dialogRef}
            role="dialog"
          >
            <div className={styles.dialogHeader}>
              <div>
                <h2 id={reportTitleId}>Reportar respuesta</h2>
                <p>
                  El sistema guardará la consulta, respuesta y fuentes exactas
                  para revisión.
                </p>
              </div>
              <button
                aria-label="Cerrar reporte"
                className={styles.close}
                disabled={isSubmitting}
                onClick={closeDialog}
                type="button"
              >
                ×
              </button>
            </div>
            <ValidatedForm
              className={styles.form}
              onValidSubmit={submitReport}
              rules={REPORT_RULES}
            >
              <FormField label="Motivo del reporte" name="reason" required>
                <select defaultValue="" name="reason" required>
                  <option disabled value="">
                    Selecciona un motivo
                  </option>
                  {reportReasons.map((reason) => (
                    <option key={reason.value} value={reason.value}>
                      {reason.label}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField
                hint="Opcional."
                label="Cuéntanos qué ocurrió"
                name="comment"
              >
                <textarea maxLength={2000} name="comment" rows={4} />
              </FormField>
              <FormField
                hint="Opcional. JPG, PNG o WebP; máximo 10 MB."
                label="Captura o imagen"
                name="file"
              >
                <input
                  accept="image/jpeg,image/png,image/webp"
                  name="file"
                  type="file"
                />
              </FormField>
              <p className={styles.notice}>
                Puedes adjuntar una captura o foto para ayudarnos a revisar el
                problema.
              </p>
              <div className={styles.dialogActions}>
                <button
                  className="avend-button avend-button--secondary"
                  disabled={isSubmitting}
                  onClick={closeDialog}
                  type="button"
                >
                  Cancelar
                </button>
                <button
                  className="avend-button avend-button--primary"
                  disabled={isSubmitting}
                  type="submit"
                >
                  {isSubmitting ? "Enviando…" : "Enviar reporte"}
                </button>
              </div>
            </ValidatedForm>
          </section>
        </div>
      ) : null}

      {dialog === "suggestion" ? (
        <div className={styles.overlay} role="presentation">
          <section
            aria-labelledby={suggestionTitleId}
            aria-modal="true"
            className={styles.dialog}
            ref={dialogRef}
            role="dialog"
          >
            <div className={styles.dialogHeader}>
              <div>
                <h2 id={suggestionTitleId}>Enviar sugerencia</h2>
                <p>
                  Las sugerencias y sus archivos se revisan antes de cualquier
                  incorporación documental.
                </p>
              </div>
              <button
                aria-label="Cerrar sugerencia"
                className={styles.close}
                disabled={isSubmitting}
                onClick={closeDialog}
                type="button"
              >
                ×
              </button>
            </div>
            <ValidatedForm
              className={styles.form}
              onValidSubmit={submitSuggestion}
              rules={SUGGESTION_RULES}
            >
              <FormField label="Sugerencia" name="comment" required>
                <textarea
                  maxLength={2000}
                  minLength={1}
                  name="comment"
                  required
                  rows={5}
                />
              </FormField>
              <FormField
                hint="Opcional. Imagen, PDF o Word; máximo 10 MB."
                label="Adjuntar archivo"
                name="file"
              >
                <input
                  accept="image/jpeg,image/png,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.doc,.docx"
                  name="file"
                  type="file"
                />
              </FormField>
              <p className={styles.notice}>
                ¿Quieres compartir una norma o documento? Puedes adjuntar una
                imagen, PDF o archivo Word. No se usa este contenido para
                responder consultas ni se añade a la biblioteca automáticamente.
              </p>
              <div className={styles.dialogActions}>
                <button
                  className="avend-button avend-button--secondary"
                  disabled={isSubmitting}
                  onClick={closeDialog}
                  type="button"
                >
                  Cancelar
                </button>
                <button
                  className="avend-button avend-button--primary"
                  disabled={isSubmitting}
                  type="submit"
                >
                  {isSubmitting ? "Enviando…" : "Enviar sugerencia"}
                </button>
              </div>
            </ValidatedForm>
          </section>
        </div>
      ) : null}
    </section>
  );
}
