import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const getSession = vi.fn();

  return {
    createServerSupabaseClient: vi.fn(async () => ({
      auth: { getSession },
    })),
    getSession,
    redirect: vi.fn((destination: string): never => {
      throw new Error(`REDIRECT:${destination}`);
    }),
    resolveChatAccess: vi.fn(),
  };
});

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}));
vi.mock("@/lib/authorization/resolve-chat-access", () => ({
  resolveChatAccess: mocks.resolveChatAccess,
}));

import {
  createAuthorizedChatApiClient,
  resolveAuthorizedChatContext,
  resolveAuthorizedChatSession,
} from "./authorized-client";

describe("authorized chat API context", () => {
  beforeEach(() => {
    process.env.ADMIN_API_URL = "http://localhost:3001";
    mocks.redirect.mockClear();
    mocks.createServerSupabaseClient.mockClear();
    mocks.resolveChatAccess.mockClear();
    mocks.getSession.mockClear();
  });

  it("exposes the client and the profile role for an authorized session", async () => {
    mocks.resolveChatAccess.mockResolvedValue({
      role: "admin",
      status: "authorized",
      userId: "user-1",
    });
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "verified-token" } },
      error: null,
    });

    const context = await resolveAuthorizedChatContext();

    expect(context.role).toBe("admin");
    expect(context.client).toBeDefined();
    expect(mocks.resolveChatAccess).toHaveBeenCalledTimes(1);
    expect(mocks.getSession).toHaveBeenCalledTimes(1);
  });

  it("redirects unauthenticated and unauthorized callers before exposing context", async () => {
    mocks.resolveChatAccess.mockResolvedValue({ status: "unauthenticated" });
    await expect(resolveAuthorizedChatContext()).rejects.toThrow(
      "REDIRECT:/auth/sign-in",
    );

    mocks.resolveChatAccess.mockResolvedValue({ status: "unauthorized" });
    await expect(resolveAuthorizedChatContext()).rejects.toThrow(
      "REDIRECT:/access-denied",
    );
  });

  it("redirects when an authorized profile has no usable session token", async () => {
    mocks.resolveChatAccess.mockResolvedValue({
      role: "docente",
      status: "authorized",
      userId: "user-1",
    });
    mocks.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    await expect(resolveAuthorizedChatContext()).rejects.toThrow(
      "REDIRECT:/auth/sign-in",
    );
  });

  it("still provides the plain client factory for callers that ignore the role", async () => {
    mocks.resolveChatAccess.mockResolvedValue({
      role: "docente",
      status: "authorized",
      userId: "user-1",
    });
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "verified-token" } },
      error: null,
    });

    await expect(createAuthorizedChatApiClient()).resolves.toBeDefined();
  });

  it("returns a bare status envelope without a token when access is denied", async () => {
    mocks.resolveChatAccess.mockResolvedValue({ status: "unauthorized" });

    await expect(resolveAuthorizedChatSession()).resolves.toEqual({
      status: "unauthorized",
    });
    expect(mocks.getSession).not.toHaveBeenCalled();
  });
});
