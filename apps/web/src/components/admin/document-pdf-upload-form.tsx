"use client";

import { type ReactNode, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { ValidatedForm } from "@/components/ui/validated-form";
import type { FieldErrors, FieldRules } from "@/lib/ui/field-validation";
import { useToast } from "@/components/ui/toast";

export const MAX_ADMIN_PDF_BYTES = 20 * 1024 * 1024;

const PDF_RULES: FieldRules = {
  file: [
    { kind: "required", label: "El archivo PDF" },
    { kind: "file", label: "El PDF", accept: [".pdf"], maxBytes: MAX_ADMIN_PDF_BYTES },
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
    return "El PDF o los datos ingresados no son válidos. Revísalos; el formulario conserva toda la información.";
  }

  if (status === 401) {
    return "Tu sesión expiró. Inicia sesión nuevamente antes de cargar el PDF.";
  }

  if (status === 403) {
    return "No tienes permiso para cargar documentos.";
  }

  if (status === 409) {
    return "La carga entra en conflicto con el estado actual. Los datos se conservaron para que puedas revisarlos.";
  }

  if (status === 413) {
    return "El PDF supera el límite permitido de 20 MiB.";
  }

  if (status === 429) {
    return "Se alcanzó el límite temporal de cargas. Espera un minuto; tus datos permanecen en el formulario.";
  }

  if (status === 503) {
    return "No se pudo confirmar la carga. Revisa el listado antes de volver a enviarla; tus datos permanecen en el formulario.";
  }

  return "No fue posible cargar el PDF. Comprueba tu conexión e inténtalo nuevamente; tus datos se conservaron.";
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
      if (message === "PDF files cannot exceed 20 MiB.") {
        return getUploadErrorMessage(413);
      }
      if (message === "The uploaded file name is invalid.") {
        return "El nombre del archivo no es válido. Cambia el nombre y vuelve a seleccionarlo.";
      }
      if ([
        "A PDF file is required.",
        "A non-empty PDF file is required.",
        "The PDF does not contain any pages.",
        "The uploaded PDF could not be read or processed.",
        "Only files with a .pdf extension are allowed.",
        "The uploaded file type must be PDF.",
        "The uploaded file is not a valid PDF.",
      ].includes(message)) {
        return "El archivo debe ser un PDF válido, no vacío y legible. Selecciona otro archivo.";
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
  const { showToast } = useToast();

  async function submit(formData: FormData, form: HTMLFormElement) {
    if (pendingRef.current) return;
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
            "Tu sesión expiró. Inicia sesión nuevamente antes de cargar el PDF.",
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
      showToast(successMessage);
      router.refresh();
    } catch {
      setFeedback({
        message:
          "No fue posible conectar con el servicio de documentos. Tus datos se conservaron para volver a intentarlo.",
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
          Cargando PDF. Espera mientras se valida y registra el documento.
        </p>
      ) : null}
      <button
        aria-disabled={pending}
        className="avend-button avend-button--primary avend-admin-submit"
        type="submit"
      >
        {pending ? "Cargando PDF…" : submitLabel}
      </button>
    </ValidatedForm>
  );
}
