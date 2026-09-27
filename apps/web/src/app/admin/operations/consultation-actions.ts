"use server";

import { revalidatePath } from "next/cache";
import type { AdminActionState } from "@/lib/admin-api/action-state";
import { ConsultationReportsApiError } from "@/lib/consultation-reports-api/client";
import { createAuthorizedConsultationReportsApiContext } from "@/lib/consultation-reports-api/authorized-client";

class FormValidationError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

function requiredText(formData: FormData, name: string, label: string): string {
  const value = formData.get(name);
  if (typeof value !== "string" || !value.trim()) {
    throw new FormValidationError(`${label} es obligatorio.`, name);
  }
  return value.trim();
}

function optionalText(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function actionFailure(error: unknown): AdminActionState {
  if (error instanceof FormValidationError) {
    if (error.field) {
      return { fieldErrors: { [error.field]: error.message }, status: "error" };
    }
    return { message: error.message, status: "error" };
  }
  if (error instanceof ConsultationReportsApiError) {
    if (error.status === 401)
      return {
        message: "Tu sesión expiró. Inicia sesión nuevamente.",
        status: "error",
      };
    if (error.status === 403)
      return {
        message: "No tienes permiso para modificar este caso.",
        status: "error",
      };
    if (error.status === 404)
      return {
        message: "El caso ya no está disponible. Actualiza la página.",
        status: "error",
      };
    if (error.status === 409)
      return {
        message: "El caso cambió mientras lo revisabas. Actualiza la página.",
        status: "error",
      };
    if (error.status === 429)
      return {
        message: "Demasiadas solicitudes. Espera un minuto.",
        status: "error",
      };
  }
  return {
    message: "No fue posible guardar el cambio. Inténtalo nuevamente.",
    status: "error",
  };
}

function revalidateCase(caseId: string): void {
  revalidatePath("/admin/operations");
  revalidatePath(`/admin/operations/${caseId}`);
}

export async function updateConsultationCaseAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const caseId = requiredText(formData, "caseId", "El caso");
    const status = optionalText(formData, "status");
    const note = optionalText(formData, "note");
    const changeRouting = formData.get("changeRouting") === "true";
    const detectedModuleId = optionalText(formData, "detectedModuleId");
    const detectedSubmoduleId = optionalText(formData, "detectedSubmoduleId");
    if (!status && !note && !changeRouting) {
      throw new FormValidationError(
        "Selecciona un estado, escribe una nota o corrige la ruta.",
      );
    }
    if (changeRouting && detectedSubmoduleId && !detectedModuleId) {
      throw new FormValidationError(
        "El submódulo requiere seleccionar primero su módulo principal.",
        "detectedModuleId",
      );
    }
    const { client } = await createAuthorizedConsultationReportsApiContext();
    await client.updateCase(caseId, {
      ...(changeRouting
        ? {
            changeRouting: true,
            detectedModuleId: detectedModuleId ?? null,
            detectedSubmoduleId: detectedSubmoduleId ?? null,
          }
        : {}),
      ...(note ? { note } : {}),
      ...(status ? { status } : {}),
    });
    revalidateCase(caseId);
    return {
      message: "Caso actualizado. El historial conserva esta acción.",
      status: "success",
    };
  } catch (error) {
    return actionFailure(error);
  }
}

const MAX_GROUP_CASES = 50;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * Cierra de una vez un grupo de consultas sin sustento (p. ej., tras cargar el
 * documento del tema). Si se marcan como resueltas, los docentes de esas
 * consultas verán en su historial que ya pueden volver a preguntar; las
 * descartadas no generan aviso.
 */
export async function resolveUnansweredGroupAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const caseIds = formData
      .getAll("caseId")
      .filter(
        (value): value is string =>
          typeof value === "string" && uuidPattern.test(value),
      )
      .slice(0, MAX_GROUP_CASES);
    if (!caseIds.length) {
      throw new FormValidationError("El grupo no tiene casos abiertos.");
    }
    const status =
      formData.get("status") === "discarded" ? "discarded" : "resolved";
    const note = requiredText(formData, "note", "La nota");
    const requestedPeriod = formData.get("period");
    const period =
      requestedPeriod === "today" || requestedPeriod === "week"
        ? requestedPeriod
        : "month";
    const { client } = await createAuthorizedConsultationReportsApiContext();
    const result = await client.resolveGroup({
      caseIds,
      note,
      period,
      status,
    });
    revalidatePath("/admin/operations");
    const verb = status === "resolved" ? "resueltas" : "descartadas";
    const details = [
      result.skipped > 0
        ? `${result.skipped} ya habían cambiado y se omitieron`
        : null,
      result.failed > 0
        ? `${result.failed} no se pudieron cerrar; vuelve a intentarlo`
        : null,
    ].filter(Boolean);
    return {
      message: details.length
        ? `${result.updated} consultas ${verb}. ${details.join(". ")}.`
        : `${result.updated} consultas ${verb}. El historial de cada caso conserva la nota.`,
      status: result.failed > 0 && result.updated === 0 ? "error" : "success",
    };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function linkConsultationCaseDocumentAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const caseId = requiredText(formData, "caseId", "El caso");
    const documentId = requiredText(formData, "documentId", "El documento");
    const { client } = await createAuthorizedConsultationReportsApiContext();
    await client.linkDocument(caseId, documentId);
    revalidateCase(caseId);
    return { message: "Documento relacionado con el caso.", status: "success" };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function decideConsultationAttachmentAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const caseId = requiredText(formData, "caseId", "El caso");
    const attachmentId = requiredText(formData, "attachmentId", "El adjunto");
    const disposition = requiredText(formData, "disposition", "La decisión");
    const documentId = optionalText(formData, "documentId");
    const note = optionalText(formData, "note");
    if (disposition === "incorporated" && !documentId) {
      throw new FormValidationError(
        "Para incorporar el adjunto, enlaza primero el documento registrado.",
        "documentId",
      );
    }
    const { client } = await createAuthorizedConsultationReportsApiContext();
    await client.decideAttachment(caseId, attachmentId, {
      disposition,
      ...(documentId ? { documentId } : {}),
      ...(note ? { note } : {}),
    });
    revalidateCase(caseId);
    return {
      message: "Decisión del adjunto registrada en el historial.",
      status: "success",
    };
  } catch (error) {
    return actionFailure(error);
  }
}
