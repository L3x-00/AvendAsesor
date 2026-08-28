import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChatApiClient, ChatApiResponseError } from "./client";

const modulePayload = [
  {
    code: "LICENSES",
    id: "4c8b56af-6d0c-4fef-881e-7c00907540dd",
    name: "Licencias",
    parentModuleId: null,
    sortOrder: 0,
  },
];

describe("ChatApiClient", () => {
  beforeEach(() => {
    process.env.ADMIN_API_URL = "http://localhost:3001";
  });

  it("uses only a server-provided bearer token and validates modules", async () => {
    const request = vi.fn(
      async () => new Response(JSON.stringify(modulePayload), { status: 200 }),
    );
    const client = new ChatApiClient("verified-token", undefined, request);

    await expect(client.listModules()).resolves.toEqual(modulePayload);
    expect(request).toHaveBeenCalledWith(
      "http://localhost:3001/chat/modules",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer verified-token",
        }),
        next: { revalidate: 120, tags: ["chat-modules"] },
      }),
    );
  });

  it("validates the owned source download contract and never caches signed URLs", async () => {
    const sourceId = "9c8b56af-6d0c-4fef-881e-7c00907540dd";
    const payload = {
      expiresAt: "2026-08-27T12:01:00.000Z",
      sourceId,
      url: "https://storage.example.test/object/sign/document.pdf?token=short-lived",
    };
    const request = vi.fn(
      async () => new Response(JSON.stringify(payload), { status: 200 }),
    );
    const client = new ChatApiClient("verified-token", undefined, request);

    await expect(client.getSourceDownloadUrl(sourceId)).resolves.toEqual(payload);
    expect(request).toHaveBeenCalledWith(
      `http://localhost:3001/chat/sources/${sourceId}/download-url`,
      expect.objectContaining({ cache: "no-store", method: "GET" }),
    );
  });

  it("fails closed for non-HTTP source URLs or extra response fields", async () => {
    const sourceId = "9c8b56af-6d0c-4fef-881e-7c00907540dd";
    const client = new ChatApiClient(
      "verified-token",
      undefined,
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            expiresAt: "2026-08-27T12:01:00.000Z",
            leakedPath: "private/document.pdf",
            sourceId,
            url: "javascript:alert(1)",
          }),
        ),
      ),
    );

    await expect(client.getSourceDownloadUrl(sourceId)).rejects.toBeInstanceOf(
      ChatApiResponseError,
    );
  });

  it("fails closed when the upstream chat response violates its contract", async () => {
    const client = new ChatApiClient(
      "verified-token",
      undefined,
      vi.fn(async () => new Response(JSON.stringify([{ id: "invalid" }]))),
    );

    await expect(client.listModules()).rejects.toBeInstanceOf(
      ChatApiResponseError,
    );
  });

  it("uses the owned history routes and preserves an upstream status safely", async () => {
    const conversation = {
      createdAt: "2026-08-22T00:00:00.000Z",
      id: "4c8b56af-6d0c-4fef-881e-7c00907540dd",
      selectedModuleId: null,
      title: "Consulta",
      updatedAt: "2026-08-22T00:00:00.000Z",
    };
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [conversation],
            nextCursor: "eyJpZCI6Im5leHQifQ",
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ conversation, messages: [] })),
      )
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    const client = new ChatApiClient("verified-token", undefined, request);

    await expect(
      client.listConversations({ cursor: "eyJpZCI6ImN1cnNvciJ9" }),
    ).resolves.toEqual({
      items: [conversation],
      nextCursor: "eyJpZCI6Im5leHQifQ",
    });
    expect(request.mock.calls[0]?.[0]).toBe(
      "http://localhost:3001/chat/conversations?cursor=eyJpZCI6ImN1cnNvciJ9",
    );
    await expect(client.getConversation(conversation.id)).resolves.toEqual({
      conversation,
      messages: [],
    });
    await expect(client.getConversation(conversation.id)).rejects.toMatchObject(
      {
        status: 404,
      },
    );
  });

  it("deletes only through the protected owned-conversation route", async () => {
    const request = vi.fn(async () => new Response(null, { status: 200 }));
    const client = new ChatApiClient("verified-token", undefined, request);

    await expect(
      client.deleteConversation("4c8b56af-6d0c-4fef-881e-7c00907540dd"),
    ).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledWith(
      "http://localhost:3001/chat/conversations/4c8b56af-6d0c-4fef-881e-7c00907540dd",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("fails closed for a non-JSON upstream body", async () => {
    const client = new ChatApiClient(
      "verified-token",
      undefined,
      vi.fn(async () => new Response("not json", { status: 200 })),
    );

    await expect(client.listConversations()).rejects.toBeInstanceOf(
      ChatApiResponseError,
    );
  });
});
