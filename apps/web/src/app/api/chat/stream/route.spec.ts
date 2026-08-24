import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminApiUrl: vi.fn(() => "http://localhost:3001"),
  resolveAuthorizedChatSession: vi.fn(),
}));

vi.mock("@/lib/admin-api/config", () => ({
  getAdminApiUrl: mocks.getAdminApiUrl,
}));
vi.mock("@/lib/chat-api/authorized-client", () => ({
  resolveAuthorizedChatSession: mocks.resolveAuthorizedChatSession,
}));

import { POST } from "./route";

describe("chat stream BFF route", () => {
  beforeEach(() => {
    mocks.resolveAuthorizedChatSession.mockReset();
    vi.unstubAllGlobals();
  });

  it("rejects an unauthenticated request before calling the API", async () => {
    mocks.resolveAuthorizedChatSession.mockResolvedValue({
      status: "unauthenticated",
    });

    const response = await POST(
      new NextRequest("https://avend.example/api/chat/stream", {
        body: JSON.stringify({ question: "Consulta" }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
  });

  it("forwards only valid requests with the server-side session token", async () => {
    mocks.resolveAuthorizedChatSession.mockResolvedValue({
      access: { role: "docente", status: "authorized", userId: "user-1" },
      accessToken: "verified-token",
    });
    const request = vi.fn(
      async () => new Response("event: done\ndata: {}\n\n", { status: 200 }),
    );
    vi.stubGlobal("fetch", request);

    const response = await POST(
      new NextRequest("https://avend.example/api/chat/stream", {
        body: JSON.stringify({ question: "Consulta válida" }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(request).toHaveBeenCalledWith(
      "http://localhost:3001/chat/stream",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer verified-token",
        }),
      }),
    );
  });
});
