import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  accessTokens: [] as string[],
  getCatalogDocumentDownloadUrl: vi.fn(),
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
    getCatalogDocumentDownloadUrl(versionId: string) {
      return mocks.getCatalogDocumentDownloadUrl(versionId);
    }
  }
  return { ChatApiClient, ChatApiError, ChatApiResponseError };
});

import { GET } from "./route";

const versionId = "9c8b56af-6d0c-4fef-881e-7c00907540dd";
const signedUrl =
  "https://storage.example.test/object/sign/anexo.pdf?token=short";

function request() {
  return new Request(
    `https://avend.example/api/chat/catalog/documents/${versionId}/download`,
  );
}

describe("chat catalog document download BFF", () => {
  beforeEach(() => {
    mocks.accessTokens.length = 0;
    mocks.getCatalogDocumentDownloadUrl.mockReset();
    mocks.resolveAuthorizedChatSession.mockReset();
  });

  it("rechaza una sesión ausente antes de consultar el API", async () => {
    mocks.resolveAuthorizedChatSession.mockResolvedValue({
      status: "unauthenticated",
    });

    const response = await GET(request(), {
      params: Promise.resolve({ versionId }),
    });

    expect(response.status).toBe(401);
    expect(mocks.accessTokens).toEqual([]);
  });

  it("usa la sesión verificada y redirige al enlace firmado", async () => {
    mocks.resolveAuthorizedChatSession.mockResolvedValue({
      access: { role: "docente", status: "authorized", userId: "user-1" },
      accessToken: "verified-token",
    });
    mocks.getCatalogDocumentDownloadUrl.mockResolvedValue({
      expiresAt: "2026-10-05T20:01:00.000Z",
      url: signedUrl,
      versionId,
    });

    const response = await GET(request(), {
      params: Promise.resolve({ versionId }),
    });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(signedUrl);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.accessTokens).toEqual(["verified-token"]);
    expect(mocks.getCatalogDocumentDownloadUrl).toHaveBeenCalledWith(versionId);
  });

  it("falla de forma cerrada con un identificador inválido o discordante", async () => {
    mocks.resolveAuthorizedChatSession.mockResolvedValue({
      access: { role: "docente", status: "authorized", userId: "user-1" },
      accessToken: "verified-token",
    });
    const invalid = await GET(request(), {
      params: Promise.resolve({ versionId: "invalid" }),
    });
    expect(invalid.status).toBe(404);

    mocks.getCatalogDocumentDownloadUrl.mockResolvedValue({
      expiresAt: "2026-10-05T20:01:00.000Z",
      url: signedUrl,
      versionId: "ac8b56af-6d0c-4fef-881e-7c00907540dd",
    });
    const mismatch = await GET(request(), {
      params: Promise.resolve({ versionId }),
    });
    expect(mismatch.status).toBe(502);
    expect(mismatch.headers.get("location")).toBeNull();
  });
});
