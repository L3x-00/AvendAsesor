import { describe, expect, it, vi } from "vitest";
import {
  resolveAdminAccess,
  type AuthorizationSupabaseClient,
} from "./resolve-admin-access";

/** Fila tal como la devuelve `public.current_user_access_context()`. */
function row(overrides: Record<string, unknown> = {}) {
  return {
    access_expires_at: null,
    account_status: "active",
    full_name: "  María Administradora  ",
    modules_access: true,
    role: "admin",
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

describe("resolveAdminAccess", () => {
  it("is unauthorized when there is no profile for the session", async () => {
    const client = createClient({ data: [], error: null });

    await expect(resolveAdminAccess(client)).resolves.toEqual({
      status: "unauthorized",
    });
    expect(client.rpc).toHaveBeenCalledExactlyOnceWith(
      "current_user_access_context",
    );
  });

  it("is unauthenticated only when PostgREST rejects the anonymous key", async () => {
    const client = createClient({
      data: null,
      error: { code: "42501", message: "permission denied for function" },
    });

    await expect(resolveAdminAccess(client)).resolves.toEqual({
      status: "unauthenticated",
    });
  });

  it("is unauthorized on any other RPC error", async () => {
    const client = createClient({
      data: null,
      error: { code: "PGRST202", message: "function not found" },
    });

    await expect(resolveAdminAccess(client)).resolves.toEqual({
      status: "unauthorized",
    });
  });

  it("is unauthenticated when the RPC throws unexpectedly", async () => {
    const client = createClient(() => {
      throw new Error("network error");
    });

    await expect(resolveAdminAccess(client)).resolves.toEqual({
      status: "unauthenticated",
    });
  });

  it.each([
    ["missing role", { role: undefined }],
    ["missing account status", { account_status: undefined }],
    ["missing expiry", { access_expires_at: undefined }],
    ["empty name", { full_name: "   " }],
    ["missing user id", { user_id: undefined }],
    ["invalid module permission", { modules_access: "true" }],
  ])("fails closed on malformed data: %s", async (_label, override) => {
    const client = createClient({ data: [row(override)], error: null });

    await expect(resolveAdminAccess(client)).resolves.toEqual({
      status: "unauthorized",
    });
  });

  it("is unauthorized for the docente role", async () => {
    const client = createClient({
      data: [row({ role: "docente" })],
      error: null,
    });

    await expect(resolveAdminAccess(client)).resolves.toEqual({
      status: "unauthorized",
    });
  });

  it.each(["admin", "superadmin"] as const)(
    "is authorized for %s with the values resolved in one call",
    async (role) => {
      const client = createClient({
        data: [row({ role, modules_access: false })],
        error: null,
      });

      await expect(resolveAdminAccess(client)).resolves.toEqual({
        fullName: "María Administradora",
        modulesAccess: false,
        role,
        status: "authorized",
        userId: "user-1",
      });
      expect(client.rpc).toHaveBeenCalledExactlyOnceWith(
        "current_user_access_context",
      );
    },
  );

  it("fails closed when the account has been suspended", async () => {
    const client = createClient({
      data: [row({ account_status: "suspended" })],
      error: null,
    });

    await expect(resolveAdminAccess(client)).resolves.toEqual({
      status: "unauthorized",
    });
  });

  it("fails closed when access has expired", async () => {
    const client = createClient({
      data: [row({ access_expires_at: "2020-01-01T00:00:00.000Z" })],
      error: null,
    });

    await expect(resolveAdminAccess(client)).resolves.toEqual({
      status: "unauthorized",
    });
  });

  it("keeps an unexpired access window open", async () => {
    const client = createClient({
      data: [
        row({ access_expires_at: new Date(Date.now() + 86_400_000).toISOString() }),
      ],
      error: null,
    });

    await expect(resolveAdminAccess(client)).resolves.toMatchObject({
      status: "authorized",
    });
  });
});
