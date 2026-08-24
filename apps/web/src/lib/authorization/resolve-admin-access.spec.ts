import { describe, expect, it, vi } from "vitest";
import {
  resolveAdminAccess,
  type AuthorizationSupabaseClient,
} from "./resolve-admin-access";

function createClient(
  overrides: {
    getUser?: AuthorizationSupabaseClient["auth"]["getUser"];
    maybeSingle?: () => PromiseLike<{ data: unknown; error: unknown }>;
  } = {},
): AuthorizationSupabaseClient {
  const maybeSingle =
    overrides.maybeSingle ??
    (async () => ({
      data: { account_status: "active", role: "admin" },
      error: null,
    }));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));

  return {
    auth: {
      getUser:
        overrides.getUser ??
        vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null })),
    },
    from,
  } as unknown as AuthorizationSupabaseClient;
}

describe("resolveAdminAccess", () => {
  it("is unauthenticated when the provider reports no user", async () => {
    const client = createClient({
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
    });

    await expect(resolveAdminAccess(client)).resolves.toEqual({
      status: "unauthenticated",
    });
  });

  it("is unauthenticated when the provider returns an error", async () => {
    const client = createClient({
      getUser: vi.fn(async () => ({ data: { user: null }, error: {} })),
    });

    await expect(resolveAdminAccess(client)).resolves.toEqual({
      status: "unauthenticated",
    });
  });

  it("is unauthenticated when user verification throws unexpectedly", async () => {
    const client = createClient({
      getUser: vi.fn(async () => Promise.reject(new Error("network error"))),
    });

    await expect(resolveAdminAccess(client)).resolves.toEqual({
      status: "unauthenticated",
    });
  });

  it("fails closed when the profile lookup errors", async () => {
    const client = createClient({
      maybeSingle: async () => ({ data: null, error: {} }),
    });

    await expect(resolveAdminAccess(client)).resolves.toEqual({
      status: "unauthorized",
    });
  });

  it("fails closed when the profile lookup throws unexpectedly", async () => {
    const client = createClient({
      maybeSingle: async () => Promise.reject(new Error("network error")),
    });

    await expect(resolveAdminAccess(client)).resolves.toEqual({
      status: "unauthorized",
    });
  });

  it("fails closed when no profile row exists", async () => {
    const client = createClient({
      maybeSingle: async () => ({ data: null, error: null }),
    });

    await expect(resolveAdminAccess(client)).resolves.toEqual({
      status: "unauthorized",
    });
  });

  it("fails closed on malformed provider data", async () => {
    const client = createClient({
      maybeSingle: async () => ({
        data: { account_status: "active", role: 42 },
        error: null,
      }),
    });

    await expect(resolveAdminAccess(client)).resolves.toEqual({
      status: "unauthorized",
    });

    const clientMissingRole = createClient({
      maybeSingle: async () => ({ data: {}, error: null }),
    });

    await expect(resolveAdminAccess(clientMissingRole)).resolves.toEqual({
      status: "unauthorized",
    });
  });

  it("is unauthorized for the docente role", async () => {
    const client = createClient({
      maybeSingle: async () => ({
        data: { account_status: "active", role: "docente" },
        error: null,
      }),
    });

    await expect(resolveAdminAccess(client)).resolves.toEqual({
      status: "unauthorized",
    });
  });

  it("is authorized for admin and superadmin roles and scopes the lookup to the user", async () => {
    const adminClient = createClient({
      maybeSingle: async () => ({
        data: { account_status: "active", role: "admin" },
        error: null,
      }),
    });

    await expect(resolveAdminAccess(adminClient)).resolves.toEqual({
      role: "admin",
      status: "authorized",
      userId: "user-1",
    });
    expect(adminClient.from).toHaveBeenCalledWith("profiles");

    const superadminClient = createClient({
      maybeSingle: async () => ({
        data: { account_status: "active", role: "superadmin" },
        error: null,
      }),
    });

    await expect(resolveAdminAccess(superadminClient)).resolves.toEqual({
      role: "superadmin",
      status: "authorized",
      userId: "user-1",
    });
  });

  it("fails closed for suspended or legacy-incomplete account state", async () => {
    const suspended = createClient({
      maybeSingle: async () => ({
        data: { account_status: "suspended", role: "superadmin" },
        error: null,
      }),
    });
    const incomplete = createClient({
      maybeSingle: async () => ({ data: { role: "admin" }, error: null }),
    });

    await expect(resolveAdminAccess(suspended)).resolves.toEqual({
      status: "unauthorized",
    });
    await expect(resolveAdminAccess(incomplete)).resolves.toEqual({
      status: "unauthorized",
    });
  });
});
