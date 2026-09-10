"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { ValidatedForm } from "@/components/ui/validated-form";
import type { FieldErrors, FieldRules } from "@/lib/ui/field-validation";
import { useToast } from "@/components/ui/toast";

export const MAX_ADMIN_PDF_BYTES = 50 * 1024 * 1024;

/** Formatos admitidos para carga (deben coincidir con la validación del API). */
export const ACCEPTED_DOCUMENT_EXTENSIONS = [".pdf", ".docx", ".doc", ".md"];

const PDF_RULES: FieldRules = {
  file: [
    { kind: "required", label: "El archivo" },
    {
      kind: "file",
      label: "El documento",
      accept: ACCEPTED_DOCUMENT_EXTENSIONS,
      maxBytes: MAX_ADMIN_PDF_BYTES,
    },
  ],
};

interface DocumentPdfUploadFormProps {
  apiBaseUrl: string;
  children: ReactNode;
  className?: string;
  endpoint: string;
  submitLabel: string;
  successMessage: string;
}

type UploadFeedback = {
  message?: string;
  status: "error" | "idle" | "success";
};

function getUploadErrorMessage(status: number): string {
  if (status === 400 || status === 422) {
    return "Revisa los campos marcados en rojo y vuelve a intentarlo. El formulario conservó todo lo que escribiste.";
  }

  if (status === 401) {
    return "Tu sesión se cerró por inactividad. Inicia sesión de nuevo y vuelve a cargar el documento.";
  }

  if (status === 403) {
    return "Tu cuenta no tiene permiso para cargar documentos. Pide acceso a un administrador.";
  }

  if (status === 409) {
    return "Este documento ya existía o cambió mientras lo cargabas. Revisa el listado; tus datos se conservaron.";
  }

  if (status === 413) {
    return "El documento pesa más de 50 MB. Reduce su tamaño o divídelo y vuelve a intentarlo.";
  }

  if (status === 429) {
    return "Hiciste varias cargas muy seguidas. Espera un minuto y vuelve a intentarlo; tus datos siguen en el formulario.";
  }

  if (status === 503) {
    return "El servicio tardó en responder, seguramente porque se estaba reactivando tras un rato sin uso. Espera unos segundos y vuelve a pulsar el botón: tus datos siguen aquí.";
  }

  return "No se pudo cargar el documento. Revisa tu conexión a internet y vuelve a intentarlo; tus datos se conservaron.";
}

async function pdfErrorMessage(response: Response): Promise<string | undefined> {
  if (response.status === 413) return getUploadErrorMessage(response.status);
  if (response.status !== 400 && response.status !== 422) return undefined;

  try {
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || !("message" in result)) return;
    const messages = typeof result.message === "string"
      ? [result.message]
      : Array.isArray(result.message) ? result.message : [];
    for (const message of messages) {
      if (typeof message !== "string") continue;
      if (message === "PDF files cannot exceed 300 pages.") {
        return "El PDF no puede superar las 300 páginas.";
      }
      if (message === "Documents cannot exceed 50 MiB.") {
        return getUploadErrorMessage(413);
      }
      if (message === "The uploaded file name is invalid.") {
        return "El nombre del archivo no es válido. Cambia el nombre y vuelve a seleccionarlo.";
      }
      if (message === "Only .pdf, .docx, .doc or .md files are allowed.") {
        return "El formato no es válido. Sube un PDF, Word (.docx o .doc) o Markdown (.md).";
      }
      if ([
        "A document file is required.",
        "A non-empty document file is required.",
        "The PDF does not contain any pages.",
        "The uploaded PDF could not be read or processed.",
        "The uploaded file is not a valid PDF.",
        "The uploaded file is not a valid Word (.docx) document.",
        "The uploaded file is not a valid Word (.doc) document.",
        "The uploaded file is not a valid Markdown (.md) document.",
      ].includes(message)) {
        return "El archivo debe ser un documento válido, no vacío y legible (PDF, Word o Markdown). Selecciona otro archivo.";
      }
    }
  } catch {
    // Una respuesta sin JSON conserva el mensaje general del servicio.
  }
}

export function DocumentPdfUploadForm({
  apiBaseUrl,
  children,
  className = "space-y-3",
  endpoint,
  submitLabel,
  successMessage,
}: DocumentPdfUploadFormProps) {
  const pendingRef = useRef(false);
  const router = useRouter();
  const [feedback, setFeedback] = useState<UploadFeedback>({ status: "idle" });
  const [pending, setPending] = useState(false);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [showSuccess, setShowSuccess] = useState(false);
  const { showToast } = useToast();

  const closeSuccess = useCallback(() => setShowSuccess(false), []);

  async function submit(formData: FormData, form: HTMLFormElement) {
    if (pendingRef.current) return;
    setShowSuccess(false);
    // Selector auxiliar de interfaz; el contrato multipart solo recibe el año.
    formData.delete("issuanceYearMode");

    if (form.elements.namedItem("moduleId")) {
      const moduleIds = formData
        .getAll("moduleId")
        .filter((value): value is string => typeof value === "string");
      formData.delete("moduleId");
      formData.set("moduleIds", JSON.stringify(moduleIds));
    }

    // Drop blank optional fields. The API's `@IsOptional()` only skips
    // null/undefined, so an empty string (e.g. an untouched metadata,
    // issuingEntity or issuanceYear input) fails validation with 400. The
    // removed Server Action rebuilt a clean payload that omitted these; the
    // direct upload must do the same or every normal upload breaks.
    for (const key of new Set(formData.keys())) {
      const values = formData.getAll(key);
      if (
        values.every(
          (value) => typeof value === "string" && value.trim() === "",
        )
      ) {
        formData.delete(key);
      }
    }

    setServerErrors({});

    setFeedback({ status: "idle" });
    pendingRef.current = true;
    setPending(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data, error } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;

      if (error || !accessToken) {
        setFeedback({
          message:
            "Tu sesión expiró. Inicia sesión nuevamente antes de cargar el documento.",
          status: "error",
        });
        return;
      }

      const response = await fetch(new URL(endpoint, apiBaseUrl + "/"), {
        body: formData,
        cache: "no-store",
        credentials: "omit",
        headers: {
          Accept: "application/json",
          Authorization: "Bearer " + accessToken,
        },
        method: "POST",
      });

      if (!response.ok) {
        const fileError = await pdfErrorMessage(response);
        if (fileError) {
          setServerErrors({ file: fileError });
          return;
        }
        setFeedback({
          message: getUploadErrorMessage(response.status),
          status: "error",
        });
        return;
      }

      form.reset();
      setFeedback({ message: successMessage, status: "success" });
      setShowSuccess(true);
      showToast(successMessage);
      router.refresh();
    } catch {
      setFeedback({
        message:
          "No se pudo conectar con el servicio, que puede estar reactivándose. Espera unos segundos y vuelve a pulsar el botón: tus datos siguen aquí.",
        status: "error",
      });
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  const feedbackClassName =
    feedback.status === "success"
      ? "avend-feedback--success"
      : "avend-feedback--error";

  return (
    <>
      {showSuccess ? <UploadSuccessModal onClose={closeSuccess} /> : null}
      <ValidatedForm
        aria-busy={pending}
        className={className}
        onValidSubmit={submit}
        rules={PDF_RULES}
        serverErrors={serverErrors}
      >
      {children}
      {feedback.message ? (
        <p
          aria-live="polite"
          className={["avend-feedback", feedbackClassName].join(" ")}
          role={feedback.status === "error" ? "alert" : "status"}
        >
          {feedback.message}
        </p>
      ) : null}
      {pending ? (
        <p aria-live="polite" className="avend-feedback" role="status">
          Cargando el documento. Espera mientras se valida y registra.
        </p>
      ) : null}
      <button
        aria-disabled={pending}
        className="avend-button avend-button--primary avend-admin-submit"
        type="submit"
      >
        {pending ? "Cargando…" : submitLabel}
      </button>
      </ValidatedForm>
    </>
  );
}

/**
 * Confirmación visual de carga: una ventana emergente accesible con un check
 * verde animado. Se cierra sola a los pocos segundos, con Escape, al pulsar
 * fuera o con el botón. El texto no repite el `successMessage` del aviso en
 * línea para no duplicar contenido ni romper búsquedas por texto en pruebas.
 */
function UploadSuccessModal({ onClose }: { onClose: () => void }) {
  const acceptRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    acceptRef.current?.focus();
    const timer = globalThis.setTimeout(onClose, 3000);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      globalThis.clearTimeout(timer);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="avend-success-overlay" onClick={onClose}>
      <div
        aria-labelledby="avend-upload-success-title"
        aria-modal="true"
        className="avend-success-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <svg
          aria-hidden="true"
          className="avend-success-check"
          viewBox="0 0 60 60"
        >
          <circle cx="30" cy="30" r="26" />
          <path d="M18 31l8 8 16-18" />
        </svg>
        <h2
          className="text-xl font-bold text-avend-navy"
          id="avend-upload-success-title"
        >
          ¡Documento cargado correctamente!
        </h2>
        <p className="mt-1 text-base text-avend-text-muted">
          El documento se registró y ya aparece en el listado.
        </p>
        <button
          className="avend-button avend-button--primary mt-4"
          onClick={onClose}
          ref={acceptRef}
          type="button"
        >
          Aceptar
        </button>
      </div>
    </div>
  );
}
