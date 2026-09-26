import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const jar = new Map<string, { options?: unknown; value: string }>();
  return {
    jar,
    redirect: vi.fn((destination: string): never => {
      throw new Error(`REDIRECT:${destination}`);
    }),
    resolveAdminAccess: vi.fn(async () => ({ status: "unauthorized" })),
    signInWithPassword: vi.fn(),
  };
});

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    delete: (name: string) => mocks.jar.delete(name),
    get: (name: string) => {
      const entry = mocks.jar.get(name);
      return entry ? { name, value: entry.value } : undefined;
    },
    set: (name: string, value: string, options?: unknown) =>
      mocks.jar.set(name, { options, value }),
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: { signInWithPassword: mocks.signInWithPassword },
  }),
}));
vi.mock("@/lib/authorization/resolve-admin-access", () => ({
  resolveAdminAccess: mocks.resolveAdminAccess,
}));

import { signInAction } from "./actions";

function credentials(remember: boolean): FormData {
  const data = new FormData();
  data.set("email", "docente@avend.pe");
  data.set("password", "Secreta123");
  if (remember) data.set("remember", "on");
  return data;
}

describe("signInAction", () => {
  beforeEach(() => {
    mocks.jar.clear();
    mocks.signInWithPassword.mockReset();
  });

  it("guarda la preferencia y marca la sesión solo tras un inicio correcto", async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: null });

    await expect(
      signInAction({ status: "idle" }, credentials(false)),
    ).rejects.toThrow("REDIRECT:/chat");

    expect(mocks.jar.get("avend-remember")?.value).toBe("0");
    expect(mocks.jar.get("avend-session")?.value).toBe("1");
  });

  it("un intento fallido no deja marca ni cambia la preferencia previa", async () => {
    mocks.jar.set("avend-remember", { value: "1" });
    mocks.signInWithPassword.mockResolvedValue({ error: new Error("bad") });

    const state = await signInAction({ status: "idle" }, credentials(false));

    expect(state.status).toBe("error");
    expect(mocks.jar.get("avend-remember")?.value).toBe("1");
    expect(mocks.jar.has("avend-session")).toBe(false);
  });

  it("sin preferencia previa, un intento fallido no deja ninguna", async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: new Error("bad") });

    await signInAction({ status: "idle" }, credentials(true));

    expect(mocks.jar.size).toBe(0);
  });
});
