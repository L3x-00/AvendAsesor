import { describe, expect, it, vi } from "vitest";
import type { AuthorizationSupabaseClient } from "./resolve-admin-access";
import { resolveChatAccess } from "./resolve-chat-access";

function clientFor(
  role: unknown,
  accountStatus: unknown = "active",
): AuthorizationSupabaseClient {
  const maybeSingle = vi.fn(async () => ({
    data: { account_status: accountStatus, role },
    error: null,
  }));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));

  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "user-1" } },
        error: null,
      })),
    },
    from: vi.fn(() => ({ select })),
  } as unknown as AuthorizationSupabaseClient;
}

describe("resolveChatAccess", () => {
  it.each(["docente", "admin", "superadmin"])(
    "authorizes the %s role for chat only",
    async (role) => {
      await expect(resolveChatAccess(clientFor(role))).resolves.toEqual({
        role,
        status: "authorized",
        userId: "user-1",
      });
    },
  );

  it("fails closed for absent or invalid profiles", async () => {
    const absent = clientFor("docente");
    absent.auth.getUser = vi.fn(async () => ({
      data: { user: null },
      error: null,
    }));

    await expect(resolveChatAccess(absent)).resolves.toEqual({
      status: "unauthenticated",
    });
    await expect(resolveChatAccess(clientFor("unknown"))).resolves.toEqual({
      status: "unauthorized",
    });
    await expect(
      resolveChatAccess(clientFor("docente", "suspended")),
    ).resolves.toEqual({ status: "unauthorized" });
  });

  it("fails closed when identity or profile lookups throw", async () => {
    const identityFailure = clientFor("docente");
    identityFailure.auth.getUser = vi.fn(async () =>
      Promise.reject(new Error("offline")),
    );

    await expect(resolveChatAccess(identityFailure)).resolves.toEqual({
      status: "unauthenticated",
    });

    const profileFailure = clientFor("docente");
    profileFailure.from = vi.fn(() => {
      throw new Error("offline");
    });
    await expect(resolveChatAccess(profileFailure)).resolves.toEqual({
      status: "unauthorized",
    });
  });
});
