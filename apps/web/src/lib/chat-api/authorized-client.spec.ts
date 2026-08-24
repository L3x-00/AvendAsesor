import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  getSession: vi.fn(),
  redirect: vi.fn((destination: string): never => {
    throw new Error(`REDIRECT:${destination}`);
  }),
  resolveChatAccess: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}));
vi.mock("@/lib/authorization/resolve-chat-access", () => ({
  resolveChatAccess: mocks.resolveChatAccess,
}));

import {
  createAuthorizedChatApiClient,
  resolveAuthorizedChatSession,
} from "./authorized-client";

describe("authorized chat API client", () => {
  beforeEach(() => {
    process.env.ADMIN_API_URL = "http://localhost:3001";
    mocks.createServerSupabaseClient.mockResolvedValue({
      auth: { getSession: mocks.getSession },
    });
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "verified-token" } },
      error: null,
    });
    mocks.resolveChatAccess.mockClear();
  });

  it("creates a server-only client for a docente session", async () => {
    mocks.resolveChatAccess.mockResolvedValue({
      role: "docente",
      status: "authorized",
      userId: "user-1",
    });

    await expect(createAuthorizedChatApiClient()).resolves.toBeDefined();
  });

  it("reports non-authorized sessions without exposing a token", async () => {
    mocks.resolveChatAccess.mockResolvedValue({ status: "unauthenticated" });

    await expect(resolveAuthorizedChatSession()).resolves.toEqual({
      status: "unauthenticated",
    });
  });

  it("redirects an unauthorized session away from the chat page", async () => {
    mocks.resolveChatAccess.mockResolvedValue({ status: "unauthorized" });

    await expect(createAuthorizedChatApiClient()).rejects.toThrow(
      "REDIRECT:/access-denied",
    );
  });

  it("fails closed when the session token cannot be read after authorization", async () => {
    mocks.resolveChatAccess.mockResolvedValue({
      role: "docente",
      status: "authorized",
      userId: "user-1",
    });
    mocks.getSession.mockResolvedValue({
      data: { session: null },
      error: new Error("expired"),
    });

    await expect(resolveAuthorizedChatSession()).resolves.toEqual({
      status: "unauthenticated",
    });
  });
});
