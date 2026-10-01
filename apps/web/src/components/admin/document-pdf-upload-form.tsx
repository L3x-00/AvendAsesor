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
  // Solo el formulario completo tiene este campo. Validarlo aquí evita que un
  // texto que no es JSON llegue al API y vuelva como un 400 sin campo marcado.
  metadata: [{ kind: "jsonObject", label: "Las palabras clave JSON" }],
};

export interface CreatedDocument {
  id: string;
  title: string;
}

interface DocumentPdfUploadFormProps {
  apiBaseUrl: string;
  children: ReactNode;
  className?: string;
  endpoint: string;
  /**
   * Se llama al terminar una carga correcta, después de pedir la recarga de
   * datos, con el documento creado si el API lo devolvió.
   */
  onCompleted?: (created: CreatedDocument | undefined) => void;
  /** Avisa cuando empieza y termina un envío (p. ej., para no cerrar un modal). */
  onPendingChange?: (pending: boolean) => void;
  /**
   * Se llama con el documento recién creado (p. ej., para vincularlo a un caso).
   * Si devuelve `{ ok: false }`, se avisa que la vinculación no se completó.
   */
  onUploaded?: (created: CreatedDocument) =>
    | Promise<{ message?: string; ok: boolean } | void>
    | { message?: string; ok: boolean }
    | void;
  /**
   * Ajusta los datos ya validados antes del envío (p. ej., convierte campos
   * de la interfaz en `metadata`).
   */
  prepareFormData?: (formData: FormData) => void;
  /** Muestra la ventana de confirmación al terminar. */
  showSuccessDialog?: boolean;
  submitLabel: string;
  successMessage: string;
}

type UploadFeedback = {
  message?: string;
  status: "error" | "idle" | "success";
};

function getUploadErrorMessage(status: number): string {
  // Solo se usa cuando ningún campo visible pudo marcarse: no se promete un
  // campo en rojo que no existe.
  if (status === 400 || status === 422) {
    return "El servicio rechazó algunos datos del documento. Revísalos y vuelve a intentarlo; el formulario conservó todo lo que escribiste.";
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

function fileErrorMessage(message: string): string | undefined {
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

/**
 * Mensajes amables para los datos que el API valida por campo. La clave es el
 * nombre del campo tal como lo reporta class-validator («metadata must be an
 * object»); el texto no repite lo que el usuario escribió.
 */
const FIELD_ERROR_MESSAGES: Record<string, string> = {
  articleReference: "Escribe la referencia con 120 caracteres como máximo.",
  documentTypeOther: "Escribe el tipo de documento, de 2 a 120 caracteres.",
  issuanceYear: "Elige un año válido que no sea posterior al actual.",
  issuingEntityOther:
    "Escribe el nombre de la institución, de 2 a 255 caracteres.",
  keywords:
    "Escribe las palabras clave separadas por comas, de 2 a 500 caracteres en total.",
  metadata:
    'Escribe un objeto JSON válido, por ejemplo {"keywords":["licencia"]}, o deja el campo vacío.',
  resolutionNumber: "Escribe el número con 120 caracteres como máximo.",
  specificDependency: "Escribe la dependencia, de 2 a 255 caracteres.",
  title: "Escribe un título de 2 a 500 caracteres.",
};

function dataFieldError(message: string): [string, string] | undefined {
  if (message === "Document metadata cannot exceed 8 KiB.") {
    return [
      "metadata",
      "Los datos adicionales son demasiado largos. Acórtalos y vuelve a intentarlo.",
    ];
  }
  if (
    message ===
    "A custom document type is required only when document type is OTRO."
  ) {
    return ["documentTypeOther", FIELD_ERROR_MESSAGES.documentTypeOther!];
  }
  const field = Object.keys(FIELD_ERROR_MESSAGES).find((name) =>
    message.startsWith(`${name} `),
  );
  return field ? [field, FIELD_ERROR_MESSAGES[field]!] : undefined;
}

/** Errores por campo a partir de la respuesta de rechazo del API. */
async function uploadFieldErrors(response: Response): Promise<FieldErrors> {
  if (response.status === 413) {
    return { file: getUploadErrorMessage(response.status) };
  }
  if (response.status !== 400 && response.status !== 422) return {};

  const errors: FieldErrors = {};
  try {
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || !("message" in result)) {
      return errors;
    }
    const messages = typeof result.message === "string"
      ? [result.message]
      : Array.isArray(result.message) ? result.message : [];
    for (const message of messages) {
      if (typeof message !== "string") continue;
      const fileError = fileErrorMessage(message);
      if (fileError) {
        errors.file ??= fileError;
        continue;
      }
      const fieldError = dataFieldError(message);
      if (fieldError) errors[fieldError[0]] ??= fieldError[1];
    }
  } catch {
    // Una respuesta sin JSON conserva el mensaje general del servicio.
  }
  return errors;
}

/**
 * Solo se puede señalar un campo que el usuario ve. Los datos que viajan en
 * campos ocultos (p. ej., los tomados del tema) se explican en el aviso general.
 */
function visibleFieldErrors(
  form: HTMLFormElement,
  errors: FieldErrors,
): FieldErrors {
  const visible: FieldErrors = {};
  for (const element of Array.from(form.elements)) {
    if (
      !(
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
      ) ||
      element.type === "hidden"
    ) {
      continue;
    }
    const message = errors[element.name];
    if (message) visible[element.name] = message;
  }
  return visible;
}

function createdDocumentFrom(value: unknown): CreatedDocument | undefined {
  if (
    !value ||
    typeof value !== "object" ||
    !("id" in value) ||
    typeof value.id !== "string"
  ) {
    return undefined;
  }
  const title =
    "title" in value && typeof value.title === "string" ? value.title : "";
  return { id: value.id, title };
}

export function DocumentPdfUploadForm({
  apiBaseUrl,
  children,
  className = "space-y-3",
  endpoint,
  onCompleted,
  onPendingChange,
  onUploaded,
  prepareFormData,
  showSuccessDialog = true,
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

    prepareFormData?.(formData);

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
    onPendingChange?.(true);

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
        const fieldErrors = visibleFieldErrors(
          form,
          await uploadFieldErrors(response),
        );
        if (Object.keys(fieldErrors).length > 0) {
          setServerErrors(fieldErrors);
          return;
        }
        setFeedback({
          message: getUploadErrorMessage(response.status),
          status: "error",
        });
        return;
      }

      let createdDocument: CreatedDocument | undefined;
      let linkWarning: string | undefined;
      if (onUploaded || onCompleted) {
        try {
          createdDocument = createdDocumentFrom(await response.json());
          if (onUploaded && createdDocument) {
            const result = await onUploaded(createdDocument);
            if (result && !result.ok) {
              linkWarning =
                result.message ??
                "No se pudo vincular automáticamente. Hazlo desde el detalle del caso.";
            }
          }
        } catch {
          if (onUploaded) {
            linkWarning =
              "No se pudo vincular automáticamente. Hazlo desde el detalle del caso.";
          }
        }
      }

      const finalMessage = linkWarning
        ? `Documento cargado. ${linkWarning}`
        : successMessage;
      form.reset();
      setFeedback({ message: finalMessage, status: "success" });
      setShowSuccess(showSuccessDialog && !linkWarning);
      showToast(finalMessage);
      router.refresh();
      onCompleted?.(createdDocument);
    } catch {
      setFeedback({
        message:
          "No se pudo conectar con el servicio, que puede estar reactivándose. Espera unos segundos y vuelve a pulsar el botón: tus datos siguen aquí.",
        status: "error",
      });
    } finally {
      pendingRef.current = false;
      setPending(false);
      onPendingChange?.(false);
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
