import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminApiError } from "@/lib/admin-api/client";
import { createAuthorizedAdminApiClient } from "@/lib/admin-api/authorized-client";
import {
  createDocumentAction,
  createModuleAction,
  createDownloadUrlAction,
  reviewUnansweredQuestionAction,
  setModuleStatusAction,
  updateAdministrativeUserAction,
  updateModuleAction,
} from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/admin-api/authorized-client", () => ({
  createAuthorizedAdminApiClient: vi.fn(),
}));

const client = {
  createDocument: vi.fn(),
  createModule: vi.fn(),
  getDownloadUrl: vi.fn(),
  reviewUnansweredQuestion: vi.fn(),
  setModuleStatus: vi.fn(),
  updateAdministrativeUser: vi.fn(),
  updateModule: vi.fn(),
};

const initialState = { status: "idle" as const };

describe("admin server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(revalidatePath).toHaveBeenCalledWith("/admin/modules");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/documents");
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
    formData.set("parentModuleId", "__root__");

    const state = await updateModuleAction(initialState, formData);

    expect(client.updateModule).toHaveBeenCalledWith("module-id", {
      parentModuleId: null,
    });
    expect(state.status).toBe("success");
  });

  it("refuses a document upload without a non-empty PDF", async () => {
    const formData = new FormData();
    formData.set("documentType", "NORMA");
    formData.set("title", "Documento de prueba");

    const state = await createDocumentAction(initialState, formData);

    expect(state).toEqual({
      message: "Selecciona un archivo PDF no vacío.",
      status: "error",
    });
    expect(client.createDocument).not.toHaveBeenCalled();
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
});
