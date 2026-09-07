import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminShellFrame } from "./admin-shell";

const usePathname = vi.fn<() => string | null>();

vi.mock("next/navigation", () => ({
  usePathname: () => usePathname(),
}));

function renderFrame(
  pathname: string,
  props: Partial<{
    modulesAccess: boolean;
    userName: string;
    userRole: "admin" | "superadmin";
  }> = {},
) {
  usePathname.mockReturnValue(pathname);

  return render(
    <AdminShellFrame
      modulesAccess={props.modulesAccess ?? true}
      userName={props.userName ?? "Juan Avend"}
      userRole={props.userRole ?? "superadmin"}
    >
      <p>Contenido administrativo</p>
    </AdminShellFrame>,
  );
}

describe("AdminShellFrame", () => {
  beforeEach(() => {
    usePathname.mockReset();
  });

  it("renders only the authorized SUPERADMIN sections in their specified order", () => {
    const { container } = renderFrame("/admin");
    const sidebar = within(container.querySelector("aside") as HTMLElement);
    const navigation = sidebar.getByRole("navigation", {
      name: "Administración",
    });
    const links = within(navigation).getAllByRole("link");

    expect(links.map((link) => link.textContent)).toEqual([
      "Inicio",
      "Usuarios",
      "Módulos",
      "Consultas y reportes",
      "Historial de documentos",
      "Chat (ver como docente)",
    ]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/admin",
      "/admin/users",
      "/admin/modules",
      "/admin/operations",
      "/admin/documents",
      "/chat",
    ]);
    links.forEach((link) => {
      expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    });
    expect(sidebar.queryByRole("link", { name: "Operación" })).toBeNull();
    expect(sidebar.queryByRole("link", { name: "Documentos" })).toBeNull();
  });

  it("shows the verified identity, role and bordered sign-out action", () => {
    const { container } = renderFrame("/admin/users");
    const sidebar = within(container.querySelector("aside") as HTMLElement);

    expect(sidebar.getByText("JA")).toHaveAttribute("aria-hidden", "true");
    expect(sidebar.getByText("Juan Avend")).toBeVisible();
    expect(sidebar.getByText("Superadministrador")).toBeVisible();
    expect(sidebar.getByText("Panel de administrador")).toBeVisible();
    const signOut = sidebar.getByRole("button", { name: "Cerrar sesión" });
    expect(signOut).toHaveClass("avend-admin-sign-out-button");
    const signOutForm = signOut.closest("form");
    expect(signOutForm).toHaveAttribute("action", "/auth/sign-out");
    expect(signOutForm).toHaveAttribute("method", "post");
  });

  it("uses the first two letters when the verified profile has one name", () => {
    const { container } = renderFrame("/admin", { userName: "Usuario" });
    const sidebar = within(container.querySelector("aside") as HTMLElement);

    expect(sidebar.getByText("US")).toHaveAttribute("aria-hidden", "true");
  });

  it("keeps the current section explicit and hides Usuarios from ADMIN", () => {
    const { container } = renderFrame("/admin/documents", {
      userName: "María Administradora",
      userRole: "admin",
    });
    const sidebar = within(container.querySelector("aside") as HTMLElement);

    expect(
      sidebar.getByRole("link", { name: "Historial de documentos" }),
    ).toHaveAttribute("aria-current", "page");
    expect(sidebar.queryByRole("link", { name: "Usuarios" })).toBeNull();
    expect(sidebar.getByText("Administrador")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Saltar al contenido principal" }),
    ).toHaveAttribute("href", "#main-content");
  });

  /**
   * La sección activa y la variante de Inicio ya no llegan por prop: el layout
   * que renderiza el marco no sabe cuál de sus hijos se muestra. Si esta
   * deducción se rompe, la barra lateral deja de señalar dónde está el usuario
   * sin que falle nada más.
   */
  it.each([
    ["/admin/users", "Usuarios"],
    ["/admin/modules", "Módulos"],
    ["/admin/modules/9f1c2b7e", "Módulos"],
    ["/admin/operations", "Consultas y reportes"],
    ["/admin/operations/3c4d", "Consultas y reportes"],
    ["/admin/documents", "Historial de documentos"],
    ["/admin/documents/77aa", "Historial de documentos"],
    ["/admin", "Inicio"],
  ])("marks %s as the current section", (pathname, linkName) => {
    const { container } = renderFrame(pathname);
    const sidebar = within(container.querySelector("aside") as HTMLElement);

    expect(sidebar.getByRole("link", { name: linkName })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("applies the home variant only on the dashboard route", () => {
    const home = renderFrame("/admin");
    expect(home.container.firstElementChild).toHaveClass(
      "avend-admin-shell--home",
    );
    home.unmount();

    const users = renderFrame("/admin/users");
    expect(users.container.firstElementChild).not.toHaveClass(
      "avend-admin-shell--home",
    );
  });
});
