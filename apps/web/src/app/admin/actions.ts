"use server";

import { revalidatePath, updateTag } from "next/cache";
import { AdminApiError, type AdminApiClient } from "@/lib/admin-api/client";
import { type AdminActionState } from "@/lib/admin-api/action-state";
import { createAuthorizedAdminApiClient } from "@/lib/admin-api/authorized-client";

class FormValidationError extends Error {}

function actionFailure(error: unknown): AdminActionState {
  if (error instanceof FormValidationError) {
    return { message: error.message, status: "error" };
  }

  if (error instanceof AdminApiError) {
    if (error.status === 401) {
      return {
        message: "Tu sesión expiró. Inicia sesión nuevamente.",
        status: "error",
      };
    }

    if (error.status === 403) {
      return {
        message: "No tienes permiso para realizar esta acción.",
        status: "error",
      };
    }

    if (error.status === 404) {
      return {
        message: "El recurso ya no está disponible. Actualiza la página.",
        status: "error",
      };
    }

    if (error.status === 409) {
      return {
        message:
          "La operación entra en conflicto con el estado actual. Actualiza la página antes de continuar.",
        status: "error",
      };
    }

    if (error.status === 429) {
      return {
        message: "Demasiadas solicitudes. Espera un minuto antes de continuar.",
        status: "error",
      };
    }

    if (error.status === 503) {
      return {
        message:
          "No se pudo confirmar el resultado. Actualiza el listado o detalle antes de volver a enviar esta operación.",
        status: "error",
      };
    }
  }

  return {
    message:
      "No fue posible completar la operación. Revisa los datos e inténtalo más tarde.",
    status: "error",
  };
}

function requiredText(formData: FormData, name: string, label: string): string {
  const value = formData.get(name);

  if (typeof value !== "string" || !value.trim()) {
    throw new FormValidationError(`${label} es obligatorio.`);
  }

  return value.trim();
}

function optionalText(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);

  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  return value.trim();
}

function optionalInteger(
  formData: FormData,
  name: string,
  label: string,
): number | undefined {
  const value = optionalText(formData, name);

  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
    throw new FormValidationError(`${label} debe ser un número entero.`);
  }

  return parsed;
}

function optionalJsonObject(
  formData: FormData,
  name: string,
): Record<string, unknown> | undefined {
  const value = optionalText(formData, name);

  if (value === undefined) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(value);

    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new FormValidationError("Los metadatos deben ser un objeto JSON.");
    }

    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof FormValidationError) {
      throw error;
    }

    throw new FormValidationError(
      "Los metadatos deben ser un objeto JSON válido.",
    );
  }
}

function modulePayload(
  formData: FormData,
  options: { allowClearingDescription?: boolean } = {},
): Record<string, unknown> {
  const sortOrder = optionalInteger(formData, "sortOrder", "El orden");
  const metadata = optionalJsonObject(formData, "metadata");
  const parentModuleId = optionalText(formData, "parentModuleId");
  const description = optionalText(formData, "description");
  const descriptionPayload =
    description !== undefined
      ? { description }
      : options.allowClearingDescription && formData.has("description")
        ? { description: null }
        : {};

  const parentPayload =
    parentModuleId === "__root__"
      ? { parentModuleId: null }
      : parentModuleId && parentModuleId !== "__keep__"
        ? { parentModuleId }
        : {};

  return {
    ...(optionalText(formData, "code")
      ? { code: optionalText(formData, "code") }
      : {}),
    ...descriptionPayload,
    ...(metadata ? { metadata } : {}),
    ...(optionalText(formData, "name")
      ? { name: optionalText(formData, "name") }
      : {}),
    ...parentPayload,
    ...(sortOrder === undefined ? {} : { sortOrder }),
  };
}

function documentMetadataPayload(formData: FormData): Record<string, unknown> {
  const metadata = optionalJsonObject(formData, "metadata");
  const issuanceYear = optionalInteger(formData, "issuanceYear", "El año");

  return {
    ...(optionalText(formData, "articleReference")
      ? { articleReference: optionalText(formData, "articleReference") }
      : {}),
    ...(optionalText(formData, "documentType")
      ? { documentType: optionalText(formData, "documentType") }
      : {}),
    ...(issuanceYear === undefined ? {} : { issuanceYear }),
    ...(optionalText(formData, "issuingEntity")
      ? { issuingEntity: optionalText(formData, "issuingEntity") }
      : {}),
    ...(metadata ? { metadata } : {}),
    ...(optionalText(formData, "resolutionNumber")
      ? { resolutionNumber: optionalText(formData, "resolutionNumber") }
      : {}),
    ...(optionalText(formData, "title")
      ? { title: optionalText(formData, "title") }
      : {}),
  };
}

async function withApi(
  action: (client: AdminApiClient) => Promise<AdminActionState>,
): Promise<AdminActionState> {
  const client = await createAuthorizedAdminApiClient();

  try {
    return await action(client);
  } catch (error) {
    return actionFailure(error);
  }
}

export async function createModuleAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return withApi(async (client) => {
    const payload = modulePayload(formData);
    payload.code = requiredText(formData, "code", "El código");
    payload.name = requiredText(formData, "name", "El nombre");
    await client.createModule(payload);
    updateTag("chat-modules");
    revalidatePath("/admin/modules");
    revalidatePath("/admin/documents");

    return { message: "Módulo creado.", status: "success" };
  });
}

export async function updateModuleAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return withApi(async (client) => {
    const moduleId = requiredText(formData, "moduleId", "El módulo");
    const payload = modulePayload(formData, { allowClearingDescription: true });

    if (Object.keys(payload).length === 0) {
      throw new FormValidationError(
        "Ingresa al menos un campo para actualizar.",
      );
    }

    await client.updateModule(moduleId, payload);
    updateTag("chat-modules");
    revalidatePath("/admin/modules");
    revalidatePath("/admin/documents");

    return { message: "Módulo actualizado.", status: "success" };
  });
}

export async function setModuleStatusAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return withApi(async (client) => {
    const moduleId = requiredText(formData, "moduleId", "El módulo");
    const isActive = formData.get("isActive") === "true";
    const reason = optionalText(formData, "reason");

    if (!isActive && !reason) {
      throw new FormValidationError("Indica el motivo de la desactivación.");
    }

    await client.setModuleStatus(moduleId, isActive, reason);
    updateTag("chat-modules");
    revalidatePath("/admin/modules");

    return {
      message: isActive ? "Módulo activado." : "Módulo desactivado.",
      status: "success",
    };
  });
}

export async function deleteModuleAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return withApi(async (client) => {
    const moduleId = requiredText(formData, "moduleId", "El módulo");
    const reason = requiredText(formData, "reason", "El motivo de baja");
    await client.deleteModule(moduleId, reason);
    updateTag("chat-modules");
    revalidatePath("/admin/modules");
    revalidatePath("/admin/documents");

    return { message: "Módulo eliminado lógicamente.", status: "success" };
  });
}

export async function updateDocumentAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return withApi(async (client) => {
    const documentId = requiredText(formData, "documentId", "El documento");
    const payload = documentMetadataPayload(formData);

    if (Object.keys(payload).length === 0) {
      throw new FormValidationError(
        "Ingresa al menos un campo para actualizar.",
      );
    }

    await client.updateDocument(documentId, payload);
    revalidatePath("/admin/documents");
    revalidatePath(`/admin/documents/${documentId}`);

    return { message: "Metadatos actualizados.", status: "success" };
  });
}

export async function setDocumentStatusAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return withApi(async (client) => {
    const documentId = requiredText(formData, "documentId", "El documento");
    const isActive = formData.get("isActive") === "true";
    const reason = optionalText(formData, "reason");

    if (!isActive && !reason) {
      throw new FormValidationError("Indica el motivo de la desactivación.");
    }

    await client.setDocumentStatus(documentId, isActive, reason);
    revalidatePath("/admin/documents");
    revalidatePath(`/admin/documents/${documentId}`);

    return {
      message: isActive ? "Documento activado." : "Documento desactivado.",
      status: "success",
    };
  });
}

export async function setDocumentSituationAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return withApi(async (client) => {
    const documentId = requiredText(formData, "documentId", "El documento");
    const situation = requiredText(formData, "situation", "La situación");
    const allowedSituations = ["archived", "current", "replaced"] as const;

    if (
      !allowedSituations.includes(
        situation as (typeof allowedSituations)[number],
      )
    ) {
      throw new FormValidationError("Selecciona una situación válida.");
    }

    const reason = optionalText(formData, "reason");
    const replacementDate = optionalText(formData, "replacementDate");
    const replacementDocumentId = optionalText(
      formData,
      "replacementDocumentId",
    );
    const replacementYear = optionalInteger(
      formData,
      "replacementYear",
      "El año de reemplazo",
    );
    const observation = optionalText(formData, "observation");

    if (situation === "archived" && !reason) {
      throw new FormValidationError("Indica el motivo del archivo.");
    }

    if (
      situation === "replaced" &&
      (!reason || (!replacementDate && replacementYear === undefined))
    ) {
      throw new FormValidationError(
        "Indica el motivo y la fecha o año del reemplazo.",
      );
    }

    await client.setDocumentSituation(documentId, {
      ...(observation ? { observation } : {}),
      ...(reason ? { reason } : {}),
      ...(replacementDate ? { replacementDate } : {}),
      ...(replacementDocumentId ? { replacementDocumentId } : {}),
      ...(replacementYear === undefined ? {} : { replacementYear }),
      situation: situation as (typeof allowedSituations)[number],
    });
    revalidatePath("/admin/documents");
    revalidatePath(`/admin/documents/${documentId}`);
    revalidatePath("/admin/modules");

    return {
      message: "Situación del documento actualizada.",
      status: "success",
    };
  });
}

export async function deleteDocumentAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return withApi(async (client) => {
    const documentId = requiredText(formData, "documentId", "El documento");
    const reason = requiredText(formData, "reason", "El motivo de baja");
    await client.deleteDocument(documentId, reason);
    revalidatePath("/admin/documents");
    revalidatePath(`/admin/documents/${documentId}`);

    return { message: "Documento eliminado lógicamente.", status: "success" };
  });
}

export async function linkDocumentModuleAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return withApi(async (client) => {
    const documentId = requiredText(formData, "documentId", "El documento");
    const moduleId = requiredText(formData, "moduleId", "El módulo");
    await client.linkDocumentModule(documentId, moduleId);
    revalidatePath(`/admin/documents/${documentId}`);

    return { message: "Módulo asociado.", status: "success" };
  });
}

export async function unlinkDocumentModuleAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return withApi(async (client) => {
    const documentId = requiredText(formData, "documentId", "El documento");
    const moduleId = requiredText(formData, "moduleId", "El módulo");
    await client.unlinkDocumentModule(documentId, moduleId);
    revalidatePath(`/admin/documents/${documentId}`);

    return { message: "Módulo desvinculado.", status: "success" };
  });
}

export async function createDownloadUrlAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return withApi(async (client) => {
    const documentId = requiredText(formData, "documentId", "El documento");
    const versionId = optionalText(formData, "versionId");
    const download = await client.getDownloadUrl(documentId, versionId);

    return {
      downloadUrl: download.url,
      message: "Enlace temporal generado por 60 segundos.",
      status: "success",
    };
  });
}

export async function reviewUnansweredQuestionAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return withApi(async (client) => {
    const questionId = requiredText(formData, "questionId", "La consulta");
    const category = requiredText(formData, "category", "La clasificación");
    const decision = requiredText(formData, "decision", "La decisión");
    const reviewNote = requiredText(
      formData,
      "reviewNote",
      "La nota de revisión",
    );
    const categories = [
      "documentation_gap",
      "duplicate",
      "module_configuration",
      "other",
      "outside_scope",
    ] as const;

    if (!categories.includes(category as (typeof categories)[number])) {
      throw new FormValidationError("Selecciona una clasificación válida.");
    }

    if (decision !== "resolved" && decision !== "dismissed") {
      throw new FormValidationError("Selecciona una decisión válida.");
    }

    await client.reviewUnansweredQuestion(questionId, {
      category: category as (typeof categories)[number],
      decision,
      reviewNote,
    });
    revalidatePath("/admin");
    revalidatePath("/admin/operations");

    return { message: "Consulta revisada.", status: "success" };
  });
}

export async function updateAdministrativeUserAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return withApi(async (client) => {
    const userId = requiredText(formData, "userId", "El usuario");
    const reason = requiredText(formData, "reason", "El motivo");
    const accountStatus = optionalText(formData, "accountStatus");
    const role = optionalText(formData, "role");
    const payload: {
      accountStatus?: "active" | "suspended";
      reason: string;
      role?: "admin" | "docente" | "superadmin";
    } = { reason };

    if (accountStatus && accountStatus !== "__keep__") {
      if (accountStatus !== "active" && accountStatus !== "suspended") {
        throw new FormValidationError("Selecciona un estado de cuenta válido.");
      }
      payload.accountStatus = accountStatus;
    }

    if (role && role !== "__keep__") {
      if (role !== "admin" && role !== "docente" && role !== "superadmin") {
        throw new FormValidationError("Selecciona un rol válido.");
      }
      payload.role = role;
    }

    if (!payload.accountStatus && !payload.role) {
      throw new FormValidationError(
        "Selecciona un rol o un estado para actualizar.",
      );
    }

    await client.updateAdministrativeUser(userId, payload);
    revalidatePath("/admin");
    revalidatePath("/admin/users");

    return {
      message: "Usuario actualizado. La acción quedó registrada.",
      status: "success",
    };
  });
}
