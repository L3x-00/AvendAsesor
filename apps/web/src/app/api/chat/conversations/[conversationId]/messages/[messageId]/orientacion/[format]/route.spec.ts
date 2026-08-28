import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatConversationDetail } from "@/lib/chat-api/types";

const mocks = vi.hoisted(() => ({
  accessTokens: [] as string[],
  buildOrientationDocx: vi.fn(),
  buildOrientationPdf: vi.fn(),
  getConversation: vi.fn(),
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

    getConversation(conversationId: string) {
      return mocks.getConversation(conversationId);
    }
  }

  return { ChatApiClient, ChatApiError, ChatApiResponseError };
});

vi.mock("@/lib/orientation-document/builders", () => ({
  buildOrientationDocx: mocks.buildOrientationDocx,
  buildOrientationPdf: mocks.buildOrientationPdf,
}));

import { ChatApiError, ChatApiResponseError } from "@/lib/chat-api/client";
import { POST } from "./route";

const conversationId = "4c8b56af-6d0c-4fef-881e-7c00907540dd";
const messageId = "6c8b56af-6d0c-4fef-881e-7c00907540dd";
const questionId = "5c8b56af-6d0c-4fef-881e-7c00907540dd";
const sourceId = "9c8b56af-6d0c-4fef-881e-7c00907540dd";

function conversation(
  answer: Partial<ChatConversationDetail["messages"][number]> = {},
): ChatConversationDetail {
  return {
    conversation: {
      createdAt: "2026-08-24T12:00:00.000Z",
      id: conversationId,
      selectedModuleId: null,
      title: "Licencia docente",
      updatedAt: "2026-08-24T12:01:00.000Z",
    },
    messages: [
      {
        content: "¿Qué requisito debo presentar?",
        createdAt: "2026-08-24T12:00:00.000Z",
        id: questionId,
        inReplyToMessageId: null,
        role: "user",
        sources: [],
      },
      {
        content: "Respuesta confiable del servidor. [1]",
        createdAt: "2026-08-24T12:01:00.000Z",
        id: messageId,
        inReplyToMessageId: questionId,
        role: "assistant",
        sources: [
          {
            articleReference: "Artículo 5",
            documentTitle: "Norma oficial",
            id: sourceId,
            moduleName: "Licencias",
            numeralReference: null,
            pageEnd: 10,
            pageStart: 10,
            rank: 1,
            relevanceScore: 0.9,
            sectionTitle: "Requisitos",
            versionNumber: 1,
          },
        ],
        ...answer,
      },
    ],
  };
}

function request(formData = new FormData(), origin = "https://avend.example") {
  return new Request(
    `https://avend.example/api/chat/conversations/${conversationId}/messages/${messageId}/orientacion/docx`,
    { body: formData, headers: { Origin: origin }, method: "POST" },
  );
}

function routeParams(format = "docx") {
  return {
    params: Promise.resolve({ conversationId, format, messageId }),
  };
}

describe("orientation export route", () => {
  beforeEach(() => {
    vi.stubEnv("APP_URL", "https://avend.example");
    mocks.accessTokens.length = 0;
    mocks.buildOrientationDocx.mockReset();
    mocks.buildOrientationPdf.mockReset();
    mocks.getConversation.mockReset();
    mocks.resolveAuthorizedChatSession.mockReset();
    mocks.resolveAuthorizedChatSession.mockResolvedValue({
      access: {
        fullName: "María Pérez",
        role: "docente",
        status: "authorized",
        userId: "user-1",
      },
      accessToken: "verified-token",
    });
    mocks.getConversation.mockResolvedValue(conversation());
    mocks.buildOrientationDocx.mockResolvedValue(
      Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x01]),
    );
    mocks.buildOrientationPdf.mockResolvedValue(Buffer.from("%PDF-1.7\n%%EOF"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects cross-site mutations before resolving the session", async () => {
    const response = await POST(
      request(new FormData(), "https://attacker.example"),
      routeParams(),
    );

    expect(response.status).toBe(403);
    expect(mocks.resolveAuthorizedChatSession).not.toHaveBeenCalled();
    expect(mocks.getConversation).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request before reading conversation data", async () => {
    mocks.resolveAuthorizedChatSession.mockResolvedValue({
      status: "unauthenticated",
    });

    const response = await POST(request(), routeParams());

    expect(response.status).toBe(401);
    expect(mocks.getConversation).not.toHaveBeenCalled();
  });

  it("re-fetches trusted content and returns a sanitized DOCX attachment", async () => {
    const formData = new FormData();
    formData.set("caseNotes", "Nota adicional");
    formData.set("caseTitle", "<b>Caso / María</b>");
    formData.set("institution", "IE 123");
    formData.set("teacherName", "María Pérez");

    const response = await POST(request(formData), routeParams());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(response.headers.get("content-disposition")).toContain(
      'filename="bCaso-Maria-b.docx"',
    );
    expect(response.headers.get("content-disposition")).not.toMatch(/[\r\n]/);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x01]),
    );
    expect(mocks.accessTokens).toEqual(["verified-token"]);
    expect(mocks.getConversation).toHaveBeenCalledWith(conversationId);
    expect(mocks.buildOrientationDocx).toHaveBeenCalledWith(
      expect.objectContaining({
        answer: "Respuesta confiable del servidor. [1]",
        documentTitle: "bCaso / María/b",
        institution: "IE 123",
        question: "¿Qué requisito debo presentar?",
        teacherName: "María Pérez",
      }),
    );
  });

  it("returns a real PDF media contract for the PDF format", async () => {
    const response = await POST(request(), routeParams("pdf"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain(".pdf");
    expect(Buffer.from(await response.arrayBuffer()).toString()).toContain(
      "%PDF-",
    );
    expect(mocks.buildOrientationPdf).toHaveBeenCalledOnce();
    expect(mocks.buildOrientationPdf).toHaveBeenCalledWith(
      expect.objectContaining({ teacherName: "" }),
    );
    expect(mocks.buildOrientationDocx).not.toHaveBeenCalled();
  });

  it("rejects client-supplied answer fields instead of trusting them", async () => {
    const formData = new FormData();
    formData.set("answer", "Contenido manipulado");

    const response = await POST(request(formData), routeParams());

    expect(response.status).toBe(400);
    expect(mocks.getConversation).not.toHaveBeenCalled();
    expect(mocks.buildOrientationDocx).not.toHaveBeenCalled();
  });

  it("rejects an oversized presentation body before parsing multipart data", async () => {
    const oversized = new Request(
      `https://avend.example/api/chat/conversations/${conversationId}/messages/${messageId}/orientacion/docx`,
      {
        body: new FormData(),
        headers: {
          "Content-Length": "25001",
          Origin: "https://avend.example",
        },
        method: "POST",
      },
    );

    const response = await POST(oversized, routeParams());

    expect(response.status).toBe(413);
    expect(mocks.getConversation).not.toHaveBeenCalled();
  });

  it("rejects an oversized streamed body without trusting Content-Length", async () => {
    const formData = new FormData();
    formData.set("caseNotes", "x".repeat(30_000));
    const oversized = request(formData);

    expect(oversized.headers.get("content-length")).toBeNull();
    const response = await POST(oversized, routeParams());

    expect(response.status).toBe(413);
    expect(mocks.getConversation).not.toHaveBeenCalled();
  });

  it("rejects unsupported export formats", async () => {
    const response = await POST(request(), routeParams("html"));

    expect(response.status).toBe(400);
    expect(mocks.getConversation).not.toHaveBeenCalled();
  });

  it.each([
    [conversation({ sources: [] }), 404],
    [conversation({ role: "clarification" }), 404],
    [
      {
        ...conversation(),
        conversation: {
          ...conversation().conversation,
          id: crypto.randomUUID(),
        },
      },
      404,
    ],
  ])(
    "rejects an ineligible or foreign conversation",
    async (detail, status) => {
      mocks.getConversation.mockResolvedValue(detail);

      const response = await POST(request(), routeParams());

      expect(response.status).toBe(status);
      expect(mocks.buildOrientationDocx).not.toHaveBeenCalled();
    },
  );

  it.each([
    [new ChatApiError(404), 404],
    [new ChatApiError(500), 502],
    [new ChatApiResponseError(), 502],
    [new Error("offline"), 503],
  ])("maps upstream errors without leaking details", async (error, status) => {
    mocks.getConversation.mockRejectedValue(error);

    const response = await POST(request(), routeParams());

    expect(response.status).toBe(status);
    expect(await response.text()).not.toContain("offline");
  });
});
