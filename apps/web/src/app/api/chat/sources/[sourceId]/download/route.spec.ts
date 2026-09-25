import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  accessTokens: [] as string[],
  getSourceDownloadUrl: vi.fn(),
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

    getSourceDownloadUrl(sourceId: string) {
      return mocks.getSourceDownloadUrl(sourceId);
    }
  }

  return { ChatApiClient, ChatApiError, ChatApiResponseError };
});

import { ChatApiError, ChatApiResponseError } from "@/lib/chat-api/client";
import { GET } from "./route";

const sourceId = "9c8b56af-6d0c-4fef-881e-7c00907540dd";
const signedUrl =
  "https://storage.example.test/object/sign/document.pdf?token=short-lived";

function request() {
  return new Request(
    `https://avend.example/api/chat/sources/${sourceId}/download`,
  );
}

describe("chat source download BFF", () => {
  beforeEach(() => {
    mocks.accessTokens.length = 0;
    mocks.getSourceDownloadUrl.mockReset();
    mocks.resolveAuthorizedChatSession.mockReset();
  });

  it("rejects unauthenticated requests before constructing an API client", async () => {
    mocks.resolveAuthorizedChatSession.mockResolvedValue({
      status: "unauthenticated",
    });

    const response = await GET(request(), {
      params: Promise.resolve({ sourceId }),
    });

    expect(response.status).toBe(401);
    expect(mocks.accessTokens).toEqual([]);
    expect(await response.json()).toEqual({ error: "SOURCE_UNAVAILABLE" });
  });

  it("uses the verified server token and redirects without returning it in a body", async () => {
    mocks.resolveAuthorizedChatSession.mockResolvedValue({
      access: { role: "docente", status: "authorized", userId: "user-1" },
      accessToken: "verified-token",
    });
    mocks.getSourceDownloadUrl.mockResolvedValue({
      expiresAt: "2026-08-27T12:01:00.000Z",
      sourceId,
      url: signedUrl,
    });

    const response = await GET(request(), {
      params: Promise.resolve({ sourceId }),
    });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(signedUrl);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await response.text()).toBe("");
    expect(mocks.accessTokens).toEqual(["verified-token"]);
    expect(mocks.getSourceDownloadUrl).toHaveBeenCalledWith(sourceId);
  });

  it("fails closed for invalid IDs or a mismatched upstream source", async () => {
    mocks.resolveAuthorizedChatSession.mockResolvedValue({
      access: { role: "docente", status: "authorized", userId: "user-1" },
      accessToken: "verified-token",
    });

    const invalid = await GET(request(), {
      params: Promise.resolve({ sourceId: "not-a-uuid" }),
    });
    expect(invalid.status).toBe(404);
    expect(mocks.getSourceDownloadUrl).not.toHaveBeenCalled();

    mocks.getSourceDownloadUrl.mockResolvedValue({
      expiresAt: "2026-08-27T12:01:00.000Z",
      sourceId: "ac8b56af-6d0c-4fef-881e-7c00907540dd",
      url: signedUrl,
    });
    const mismatch = await GET(request(), {
      params: Promise.resolve({ sourceId }),
    });
    expect(mismatch.status).toBe(502);
    expect(mismatch.headers.get("location")).toBeNull();
  });

  it.each([
    [new ChatApiError(404), 404],
    [new ChatApiError(500), 502],
    [new ChatApiResponseError(), 502],
    [new Error("offline"), 503],
  ])("maps upstream failures to safe status codes", async (error, status) => {
    mocks.resolveAuthorizedChatSession.mockResolvedValue({
      access: { role: "docente", status: "authorized", userId: "user-1" },
      accessToken: "verified-token",
    });
    mocks.getSourceDownloadUrl.mockRejectedValue(error);

    const response = await GET(request(), {
      params: Promise.resolve({ sourceId }),
    });

    expect(response.status).toBe(status);
    expect(await response.text()).not.toContain("offline");
  });
});

describe("chat source download BFF — experiencia del usuario", () => {
  beforeEach(() => {
    mocks.accessTokens.length = 0;
    mocks.getSourceDownloadUrl.mockReset();
    mocks.resolveAuthorizedChatSession.mockReset();
    mocks.resolveAuthorizedChatSession.mockResolvedValue({
      access: { role: "docente", status: "authorized", userId: "user-1" },
      accessToken: "verified-token",
    });
  });

  it("opens the cited page of the document", async () => {
    mocks.getSourceDownloadUrl.mockResolvedValue({
      expiresAt: "2026-08-27T12:01:00.000Z",
      sourceId,
      url: signedUrl,
    });

    const response = await GET(
      new Request(
        `https://avend.example/api/chat/sources/${sourceId}/download?pagina=45`,
      ),
      { params: Promise.resolve({ sourceId }) },
    );

    expect(response.headers.get("location")).toBe(`${signedUrl}#page=45`);
  });

  it("ignores an invalid page instead of failing", async () => {
    mocks.getSourceDownloadUrl.mockResolvedValue({
      expiresAt: "2026-08-27T12:01:00.000Z",
      sourceId,
      url: signedUrl,
    });

    const response = await GET(
      new Request(
        `https://avend.example/api/chat/sources/${sourceId}/download?pagina=9999`,
      ),
      { params: Promise.resolve({ sourceId }) },
    );

    expect(response.headers.get("location")).toBe(signedUrl);
  });

  it("shows a plain-language page when a browser tab cannot open the document", async () => {
    mocks.getSourceDownloadUrl.mockRejectedValue(new ChatApiError(404));

    const response = await GET(
      new Request(
        `https://avend.example/api/chat/sources/${sourceId}/download`,
        {
          headers: { accept: "text/html,application/xhtml+xml" },
        },
      ),
      { params: Promise.resolve({ sourceId }) },
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("text/html");
    const body = await response.text();
    expect(body).toContain("Este documento ya no está disponible");
    expect(body).not.toContain("SOURCE_NOT_AVAILABLE");
  });
});
