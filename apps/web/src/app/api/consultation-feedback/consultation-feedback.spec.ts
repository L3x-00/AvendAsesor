import { File as NodeFile } from "node:buffer";
import { NextRequest } from "next/server";
import { FormData as UndiciFormData, Response as UndiciResponse } from "undici";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminApiUrl: vi.fn(() => "http://localhost:3001"),
  hasTrustedRequestOrigin: vi.fn(() => true),
  resolveAuthorizedChatSession: vi.fn(),
}));

vi.mock("@/lib/admin-api/config", () => ({
  getAdminApiUrl: mocks.getAdminApiUrl,
}));
vi.mock("@/lib/auth/site-url", () => ({
  hasTrustedRequestOrigin: mocks.hasTrustedRequestOrigin,
}));
vi.mock("@/lib/chat-api/authorized-client", () => ({
  resolveAuthorizedChatSession: mocks.resolveAuthorizedChatSession,
}));

import { POST as postReport } from "./reports/route";
import { POST as postSuggestion } from "./suggestions/route";

const answerMessageId = "29000000-0000-4000-8000-000000000001";
const conversationId = "29000000-0000-4000-8000-000000000002";
const submissionId = "29000000-0000-4000-8000-000000000003";
const boundary = "----avend-feedback-bff-test";

function feedbackRequest(
  path: string,
  fields: Record<string, string>,
  file?: { content: string; name: string; type: string },
): NextRequest {
  const parts = Object.entries(fields).flatMap(([name, value]) => [
    `--${boundary}`,
    `Content-Disposition: form-data; name="${name}"`,
    "",
    value,
  ]);
  if (file) {
    parts.push(
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="${file.name}"`,
      `Content-Type: ${file.type}`,
      "",
      file.content,
    );
  }
  parts.push(`--${boundary}--`, "");
  return new NextRequest(`https://avend.example${path}`, {
    body: parts.join("\r\n"),
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
      origin: "https://avend.example",
    },
    method: "POST",
  });
}

describe("consultation feedback BFF routes", () => {
  beforeEach(() => {
    mocks.getAdminApiUrl.mockClear();
    mocks.hasTrustedRequestOrigin.mockReset();
    mocks.hasTrustedRequestOrigin.mockReturnValue(true);
    mocks.resolveAuthorizedChatSession.mockReset();
    mocks.resolveAuthorizedChatSession.mockResolvedValue({
      access: { role: "docente", status: "authorized", userId: "teacher-1" },
      accessToken: "verified-token",
    });
    vi.unstubAllGlobals();
    vi.stubGlobal("File", NodeFile);
    vi.stubGlobal("FormData", UndiciFormData);
    vi.stubGlobal("Response", UndiciResponse);
  });

  it("rejects an untrusted origin before resolving a session", async () => {
    mocks.hasTrustedRequestOrigin.mockReturnValue(false);

    const response = await postReport(
      feedbackRequest("/api/consultation-feedback/reports", {}),
    );

    expect(response.status).toBe(403);
    expect(mocks.resolveAuthorizedChatSession).not.toHaveBeenCalled();
  });

  it("forwards a valid report as bounded multipart with only the server token", async () => {
    const request = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", request);

    const response = await postReport(
      feedbackRequest(
        "/api/consultation-feedback/reports",
        {
          answerMessageId,
          comment: "La cita no cubre este supuesto.",
          reason: "citation_does_not_support",
          submissionId,
        },
        { content: "png", name: "captura.png", type: "image/png" },
      ),
    );

    expect(response.status).toBe(200);
    expect(request).toHaveBeenCalledWith(
      "http://localhost:3001/consultation-cases/reports",
      expect.objectContaining({
        credentials: "omit",
        headers: { Authorization: "Bearer verified-token" },
        method: "POST",
      }),
    );
    const [, options] = request.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const forwarded = options.body as FormData;
    expect(forwarded.get("answerMessageId")).toBe(answerMessageId);
    expect(forwarded.get("file")).not.toBeNull();
  });

  it("rejects an invalid report attachment before forwarding it", async () => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);

    const response = await postReport(
      feedbackRequest(
        "/api/consultation-feedback/reports",
        { answerMessageId, reason: "other", submissionId },
        { content: "pdf", name: "norma.pdf", type: "application/pdf" },
      ),
    );

    expect(response.status).toBe(400);
    expect(request).not.toHaveBeenCalled();
  });

  it("forwards a suggestion document and maps upstream errors without leaking them", async () => {
    const request = vi.fn(async () => new Response("internal", { status: 500 }));
    vi.stubGlobal("fetch", request);

    const response = await postSuggestion(
      feedbackRequest(
        "/api/consultation-feedback/suggestions",
        {
          comment: "Adjunto una norma para verificar.",
          conversationId,
          submissionId,
        },
        { content: "%PDF", name: "norma.pdf", type: "application/pdf" },
      ),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "SUGGESTION_NOT_SAVED" });
    const [, options] = request.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const forwarded = options.body as FormData;
    expect(forwarded.get("conversationId")).toBe(conversationId);
    expect(forwarded.get("file")).not.toBeNull();
  });
});
