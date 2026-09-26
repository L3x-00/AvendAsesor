import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((destination: string): never => {
    throw new Error(`REDIRECT:${destination}`);
  }),
  resolveAdminAccess: vi.fn(),
  resolveSignInPath: vi.fn(async () => "/auth/sign-in"),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({}),
}));
vi.mock("@/lib/authorization/resolve-admin-access", () => ({
  resolveAdminAccess: mocks.resolveAdminAccess,
}));
vi.mock("@/lib/auth/session-redirect", () => ({
  resolveSignInPath: mocks.resolveSignInPath,
}));

import Home from "./page";

describe("Home", () => {
  beforeEach(() => {
    mocks.resolveSignInPath.mockResolvedValue("/auth/sign-in");
  });

  it("con sesión vigente entra directo, sin volver a pedir credenciales", async () => {
    mocks.resolveAdminAccess.mockResolvedValue({ status: "unauthorized" });
    await expect(Home()).rejects.toThrow("REDIRECT:/chat");

    mocks.resolveAdminAccess.mockResolvedValue({ status: "authorized" });
    await expect(Home()).rejects.toThrow("REDIRECT:/admin");
  });

  it("si la sesión caducó, lleva al login con el aviso", async () => {
    mocks.resolveAdminAccess.mockResolvedValue({ status: "unauthenticated" });
    mocks.resolveSignInPath.mockResolvedValue("/auth/sign-in?sesion=caducada");

    await expect(Home()).rejects.toThrow(
      "REDIRECT:/auth/sign-in?sesion=caducada",
    );
  });

  it("a un visitante le ofrece crear cuenta o ingresar, sin cerrar sesión", async () => {
    mocks.resolveAdminAccess.mockResolvedValue({ status: "unauthenticated" });

    render(await Home());

    expect(screen.getByRole("link", { name: "Crear cuenta" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Iniciar sesión" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Cerrar sesión/ })).toBeNull();
  });
});
