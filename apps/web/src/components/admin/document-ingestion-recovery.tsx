import type { ReactNode } from "react";
import { retryDocumentIngestionAction } from "@/app/admin/actions";
import { AdminActionForm } from "@/components/admin/admin-action-form";
import type { ManagedDocumentVersion } from "@/lib/admin-api/types";

type FailureCause = NonNullable<ManagedDocumentVersion["ingestionFailureCause"]>;

/** Qué pasó, en lenguaje llano, y si conviene reintentar o subir otro archivo. */
const CAUSES: Record<FailureCause, { text: string; uploadFirst: boolean }> = {
  ai_service: {
    text: "El servicio que prepara el documento para las consultas no respondió. Suele ser algo temporal.",
    uploadFirst: false,
  },
  no_text: {
    text: "No se encontró texto legible en el archivo: puede estar vacío, protegido o ser una imagen de muy baja calidad.",
    uploadFirst: true,
  },
  timeout: {
    text: "El procesamiento tardó más de lo permitido y se detuvo. Suele pasar con PDF escaneados (fotos de páginas) o muy pesados, que se leen con reconocimiento de texto.",
    uploadFirst: false,
  },
  too_large: {
    text: "El documento tiene demasiado texto para procesarse de una sola vez.",
    uploadFirst: true,
  },
  unknown: {
    text: "No se pudo leer o indexar el archivo.",
    uploadFirst: false,
  },
  unreadable_file: {
    text: "El archivo está dañado o protegido con contraseña y no se pudo abrir. Sube una versión que se abra normalmente.",
    uploadFirst: true,
  },
  unsupported_format: {
    text: "Este formato no se puede leer (por ejemplo, un Word .doc antiguo). Súbelo como PDF o como Word .docx.",
    uploadFirst: true,
  },
};

interface DocumentIngestionRecoveryProps {
  cause: FailureCause | null | undefined;
  /** Hay una versión vigente en Error que se puede volver a procesar. */
  canRetry: boolean;
  documentId: string;
}

/**
 * Estado técnico «Error» con salida: explica la causa y ofrece qué hacer
 * (volver a procesar, subir una versión corregida, archivar o eliminar). Antes
 * solo decía que el Error era automático, sin ninguna acción.
 */
export function DocumentIngestionRecovery({
  cause,
  canRetry,
  documentId,
}: DocumentIngestionRecoveryProps) {
  const content = CAUSES[cause ?? "unknown"];

  const retry: ReactNode = canRetry ? (
    <li className="rounded-lg border border-avend-border p-4" key="retry">
      <AdminActionForm
        action={retryDocumentIngestionAction}
        className="space-y-2"
        submitLabel="Volver a procesar"
      >
        <input name="documentId" type="hidden" value={documentId} />
        <p className="text-base font-semibold">Volver a procesar</p>
        <p className="text-base text-avend-text-muted">
          {content.uploadFirst
            ? "Puedes intentarlo, aunque con este problema lo más probable es que haga falta otro archivo."
            : "Recomendado: el documento vuelve a la cola y su estado se actualiza en unos minutos."}
        </p>
      </AdminActionForm>
    </li>
  ) : null;

  const upload: ReactNode = (
    <li className="rounded-lg border border-avend-border p-4" key="upload">
      <p className="text-base font-semibold">Subir una versión corregida</p>
      <p className="mt-1 text-base text-avend-text-muted">
        Por ejemplo, un PDF con texto seleccionable (no escaneado) o más
        liviano. La versión anterior se conserva en el historial.
      </p>
      <a className="avend-button mt-3 inline-flex" href="#new-version">
        Ir a «Nueva versión»
      </a>
    </li>
  );

  return (
    <div className="mt-3 space-y-4">
      <div
        className="rounded-lg border border-red-300 bg-red-50 p-4 text-base text-red-900"
        role="note"
      >
        <p className="font-bold">No se pudo procesar este documento</p>
        <p className="mt-1">{content.text}</p>
        <p className="mt-1">
          Mientras siga en Error, el asistente no lo usa para responder.
        </p>
      </div>
      <h3 className="text-base font-bold">Qué puedes hacer</h3>
      <ol className="space-y-3">
        {content.uploadFirst ? [upload, retry] : [retry, upload]}
        <li className="rounded-lg border border-avend-border p-4">
          <p className="text-base font-semibold">Si ya no lo necesitas</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a className="avend-button" href="#document-lifecycle">
              Archivar o desactivar
            </a>
            <a className="avend-button" href="#delete-document">
              Eliminar
            </a>
          </div>
        </li>
      </ol>
    </div>
  );
}
