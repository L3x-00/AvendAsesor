"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { FormField } from "@/components/ui/form-field";
import { useToast } from "@/components/ui/toast";
import { ValidatedForm } from "@/components/ui/validated-form";
import type { FieldErrors, FieldRules } from "@/lib/ui/field-validation";
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
  comment: [{ kind: "maxLength", label: "El comentario", max: 2000 }],
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
  comment: [
    { kind: "required", label: "La sugerencia" },
    { kind: "maxLength", label: "La sugerencia", max: 2000 },
  ],
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
  /**
   * Consultas enviadas en la conversación visible. Cuando se indica, la
   * tarjeta aparece recién tras `FEEDBACK_REVEAL_AFTER` consultas y respeta el
   * cierre temporal; sin ella se muestra siempre (uso aislado).
   */
  userMessageCount?: number;
}

/** La invitación a reportar llega tras unas consultas, no desde la primera. */
export const FEEDBACK_REVEAL_AFTER = 3;
/** "Cerrar" la oculta este tiempo en el dispositivo, para no saturar la vista. */
export const FEEDBACK_SNOOZE_MS = 30 * 60 * 1000;
const FEEDBACK_SNOOZE_KEY = "avend-feedback-snoozed-until";

function readSnoozedUntil(): number {
  try {
    return Number(window.localStorage.getItem(FEEDBACK_SNOOZE_KEY)) || 0;
  } catch {
    return 0;
  }
}

/** Respaldo en memoria si el almacenamiento está bloqueado (modo privado). */
let memorySnoozedUntil = 0;
const snoozeListeners = new Set<() => void>();

function readSnoozeSnapshot(): number {
  return Math.max(readSnoozedUntil(), memorySnoozedUntil);
}

/** En el servidor no hay almacenamiento: la tarjeta nace oculta. */
function readServerSnoozeSnapshot(): number {
  return -1;
}

function subscribeToSnooze(listener: () => void): () => void {
  snoozeListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    snoozeListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function writeSnoozedUntil(until: number) {
  memorySnoozedUntil = until;
  try {
    window.localStorage.setItem(FEEDBACK_SNOOZE_KEY, String(until));
  } catch {
    // Sin almacenamiento, el cierre dura mientras la página siga abierta.
  }
  snoozeListeners.forEach((listener) => listener());
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
  userMessageCount,
}: ConsultationFeedbackProps) {
  const [dialog, setDialog] = useState<FeedbackDialog>(null);
  const gated = userMessageCount !== undefined;
  // -1 en el servidor y en la hidratación: la tarjeta nace oculta y no
  // parpadea. Luego refleja el cierre guardado en el dispositivo.
  const snoozedUntil = useSyncExternalStore(
    subscribeToSnooze,
    readSnoozeSnapshot,
    readServerSnoozeSnapshot,
  );
  // Plazo de cierre que ya venció (lo fija un temporizador, no el render).
  const [elapsedSnooze, setElapsedSnooze] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const pendingRef = useRef(false);
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
    setServerErrors({});
    openerRef.current = opener;
    if (nextDialog === "report") {
      reportSubmissionIdRef.current = submissionId();
    } else {
      suggestionSubmissionIdRef.current = submissionId();
    }
    setDialog(nextDialog);
  }

  useEffect(() => {
    if (!gated || snoozedUntil <= 0) return;
    // Pasado el plazo vuelve sola, sin recargar la página.
    const timer = window.setTimeout(
      () => setElapsedSnooze(snoozedUntil),
      Math.max(0, snoozedUntil - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [gated, snoozedUntil]);

  const visible =
    !gated ||
    ((userMessageCount ?? 0) >= FEEDBACK_REVEAL_AFTER &&
      (snoozedUntil === 0 || elapsedSnooze === snoozedUntil));

  function snooze() {
    writeSnoozedUntil(Date.now() + FEEDBACK_SNOOZE_MS);
    setMessage(null);
  }

  useEffect(() => {
    if (!dialog) return;

    const target = dialogRef.current;
    if (!target) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      [...target.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
      )].filter((element) => !element.hasAttribute("hidden"));
    focusable()[0]?.focus();

    function containFocus(event: FocusEvent) {
      if (event.target instanceof Node && !target?.contains(event.target)) {
        focusable()[0]?.focus();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !pendingRef.current) {
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
    document.addEventListener("focusin", containFocus);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", containFocus);
      document.body.style.overflow = previousOverflow;
    };
  }, [closeDialog, dialog]);

  async function submitReport(data: FormData, form: HTMLFormElement) {
    if (!answerMessageId || pendingRef.current) return;

    data.set("answerMessageId", answerMessageId);
    data.set("submissionId", reportSubmissionIdRef.current ?? submissionId());
    pendingRef.current = true;
    setIsSubmitting(true);
    setServerErrors({});
    setMessage(null);

    try {
      const response = await fetch("/api/consultation-feedback/reports", {
        body: data,
        method: "POST",
      });
      if (!response.ok) {
        if (response.status === 413) {
          setServerErrors({ file: await requestMessage(response) });
          return;
        }
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
      pendingRef.current = false;
      setIsSubmitting(false);
    }
  }

  async function submitSuggestion(data: FormData, form: HTMLFormElement) {
    if (pendingRef.current) return;

    if (conversationId) data.set("conversationId", conversationId);
    data.set(
      "submissionId",
      suggestionSubmissionIdRef.current ?? submissionId(),
    );
    pendingRef.current = true;
    setIsSubmitting(true);
    setServerErrors({});
    setMessage(null);

    try {
      const response = await fetch("/api/consultation-feedback/suggestions", {
        body: data,
        method: "POST",
      });
      if (!response.ok) {
        if (response.status === 413) {
          setServerErrors({ file: await requestMessage(response) });
          return;
        }
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
      pendingRef.current = false;
      setIsSubmitting(false);
    }
  }

  // Oculta, la tarjeta no ocupa lugar; un diálogo ya abierto sigue vivo.
  if (!visible && !dialog) return null;

  return (
    <section
      aria-label="Reportes y sugerencias"
      className={`${styles.feedback}${gated ? ` ${styles.feedbackGated}` : ""}`}
    >
      <div className={styles.copy}>
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
      {gated ? (
        <button
          aria-label="Cerrar este aviso por 30 minutos"
          className={styles.dismiss}
          disabled={isSubmitting}
          onClick={snooze}
          title="Se ocultará por 30 minutos"
          type="button"
        >
          <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
            <path d="m7 7 10 10M17 7 7 17" />
          </svg>
          <span>Cerrar</span>
        </button>
      ) : null}
      {!answerMessageId ? (
        <p className={styles.hint}>
          Podrás reportar cuando recibas una respuesta del asistente.
        </p>
      ) : null}
      {message && !dialog ? (
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

      {dialog === "report" ? createPortal(
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
              aria-busy={isSubmitting}
              className={`avend-form-surface ${styles.form}`}
              onValidSubmit={submitReport}
              rules={REPORT_RULES}
              serverErrors={serverErrors}
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
              {message && isError ? (
                <p className="avend-feedback avend-feedback--error" role="alert">
                  {message}
                </p>
              ) : null}
              {isSubmitting ? (
                <p className={styles.hint} role="status">
                  Enviando. Espera mientras guardamos tu comentario.
                </p>
              ) : null}
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
                  aria-disabled={isSubmitting}
                  className="avend-button avend-button--primary"
                  type="submit"
                >
                  {isSubmitting ? "Enviando…" : "Enviar reporte"}
                </button>
              </div>
            </ValidatedForm>
          </section>
        </div>,
        document.body,
      ) : null}

      {dialog === "suggestion" ? createPortal(
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
              aria-busy={isSubmitting}
              className={`avend-form-surface ${styles.form}`}
              onValidSubmit={submitSuggestion}
              rules={SUGGESTION_RULES}
              serverErrors={serverErrors}
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
              {message && isError ? (
                <p className="avend-feedback avend-feedback--error" role="alert">
                  {message}
                </p>
              ) : null}
              {isSubmitting ? (
                <p className={styles.hint} role="status">
                  Enviando. Espera mientras guardamos tu comentario.
                </p>
              ) : null}
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
                  aria-disabled={isSubmitting}
                  className="avend-button avend-button--primary"
                  type="submit"
                >
                  {isSubmitting ? "Enviando…" : "Enviar sugerencia"}
                </button>
              </div>
            </ValidatedForm>
          </section>
        </div>,
        document.body,
      ) : null}
    </section>
  );
}
