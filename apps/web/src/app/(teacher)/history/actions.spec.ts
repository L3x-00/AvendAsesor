import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthorizedChatApiClient } from "@/lib/chat-api/authorized-client";
import { ChatApiError, type ChatApiClient } from "@/lib/chat-api/client";
import { deleteConversationAction } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/chat-api/authorized-client", () => ({
  createAuthorizedChatApiClient: vi.fn(),
}));

const CONVERSATION_ID = "4c8b56af-6d0c-4fef-881e-7c00907540dd";
const deleteConversation = vi.fn();

describe("deleteConversationAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteConversation.mockResolvedValue(undefined);
    vi.mocked(createAuthorizedChatApiClient).mockResolvedValue({
      deleteConversation,
    } as unknown as ChatApiClient);
  });

  it("quita la conversación sin revalidar toda la ruta desde la acción", async () => {
    await expect(deleteConversationAction(CONVERSATION_ID)).resolves.toEqual({
      status: "removed",
    });
    expect(deleteConversation).toHaveBeenCalledWith(CONVERSATION_ID);
    // revalidatePath forzaba un render completo dentro de la respuesta.
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("acepta identificadores UUID de cualquier versión (el seed demo usa v5)", async () => {
    const v5 = "6ba7b810-9dad-51d1-80b4-00c04fd430c8";
    await expect(deleteConversationAction(v5)).resolves.toEqual({
      status: "removed",
    });
  });

  it("rechaza un identificador manipulado sin llamar al API", async () => {
    for (const value of [undefined, "", "../modules", `${CONVERSATION_ID}/x`]) {
      await expect(deleteConversationAction(value)).resolves.toMatchObject({
        status: "error",
      });
    }
    expect(createAuthorizedChatApiClient).not.toHaveBeenCalled();
    expect(deleteConversation).not.toHaveBeenCalled();
  });

  it("si ya no existía (404), lo trata como quitado: nada que recargar a mano", async () => {
    deleteConversation.mockRejectedValueOnce(new ChatApiError(404));
    await expect(deleteConversationAction(CONVERSATION_ID)).resolves.toEqual({
      status: "already-removed",
    });
  });

  it("explica la falta de permiso (403)", async () => {
    deleteConversation.mockRejectedValueOnce(new ChatApiError(403));
    await expect(deleteConversationAction(CONVERSATION_ID)).resolves.toEqual({
      message: "No tienes permiso para quitar esta consulta.",
      status: "error",
    });
  });

  it("ante un fallo del servicio (429, 5xx, red) responde con un mensaje propio, sin lanzar", async () => {
    for (const failure of [
      new ChatApiError(429),
      new ChatApiError(503),
      new TypeError("fetch failed"),
    ]) {
      deleteConversation.mockRejectedValueOnce(failure);
      await expect(deleteConversationAction(CONVERSATION_ID)).resolves.toEqual({
        message:
          "No pudimos quitar esta consulta en este momento. Inténtalo de nuevo en unos segundos.",
        status: "error",
      });
    }
  });

  it("no se traga la redirección por sesión caducada o acceso revocado", async () => {
    vi.mocked(createAuthorizedChatApiClient).mockImplementationOnce(() =>
      redirect("/login?reason=expired"),
    );

    await expect(deleteConversationAction(CONVERSATION_ID)).rejects.toThrow(
      "NEXT_REDIRECT",
    );
  });

  it("tampoco se traga una redirección que ocurra durante el borrado", async () => {
    deleteConversation.mockImplementationOnce(() => redirect("/access-denied"));

    await expect(deleteConversationAction(CONVERSATION_ID)).rejects.toThrow(
      "NEXT_REDIRECT",
    );
  });
});
