import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthorizedConsultationReportsApiContext } from "@/lib/consultation-reports-api/authorized-client";
import {
  closeConsultationCaseAction,
  updateConsultationCaseAction,
} from "./consultation-actions";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    // Reproduce el comportamiento real: `redirect()` corta el flujo lanzando.
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/consultation-reports-api/authorized-client", () => ({
  createAuthorizedConsultationReportsApiContext: vi.fn(),
}));

const client = {
  resolveGroup: vi.fn(),
  updateCase: vi.fn(),
};

const initialState = { status: "idle" as const };
const caseId = "62f7c1c6-2a44-4a63-8a8a-8f1c5b3f0f11";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

describe("acciones administrativas de consultas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.values(client).forEach((method) => method.mockReset());
    vi.mocked(createAuthorizedConsultationReportsApiContext).mockResolvedValue({
      client,
    } as never);
  });

  it("envía el estado observado al cambiar el estado del caso", async () => {
    client.updateCase.mockResolvedValue(undefined);

    await updateConsultationCaseAction(
      initialState,
      form({
        caseId,
        expectedStatus: "pending",
        note: "Revisado.",
        status: "in_review",
      }),
    );

    expect(client.updateCase).toHaveBeenCalledWith(caseId, {
      expectedStatus: "pending",
      note: "Revisado.",
      status: "in_review",
    });
  });

  it("permite una nota sin condición de estado", async () => {
    client.updateCase.mockResolvedValue(undefined);

    await updateConsultationCaseAction(
      initialState,
      form({ caseId, note: "Dato adicional." }),
    );

    expect(client.updateCase).toHaveBeenCalledWith(caseId, {
      note: "Dato adicional.",
    });
  });

  it("no cambia el estado si la página no informa cuál se vio", async () => {
    const result = await updateConsultationCaseAction(
      initialState,
      form({ caseId, status: "resolved" }),
    );

    expect(client.updateCase).not.toHaveBeenCalled();
    expect(result.status).toBe("error");
    expect(result.message).toContain("Actualiza la página");
  });

  it("exige el estado observado para cerrar la consulta", async () => {
    const result = await closeConsultationCaseAction(
      initialState,
      form({ caseId, status: "resolved" }),
    );

    expect(client.updateCase).not.toHaveBeenCalled();
    expect(result.status).toBe("error");
    expect(result.message).toContain("Actualiza la página");
  });

  it("cierra la consulta con el estado observado", async () => {
    client.updateCase.mockResolvedValue(undefined);

    await expect(
      closeConsultationCaseAction(
        initialState,
        form({
          caseId,
          expectedStatus: "in_review",
          note: "Documento cargado.",
          status: "resolved",
        }),
      ),
    ).rejects.toThrow(`NEXT_REDIRECT:/admin/operations/${caseId}`);

    expect(client.updateCase).toHaveBeenCalledWith(caseId, {
      expectedStatus: "in_review",
      note: "Documento cargado.",
      status: "resolved",
    });
    expect(redirect).toHaveBeenCalledWith(`/admin/operations/${caseId}`);
  });
});
