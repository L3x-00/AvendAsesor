import { revalidatePath, updateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminApiError } from "@/lib/admin-api/client";
import { createAuthorizedAdminApiClient } from "@/lib/admin-api/authorized-client";
import {
  createModuleAction,
  createDownloadUrlAction,
  deleteModuleAction,
  reviewUnansweredQuestionAction,
  setDocumentSituationAction,
  createAdministrativeUserAction,
  setModuleStatusAction,
  updateAccessWindowAction,
  updateAdministrativeUserAction,
  updateModuleAction,
} from "./actions";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock("@/lib/admin-api/authorized-client", () => ({
  createAuthorizedAdminApiClient: vi.fn(),
}));

const client = {
  createModule: vi.fn(),
  deleteModule: vi.fn(),
  getDownloadUrl: vi.fn(),
  reviewUnansweredQuestion: vi.fn(),
  setDocumentSituation: vi.fn(),
  setModuleStatus: vi.fn(),
  createAdministrativeUser: vi.fn(),
  updateAdministrativeUser: vi.fn(),
  updateAdministrativeUserAccessWindow: vi.fn(),
  updateModule: vi.fn(),
};

const initialState = { status: "idle" as const };

describe("admin server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.values(client).forEach((method) => method.mockReset());
    vi.mocked(createAuthorizedAdminApiClient).mockResolvedValue(
      client as never,
    );
  });

  it("validates required module fields before calling the API", async () => {
    const formData = new FormData();
    formData.set("name", "Módulo sin código");

    const state = await createModuleAction(initialState, formData);

    expect(state).toEqual({
      message: "El código es obligatorio.",
      status: "error",
    });
    expect(client.createModule).not.toHaveBeenCalled();
  });

  it("sends validated module data and invalidates the affected administrative lists", async () => {
    client.createModule.mockResolvedValue({});
    const formData = new FormData();
    formData.set("code", "TRAMITES");
    formData.set("description", "Procesos administrativos");
    formData.set("name", "Trámites");
    formData.set("sortOrder", "2");

    const state = await createModuleAction(initialState, formData);

    expect(client.createModule).toHaveBeenCalledWith({
      code: "TRAMITES",
      description: "Procesos administrativos",
      name: "Trámites",
      sortOrder: 2,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/modules", "layout");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/documents", "layout");
    expect(updateTag).toHaveBeenCalledWith("chat-modules");
    expect(client.createModule.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(updateTag).mock.invocationCallOrder[0],
    );
    expect(state.status).toBe("success");
  });

  it("requires a reason before deactivating a module", async () => {
    const formData = new FormData();
    formData.set("moduleId", "module-id");
    formData.set("isActive", "false");

    const state = await setModuleStatusAction(initialState, formData);

    expect(state).toEqual({
      message: "Indica el motivo de la desactivación.",
      status: "error",
    });
    expect(client.setModuleStatus).not.toHaveBeenCalled();
  });

  it("allows an existing submodule to become a root module explicitly", async () => {
    client.updateModule.mockResolvedValue({});
    const formData = new FormData();
    formData.set("moduleId", "module-id");
    formData.set("description", "Descripción actualizada");
    formData.set("parentModuleId", "__root__");

    const state = await updateModuleAction(initialState, formData);

    expect(client.updateModule).toHaveBeenCalledWith("module-id", {
      description: "Descripción actualizada",
      parentModuleId: null,
    });
    expect(updateTag).toHaveBeenCalledWith("chat-modules");
    expect(state.status).toBe("success");
  });

  it("allows an administrator to clear an existing module description", async () => {
    client.updateModule.mockResolvedValue({});
    const formData = new FormData();
    formData.set("moduleId", "module-id");
    formData.set("description", "");

    const state = await updateModuleAction(initialState, formData);

    expect(client.updateModule).toHaveBeenCalledWith("module-id", {
      description: null,
    });
    expect(updateTag).toHaveBeenCalledWith("chat-modules");
    expect(state.status).toBe("success");
  });

  it("invalidates the teacher module catalog after a successful status change", async () => {
    client.setModuleStatus.mockResolvedValue({});
    const formData = new FormData();
    formData.set("moduleId", "module-id");
    formData.set("isActive", "true");

    const state = await setModuleStatusAction(initialState, formData);

    expect(client.setModuleStatus).toHaveBeenCalledWith(
      "module-id",
      true,
      undefined,
    );
    expect(updateTag).toHaveBeenCalledWith("chat-modules");
    expect(state.status).toBe("success");
  });

  it("invalidates the teacher module catalog after a successful logical deletion", async () => {
    client.deleteModule.mockResolvedValue({});
    const formData = new FormData();
    formData.set("moduleId", "module-id");
    formData.set("reason", "Catálogo retirado");

    const state = await deleteModuleAction(initialState, formData);

    expect(client.deleteModule).toHaveBeenCalledWith(
      "module-id",
      "Catálogo retirado",
    );
    expect(updateTag).toHaveBeenCalledWith("chat-modules");
    expect(state.status).toBe("success");
  });

  it("does not invalidate the teacher catalog after rejected module mutations", async () => {
    const error = new AdminApiError(503);
    client.updateModule.mockRejectedValue(error);
    client.setModuleStatus.mockRejectedValue(error);
    client.deleteModule.mockRejectedValue(error);
    const updateData = new FormData();
    updateData.set("moduleId", "module-id");
    updateData.set("description", "Descripción pendiente");
    const statusData = new FormData();
    statusData.set("moduleId", "module-id");
    statusData.set("isActive", "true");
    const deleteData = new FormData();
    deleteData.set("moduleId", "module-id");
    deleteData.set("reason", "Catálogo retirado");

    const states = await Promise.all([
      updateModuleAction(initialState, updateData),
      setModuleStatusAction(initialState, statusData),
      deleteModuleAction(initialState, deleteData),
    ]);

    expect(states.every((state) => state.status === "error")).toBe(true);
    expect(updateTag).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns a safe confirmation-recovery message instead of backend details", async () => {
    client.createModule.mockRejectedValue(new AdminApiError(503));
    const formData = new FormData();
    formData.set("code", "NORMA");
    formData.set("name", "Normativa");

    const state = await createModuleAction(initialState, formData);

    expect(state).toEqual({
      message:
        "No se pudo confirmar el resultado. Actualiza el listado o detalle antes de volver a enviar esta operación.",
      status: "error",
    });
    expect(updateTag).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns the short-lived download URL only through the authenticated server action", async () => {
    client.getDownloadUrl.mockResolvedValue({
      url: "http://localhost:55321/storage/v1/object/sign/private.pdf?token=short-lived",
    });
    const formData = new FormData();
    formData.set("documentId", "document-id");
    formData.set("versionId", "version-id");

    const state = await createDownloadUrlAction(initialState, formData);

    expect(client.getDownloadUrl).toHaveBeenCalledWith(
      "document-id",
      "version-id",
    );
    expect(state).toEqual({
      downloadUrl:
        "http://localhost:55321/storage/v1/object/sign/private.pdf?token=short-lived",
      message: "Enlace temporal generado por 60 segundos.",
      status: "success",
    });
  });

  it("validates and submits a traceable document replacement", async () => {
    client.setDocumentSituation.mockResolvedValue({});
    const formData = new FormData();
    formData.set("documentId", "document-id");
    formData.set("situation", "replaced");
    formData.set("reason", "Nueva norma aplicable");
    formData.set("replacementYear", "2026");
    formData.set("observation", "Conservar para trazabilidad");

    const state = await setDocumentSituationAction(initialState, formData);

    expect(client.setDocumentSituation).toHaveBeenCalledWith("document-id", {
      observation: "Conservar para trazabilidad",
      reason: "Nueva norma aplicable",
      replacementYear: 2026,
      situation: "replaced",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/documents", "layout");
    expect(state.status).toBe("success");
  });

  it("rejects a replacement without a date or year", async () => {
    const formData = new FormData();
    formData.set("documentId", "document-id");
    formData.set("situation", "replaced");
    formData.set("reason", "Nueva norma aplicable");

    const state = await setDocumentSituationAction(initialState, formData);

    expect(state.status).toBe("error");
    expect(client.setDocumentSituation).not.toHaveBeenCalled();
  });

  it("validates and routes an unanswered-question review through the protected BFF client", async () => {
    client.reviewUnansweredQuestion.mockResolvedValue(undefined);
    const formData = new FormData();
    formData.set("questionId", "question-id");
    formData.set("category", "documentation_gap");
    formData.set("decision", "resolved");
    formData.set("reviewNote", "Se requiere ampliar el documento fuente.");

    const state = await reviewUnansweredQuestionAction(initialState, formData);

    expect(client.reviewUnansweredQuestion).toHaveBeenCalledWith(
      "question-id",
      {
        category: "documentation_gap",
        decision: "resolved",
        reviewNote: "Se requiere ampliar el documento fuente.",
      },
    );
    expect(revalidatePath).toHaveBeenCalledWith("/admin/operations");
    expect(state.status).toBe("success");
  });

  it("requires an actual role or status change before updating a user", async () => {
    const formData = new FormData();
    formData.set("userId", "user-id");
    formData.set("reason", "Prueba controlada");
    formData.set("role", "__keep__");
    formData.set("accountStatus", "__keep__");

    const state = await updateAdministrativeUserAction(initialState, formData);

    expect(state).toEqual({
      message: "Selecciona un rol o un estado para actualizar.",
      status: "error",
    });
    expect(client.updateAdministrativeUser).not.toHaveBeenCalled();
  });

  it("sends an access window as Lima day boundaries", async () => {
    client.updateAdministrativeUserAccessWindow.mockResolvedValue({});
    const formData = new FormData();
    formData.set("userId", "user-id");
    formData.set("reason", "Extensión autorizada");
    formData.set("accessStartAt", "2026-01-01");
    formData.set("accessExpiresAt", "2026-12-31");

    const state = await updateAccessWindowAction(initialState, formData);

    expect(state.status).toBe("success");
    expect(client.updateAdministrativeUserAccessWindow).toHaveBeenCalledWith(
      "user-id",
      {
        accessExpiresAt: "2027-01-01T04:59:59.999Z",
        accessStartAt: "2026-01-01T05:00:00.000Z",
        reason: "Extensión autorizada",
      },
    );
  });

  it("clears both dates when the window is left empty", async () => {
    client.updateAdministrativeUserAccessWindow.mockResolvedValue({});
    const formData = new FormData();
    formData.set("userId", "user-id");
    formData.set("reason", "Sin vigencia fija");
    formData.set("accessStartAt", "");
    formData.set("accessExpiresAt", "");

    const state = await updateAccessWindowAction(initialState, formData);

    expect(state.status).toBe("success");
    expect(client.updateAdministrativeUserAccessWindow).toHaveBeenCalledWith(
      "user-id",
      { reason: "Sin vigencia fija" },
    );
  });

  it("rejects an impossible calendar day before reaching the API", async () => {
    const formData = new FormData();
    formData.set("userId", "user-id");
    formData.set("reason", "Fecha inválida");
    formData.set("accessExpiresAt", "2026-02-30");

    const state = await updateAccessWindowAction(initialState, formData);

    expect(state).toEqual({
      message: "La fecha de fin no es válida.",
      status: "error",
    });
    expect(client.updateAdministrativeUserAccessWindow).not.toHaveBeenCalled();
  });

  it("registers a user with the window converted to Lima day boundaries", async () => {
    client.createAdministrativeUser.mockResolvedValue({});
    const formData = new FormData();
    formData.set("fullName", "  Nueva Docente  ");
    formData.set("email", "  nueva@example.test  ");
    formData.set("phone", "987654321");
    formData.set("role", "docente");
    formData.set("accessExpiresAt", "2027-12-31");

    const state = await createAdministrativeUserAction(initialState, formData);

    expect(state.status).toBe("success");
    expect(state.message).toMatch(/contraseña/i);
    expect(client.createAdministrativeUser).toHaveBeenCalledWith({
      accessExpiresAt: "2028-01-01T04:59:59.999Z",
      email: "nueva@example.test",
      fullName: "Nueva Docente",
      phone: "987654321",
      role: "docente",
    });
  });

  it("rejects an address that cannot be a login", async () => {
    const formData = new FormData();
    formData.set("fullName", "Nueva Docente");
    formData.set("email", "sin-arroba");

    const state = await createAdministrativeUserAction(initialState, formData);

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/correo electrónico válido/i);
    expect(client.createAdministrativeUser).not.toHaveBeenCalled();
  });

  it("explains a past expiry instead of letting the database reject it", async () => {
    const formData = new FormData();
    formData.set("userId", "user-id");
    formData.set("reason", "Extensión tardía");
    formData.set("accessExpiresAt", "2020-01-01");

    const state = await updateAccessWindowAction(initialState, formData);

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/ya pasó/);
    expect(state.message).toMatch(/pausa la cuenta/i);
    expect(client.updateAdministrativeUserAccessWindow).not.toHaveBeenCalled();
  });

  it("rejects a window that starts after it ends", async () => {
    const formData = new FormData();
    formData.set("userId", "user-id");
    formData.set("reason", "Rango invertido");
    formData.set("accessStartAt", "2027-12-31");
    formData.set("accessExpiresAt", "2027-01-01");

    const state = await updateAccessWindowAction(initialState, formData);

    expect(state).toEqual({
      message: "La fecha de inicio no puede ser posterior a la de fin.",
      status: "error",
    });
    expect(client.updateAdministrativeUserAccessWindow).not.toHaveBeenCalled();
  });
});
