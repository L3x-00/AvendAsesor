import { describe, expect, it, vi } from "vitest";
import { resolveChatAccess } from "./resolve-chat-access";
import type { AuthorizationSupabaseClient } from "./resolve-admin-access";

function row(overrides: Record<string, unknown> = {}) {
  return {
    access_expires_at: null,
    account_status: "active",
    full_name: "  Lucía Docente  ",
    modules_access: false,
    role: "docente",
    user_id: "user-1",
    ...overrides,
  };
}

function createClient(
  response: { data: unknown; error: unknown } | (() => never) = {
    data: [row()],
    error: null,
  },
): AuthorizationSupabaseClient & { rpc: ReturnType<typeof vi.fn> } {
  const rpc = vi.fn(async () => {
    if (typeof response === "function") return response();
    return response;
  });
  return { rpc } as unknown as AuthorizationSupabaseClient & {
    rpc: ReturnType<typeof vi.fn>;
  };
}

describe("resolveChatAccess", () => {
  it("is unauthenticated without a session row", async () => {
    await expect(
      resolveChatAccess(createClient({ data: [], error: null })),
    ).resolves.toEqual({ status: "unauthenticated" });
  });

  it("is unauthenticated on RPC failure", async () => {
    await expect(
      resolveChatAccess(createClient({ data: null, error: {} })),
    ).resolves.toEqual({ status: "unauthenticated" });
  });

  it("fails closed when the RPC throws", async () => {
    await expect(
      resolveChatAccess(
        createClient(() => {
          throw new Error("network error");
        }),
      ),
    ).resolves.toEqual({ status: "unauthenticated" });
  });

  it("fails closed on malformed rows", async () => {
    await expect(
      resolveChatAccess(
        createClient({ data: [row({ role: undefined })], error: null }),
      ),
    ).resolves.toEqual({ status: "unauthorized" });
  });

  it.each(["docente", "admin", "superadmin"] as const)(
    "accepts the confirmed %s role in one call",
    async (role) => {
      const client = createClient({ data: [row({ role })], error: null });

      await expect(resolveChatAccess(client)).resolves.toEqual({
        fullName: "Lucía Docente",
        role,
        status: "authorized",
        userId: "user-1",
      });
      expect(client.rpc).toHaveBeenCalledExactlyOnceWith(
        "current_user_access_context",
      );
    },
  );

  it("fails closed for unknown roles", async () => {
    await expect(
      resolveChatAccess(
        createClient({ data: [row({ role: "invitado" })], error: null }),
      ),
    ).resolves.toEqual({ status: "unauthorized" });
  });

  it("fails closed for a suspended account", async () => {
    await expect(
      resolveChatAccess(
        createClient({
          data: [row({ account_status: "suspended" })],
          error: null,
        }),
      ),
    ).resolves.toEqual({ status: "unauthorized" });
  });

  it("fails closed for an expired account", async () => {
    await expect(
      resolveChatAccess(
        createClient({
          data: [row({ access_expires_at: "2020-01-01T00:00:00.000Z" })],
          error: null,
        }),
      ),
    ).resolves.toEqual({ status: "unauthorized" });
  });

  it("does not give an administrative capability to a docente", async () => {
    const result = await resolveChatAccess(
      createClient({
        data: [row({ role: "docente", modules_access: true })],
        error: null,
      }),
    );

    expect(result).toEqual({
      fullName: "Lucía Docente",
      role: "docente",
      status: "authorized",
      userId: "user-1",
    });
  });
});
