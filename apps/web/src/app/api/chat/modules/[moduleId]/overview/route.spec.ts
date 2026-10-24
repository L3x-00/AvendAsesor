import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  accessTokens: [] as string[],
  prepareModuleContext: vi.fn(),
  resolveAuthorizedChatSession: vi.fn(),
}));

vi.mock("@/lib/chat-api/authorized-client", () => ({
  resolveAuthorizedChatSession: mocks.resolveAuthorizedChatSession,
}));

vi.mock("@/lib/chat-api/client", () => {
  class ChatApiError extends Error {
    constructor(readonly status: number) {
      super("Chat API request failed.");
    }
  }

  class ChatApiResponseError extends Error {}

  class ChatApiClient {
    constructor(accessToken: string) {
      mocks.accessTokens.push(accessToken);
    }

    prepareModuleContext(moduleId: string) {
      return mocks.prepareModuleContext(moduleId);
    }
  }

  return { ChatApiClient, ChatApiError, ChatApiResponseError };
});

import { ChatApiError, ChatApiResponseError } from "@/lib/chat-api/client";
import { GET } from "./route";

const moduleId = "9c8b56af-6d0c-4fef-881e-7c00907540dd";

function call(id = moduleId) {
  return GET(
    new Request(`https://avend.example/api/chat/modules/${id}/overview`),
    { params: Promise.resolve({ moduleId: id }) },
  );
}

describe("chat module overview BFF", () => {
  beforeEach(() => {
    mocks.accessTokens.length = 0;
    mocks.prepareModuleContext.mockReset();
    mocks.resolveAuthorizedChatSession.mockResolvedValue({
      accessToken: "token-1",
    });
  });

  it("prepara el contexto del tema con la sesión del docente sin devolver el resumen", async () => {
    mocks.prepareModuleContext.mockResolvedValue(undefined);

    const response = await call();

    expect(response.status).toBe(204);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.accessTokens).toEqual(["token-1"]);
    expect(mocks.prepareModuleContext).toHaveBeenCalledWith(moduleId);
  });

  it("exige una sesión autorizada", async () => {
    mocks.resolveAuthorizedChatSession.mockResolvedValueOnce({
      status: "unauthenticated",
    });
    expect((await call()).status).toBe(401);

    mocks.resolveAuthorizedChatSession.mockResolvedValueOnce({
      status: "forbidden",
    });
    expect((await call()).status).toBe(403);
    expect(mocks.prepareModuleContext).not.toHaveBeenCalled();
  });

  it("rechaza identificadores inválidos sin llamar a la API", async () => {
    expect((await call("no-es-uuid")).status).toBe(404);
    expect(mocks.prepareModuleContext).not.toHaveBeenCalled();
  });

  it.each([
    [new ChatApiError(401), 401],
    [new ChatApiError(403), 403],
    [new ChatApiError(404), 404],
    [new ChatApiError(500), 502],
    [new ChatApiResponseError(), 502],
    [new Error("network"), 503],
  ])("traduce el fallo %s a %i sin exponer detalles", async (error, status) => {
    mocks.prepareModuleContext.mockRejectedValue(error);

    const response = await call();

    expect(response.status).toBe(status);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
