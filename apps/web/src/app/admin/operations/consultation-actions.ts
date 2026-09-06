"use server";

import { revalidatePath } from "next/cache";
import type { AdminActionState } from "@/lib/admin-api/action-state";
import { ConsultationReportsApiError } from "@/lib/consultation-reports-api/client";
import { createAuthorizedConsultationReportsApiContext } from "@/lib/consultation-reports-api/authorized-client";

class FormValidationError extends Error {}

function requiredText(formData: FormData, name: string, label: string): string {
  const value = formData.get(name);
  if (typeof value !== "string" || !value.trim()) {
    throw new FormValidationError(`${label} es obligatorio.`);
  }
  return value.trim();
}

function optionalText(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function actionFailure(error: unknown): AdminActionState {
  if (error instanceof FormValidationError) {
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
