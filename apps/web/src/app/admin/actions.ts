"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import {
  accessExpiryInstant,
  accessStartInstant,
} from "@/lib/admin-api/access-window";
import { AdminApiError, type AdminApiClient } from "@/lib/admin-api/client";
import { type AdminActionState } from "@/lib/admin-api/action-state";
import { createAuthorizedAdminApiClient } from "@/lib/admin-api/authorized-client";

/**
 * Un error de validación sabe a QUÉ campo pertenece. Sin ese dato el
 * formulario solo podía pintar un mensaje general y el administrador tenía que
 * adivinar cuál de los campos lo había provocado.
 */
class FormValidationError extends Error {
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.field = field;
  }
}

function actionFailure(error: unknown): AdminActionState {
  if (error instanceof FormValidationError) {
    return error.field
      ? {
          fieldErrors: { [error.field]: error.message },
          status: "error",
        }
      : { message: error.message, status: "error" };
  }

  if (error instanceof AdminApiError) {
    if (error.status === 409 && error.field === "email") {
      return {
        fieldErrors: { email: "Este correo electrónico ya tiene una cuenta. Usa otro correo o revisa el usuario existente." },
        status: "error",
      };
    }
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
    throw new FormValidationError(`${label} es obligatorio.`, name);
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
    throw new FormValidationError(`${label} debe ser un número entero.`, name);
  }

  return parsed;
}

function optionalBoolean(
  formData: FormData,
  name: string,
): boolean | undefined {
  const value = optionalText(formData, name);
  if (value === undefined) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new FormValidationError(`El valor de ${name} no es válido.`, name);
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
      throw new FormValidationError("Los metadatos deben ser un objeto JSON.", name);
    }

    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof FormValidationError) {
      throw error;
    }

    throw new FormValidationError(
      "Los metadatos deben ser un objeto JSON válido.",
      name,
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
  const isActive = optionalBoolean(formData, "isActive");
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
    ...(isActive === undefined ? {} : { isActive }),
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

  if (issuanceYear === undefined) {
    throw new FormValidationError("El año es obligatorio.", "issuanceYear");
  }

  return {
    additionalDetail: optionalText(formData, "additionalDetail") ?? null,
    articleReference: optionalText(formData, "articleReference") ?? null,
    documentType: requiredText(formData, "documentType", "El tipo documental"),
    ...(formData.has("documentTypeOther")
      ? {
          documentTypeOther:
            optionalText(formData, "documentTypeOther") ?? null,
        }
      : {}),
    issuanceYear,
    issuingEntity: requiredText(
      formData,
      "issuingEntity",
      "La entidad emisora",
    ),
    ...(formData.has("issuingEntityOther")
      ? {
          issuingEntityOther:
            optionalText(formData, "issuingEntityOther") ?? null,
        }
      : {}),
    metadata: metadata ?? {},
    resolutionNumber: optionalText(formData, "resolutionNumber") ?? null,
    specificDependency: requiredText(
      formData,
      "specificDependency",
      "La dependencia específica",
    ),
    title: requiredText(formData, "title", "El título"),
  };
}

async function withApi(
  action: (client: AdminApiClient) => Promise<AdminActionState>,
  options: { requireModulesAccess?: boolean } = {},
): Promise<AdminActionState> {
  const client = await createAuthorizedAdminApiClient(options);

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
  return withApi(
    async (client) => {
      const payload = modulePayload(formData);
      payload.code = requiredText(formData, "code", "El código");
      payload.name = requiredText(formData, "name", "El nombre");
      await client.createModule(payload);
      updateTag("chat-modules");
      revalidatePath("/admin/modules", "layout");
      revalidatePath("/admin/documents", "layout");

      return { message: "Módulo creado.", status: "success" };
    },
    { requireModulesAccess: true },
  );
}

export async function updateModuleAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return withApi(
    async (client) => {
      const moduleId = requiredText(formData, "moduleId", "El módulo");
      const payload = modulePayload(formData, {
        allowClearingDescription: true,
      });

      if (Object.keys(payload).length === 0) {
        throw new FormValidationError(
          "Ingresa al menos un campo para actualizar.",
        );
      }

      await client.updateModule(moduleId, payload);
      updateTag("chat-modules");
      revalidatePath("/admin/modules", "layout");
      revalidatePath("/admin/documents", "layout");

      return { message: "Módulo actualizado.", status: "success" };
    },
    { requireModulesAccess: true },
  );
}

export async function setModuleStatusAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return withApi(
    async (client) => {
      const moduleId = requiredText(formData, "moduleId", "El módulo");
      const isActive = formData.get("isActive") === "true";
      const reason = optionalText(formData, "reason");

      if (!isActive && !reason) {
        throw new FormValidationError("Indica el motivo de la desactivación.", "reason");
      }

      await client.setModuleStatus(moduleId, isActive, reason);
      updateTag("chat-modules");
      revalidatePath("/admin/modules", "layout");

      return {
        message: isActive ? "Módulo activado." : "Módulo desactivado.",
        status: "success",
      };
    },
    { requireModulesAccess: true },
  );
}

export async function deleteModuleAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const requestedRedirect = optionalText(formData, "redirectTo");
  const result = await withApi(
    async (client) => {
      const moduleId = requiredText(formData, "moduleId", "El módulo");
      const reason = requiredText(formData, "reason", "El motivo de baja");
      await client.deleteModule(moduleId, reason);
      updateTag("chat-modules");
      revalidatePath("/admin/modules", "layout");
      revalidatePath("/admin/documents", "layout");

      return { message: "Módulo eliminado lógicamente.", status: "success" };
    },
    { requireModulesAccess: true },
  );

  // Tras el borrado hay que SALIR de la ruta del módulo recién eliminado: al
  // padre si era submódulo, al listado si era módulo principal. Sin esto la ruta
  // `/admin/modules/[moduleId]` revalida sin el módulo y cae en 404 o en el
  // boundary de error. El redirect va fuera del try/catch de `withApi` porque
  // `redirect()` lanza NEXT_REDIRECT y allí se confundiría con un fallo.
  if (result.status === "success") {
    const target =
      requestedRedirect && requestedRedirect.startsWith("/admin/modules")
        ? requestedRedirect
        : "/admin/modules";
    redirect(target);
  }

  return result;
}

export async function updateDocumentAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return withApi(
    async (client) => {
      const documentId = requiredText(formData, "documentId", "El documento");
      const payload = documentMetadataPayload(formData);

      if (Object.keys(payload).length === 0) {
        throw new FormValidationError(
          "Ingresa al menos un campo para actualizar.",
        );
      }

      await client.updateDocument(documentId, payload);
      revalidatePath("/admin/documents", "layout");
      revalidatePath(`/admin/documents/${documentId}`);

      return { message: "Metadatos actualizados.", status: "success" };
    },
    { requireModulesAccess: true },
  );
}

export async function setDocumentStatusAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return withApi(
    async (client) => {
      const documentId = requiredText(formData, "documentId", "El documento");
      const isActive = formData.get("isActive") === "true";
      const reason = optionalText(formData, "reason");

      if (!isActive && !reason) {
        throw new FormValidationError("Indica el motivo de la desactivación.", "reason");
      }

      await client.setDocumentStatus(documentId, isActive, reason);
      revalidatePath("/admin/documents", "layout");
      revalidatePath(`/admin/documents/${documentId}`);

      return {
        message: isActive ? "Documento activado." : "Documento desactivado.",
        status: "success",
      };
    },
    { requireModulesAccess: true },
  );
}

export async function setDocumentSituationAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return withApi(
    async (client) => {
      const documentId = requiredText(formData, "documentId", "El documento");
      const situation = requiredText(formData, "situation", "La situación");
      const allowedSituations = ["archived", "current", "replaced"] as const;

      if (
        !allowedSituations.includes(
          situation as (typeof allowedSituations)[number],
        )
      ) {
        throw new FormValidationError("Selecciona una situación válida.", "situation");
      }

      const reason = optionalText(formData, "reason");
      const archiveReasonCode = optionalText(formData, "archiveReasonCode");
      const archiveReasonDetail = optionalText(formData, "archiveReasonDetail");
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
      const isReplacement =
        situation === "replaced" ||
        (situation === "archived" && archiveReasonCode === "REPLACED_BY_NEWER");

      if (situation === "archived" && !archiveReasonCode) {
        throw new FormValidationError("Selecciona el motivo del archivo.", "archiveReasonCode");
      }

      if (archiveReasonCode === "OTHER" && !archiveReasonDetail) {
        throw new FormValidationError("Especifica el motivo del archivo.", "archiveReasonDetail");
      }

      if (
        isReplacement &&
        (!reason || (!replacementDate && replacementYear === undefined))
      ) {
        throw new FormValidationError(
          "Indica el motivo y la fecha o año del reemplazo.",
          !reason ? "reason" : "replacementYear",
        );
      }

      await client.setDocumentSituation(documentId, {
        ...(archiveReasonCode ? { archiveReasonCode } : {}),
        ...(archiveReasonDetail ? { archiveReasonDetail } : {}),
        ...(observation ? { observation } : {}),
        ...(reason ? { reason } : {}),
        ...(replacementDate ? { replacementDate } : {}),
        ...(replacementDocumentId ? { replacementDocumentId } : {}),
        ...(replacementYear === undefined ? {} : { replacementYear }),
        situation: situation as (typeof allowedSituations)[number],
      });
      revalidatePath("/admin/documents", "layout");
      revalidatePath(`/admin/documents/${documentId}`);
      revalidatePath("/admin/modules", "layout");

      return {
        message: "Situación del documento actualizada.",
        status: "success",
      };
    },
    { requireModulesAccess: true },
  );
}

export async function setDocumentTechnicalStatusAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return withApi(
    async (client) => {
      const documentId = requiredText(formData, "documentId", "El documento");
      const technicalStatus = requiredText(
        formData,
        "technicalStatus",
        "El estado técnico",
      );
      if (
        technicalStatus !== "ready" &&
        technicalStatus !== "pending_approval"
      ) {
        throw new FormValidationError(
          "El estado Error solo puede asignarlo el procesamiento automático.",
          "technicalStatus",
        );
      }

      await client.setDocumentTechnicalStatus(documentId, technicalStatus);
      revalidatePath("/admin/documents", "layout");
      revalidatePath(`/admin/documents/${documentId}`);
      revalidatePath("/admin/modules", "layout");
      return { message: "Estado técnico actualizado.", status: "success" };
    },
    { requireModulesAccess: true },
  );
}

export async function deleteDocumentAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return withApi(
    async (client) => {
      const documentId = requiredText(formData, "documentId", "El documento");
      const reason = requiredText(formData, "reason", "El motivo de baja");
      await client.deleteDocument(documentId, reason);
      revalidatePath("/admin/documents", "layout");
      revalidatePath(`/admin/documents/${documentId}`);

      return { message: "Documento eliminado lógicamente.", status: "success" };
    },
    { requireModulesAccess: true },
  );
}

export async function linkDocumentModuleAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return withApi(
    async (client) => {
      const documentId = requiredText(formData, "documentId", "El documento");
      const moduleId = requiredText(formData, "moduleId", "El módulo");
      await client.linkDocumentModule(documentId, moduleId);
      revalidatePath(`/admin/documents/${documentId}`);
      revalidatePath("/admin/modules", "layout");

      return { message: "Módulo asociado.", status: "success" };
    },
    { requireModulesAccess: true },
  );
}

export async function unlinkDocumentModuleAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return withApi(
    async (client) => {
      const documentId = requiredText(formData, "documentId", "El documento");
      const moduleId = requiredText(formData, "moduleId", "El módulo");
      await client.unlinkDocumentModule(documentId, moduleId);
      revalidatePath(`/admin/documents/${documentId}`);
      revalidatePath("/admin/modules", "layout");

      return { message: "Módulo desvinculado.", status: "success" };
    },
    { requireModulesAccess: true },
  );
}

export async function createDownloadUrlAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return withApi(
    async (client) => {
      const documentId = requiredText(formData, "documentId", "El documento");
      const versionId = optionalText(formData, "versionId");
      const download = await client.getDownloadUrl(documentId, versionId);

      return {
        downloadUrl: download.url,
        message: "Enlace temporal generado por 60 segundos.",
        status: "success",
      };
    },
    { requireModulesAccess: true },
  );
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
      throw new FormValidationError("Selecciona una clasificación válida.", "classification");
    }

    if (decision !== "resolved" && decision !== "dismissed") {
      throw new FormValidationError("Selecciona una decisión válida.", "decision");
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
        throw new FormValidationError("Selecciona un estado de cuenta válido.", "accountStatus");
      }
      payload.accountStatus = accountStatus;
    }

    if (role && role !== "__keep__") {
      if (role !== "admin" && role !== "docente" && role !== "superadmin") {
        throw new FormValidationError("Selecciona un rol válido.", "role");
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

export async function createAdministrativeUserAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return withApi(async (client) => {
    const fullName = requiredText(formData, "fullName", "El nombre");
    const email = requiredText(formData, "email", "El correo electrónico");
    const phone = optionalText(formData, "phone");
    const role = optionalText(formData, "role");
    const startInput = optionalText(formData, "accessStartAt");
    const expiresInput = optionalText(formData, "accessExpiresAt");

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new FormValidationError(
        "Escribe un correo electrónico válido; es el usuario con el que iniciará sesión.",
        "email",
      );
    }

    const payload: {
      accessExpiresAt?: string;
      accessStartAt?: string;
      email: string;
      fullName: string;
      phone?: string;
      role?: "admin" | "docente" | "superadmin";
    } = { email, fullName };

    if (phone) {
      if (phone.length < 6 || phone.length > 20) {
        throw new FormValidationError(
          "El celular debe tener entre 6 y 20 caracteres.",
          "phone",
        );
      }
      payload.phone = phone;
    }

    if (role) {
      if (role !== "admin" && role !== "docente" && role !== "superadmin") {
        throw new FormValidationError("Selecciona un rol válido.", "role");
      }
      payload.role = role;
    }

    if (startInput) {
      const startInstant = accessStartInstant(startInput);
      if (!startInstant) {
        throw new FormValidationError("La fecha de inicio no es válida.", "accessStartAt");
      }
      payload.accessStartAt = startInstant;
    }

    if (expiresInput) {
      const expiryInstant = accessExpiryInstant(expiresInput);
      if (!expiryInstant) {
        throw new FormValidationError("La fecha de fin no es válida.", "accessExpiresAt");
      }
      if (Date.parse(expiryInstant) < Date.now()) {
        throw new FormValidationError(
          "La fecha de fin ya pasó. Elige una fecha de hoy en adelante.",
          "accessExpiresAt",
        );
      }
      payload.accessExpiresAt = expiryInstant;
    }

    if (
      payload.accessStartAt &&
      payload.accessExpiresAt &&
      Date.parse(payload.accessStartAt) > Date.parse(payload.accessExpiresAt)
    ) {
      throw new FormValidationError(
        "La fecha de inicio no puede ser posterior a la de fin.",
        "accessExpiresAt",
      );
    }

    await client.createAdministrativeUser(payload);
    revalidatePath("/admin");
    revalidatePath("/admin/users");

    return {
      message:
        "Usuario registrado. Recibirá un correo para crear su contraseña; la acción quedó auditada.",
      status: "success",
    };
  });
}

export async function updateAccessWindowAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return withApi(async (client) => {
    const userId = requiredText(formData, "userId", "El usuario");
    const reason = requiredText(formData, "reason", "El motivo");
    const startInput = optionalText(formData, "accessStartAt");
    const expiresInput = optionalText(formData, "accessExpiresAt");
    const payload: {
      accessExpiresAt?: string;
      accessStartAt?: string;
      reason: string;
    } = { reason };

    if (startInput) {
      const startInstant = accessStartInstant(startInput);
      if (!startInstant) {
        throw new FormValidationError("La fecha de inicio no es válida.", "accessStartAt");
      }
      payload.accessStartAt = startInstant;
    }

    if (expiresInput) {
      const expiryInstant = accessExpiryInstant(expiresInput);
      if (!expiryInstant) {
        throw new FormValidationError("La fecha de fin no es válida.", "accessExpiresAt");
      }
      // The database rejects a past expiry. Saying so here keeps the main flow
      // of the "Expirados" filter actionable instead of a generic API error.
      if (Date.parse(expiryInstant) < Date.now()) {
        throw new FormValidationError(
          "La fecha de fin ya pasó. Elige una fecha de hoy en adelante para extender la vigencia, o pausa la cuenta desde «Editar acceso» si quieres bloquear el acceso ahora.",
          "accessExpiresAt",
        );
      }
      payload.accessExpiresAt = expiryInstant;
    }

    if (
      payload.accessStartAt &&
      payload.accessExpiresAt &&
      Date.parse(payload.accessStartAt) > Date.parse(payload.accessExpiresAt)
    ) {
      throw new FormValidationError(
        "La fecha de inicio no puede ser posterior a la de fin.",
        "accessExpiresAt",
      );
    }

    await client.updateAdministrativeUserAccessWindow(userId, payload);
    revalidatePath("/admin");
    revalidatePath("/admin/users");

    return {
      message: "Vigencia actualizada. La acción quedó registrada.",
      status: "success",
    };
  });
}

export async function setAdminModulePermissionAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return withApi(async (client) => {
    const userId = requiredText(formData, "userId", "El administrador");
    const reason = requiredText(formData, "reason", "El motivo");
    const rawAccess = requiredText(formData, "canAccess", "El permiso");
    if (rawAccess !== "true" && rawAccess !== "false") {
      throw new FormValidationError("Selecciona un permiso válido.", "canAccess");
    }
    const canAccess = rawAccess === "true";
    await client.setAdminModulePermission(userId, canAccess, reason);
    revalidatePath("/admin");
    revalidatePath("/admin/users");
    return {
      message: canAccess
        ? "Acceso a Módulos habilitado."
        : "Acceso a Módulos retirado.",
      status: "success",
    };
  });
}
