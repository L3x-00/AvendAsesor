import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminShell } from "./admin-shell";

describe("AdminShell", () => {
  it("renders only the authorized SUPERADMIN sections in their specified order", () => {
    const { container } = render(
      <AdminShell
        activeSection="home"
        description="Descripción"
        title="Administración"
        userName="Juan Avend"
        userRole="superadmin"
      >
        <p>Contenido administrativo</p>
      </AdminShell>,
    );
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
    const { container } = render(
      <AdminShell
        activeSection="users"
        description="Descripción"
        title="Usuarios"
        userName="Juan Avend"
        userRole="superadmin"
      >
        <p>Contenido administrativo</p>
      </AdminShell>,
    );
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
    const { container } = render(
      <AdminShell
        activeSection="home"
        description="Descripción"
        title="Administración"
        userName="Usuario"
        userRole="superadmin"
      >
        <p>Contenido administrativo</p>
      </AdminShell>,
    );
    const sidebar = within(container.querySelector("aside") as HTMLElement);

    expect(sidebar.getByText("US")).toHaveAttribute("aria-hidden", "true");
  });

  it("keeps the current section explicit and hides Usuarios from ADMIN", () => {
    const { container } = render(
      <AdminShell
        activeSection="documents"
        description="Descripción"
        title="Historial"
        userName="María Administradora"
        userRole="admin"
      >
        <p>Contenido administrativo</p>
      </AdminShell>,
    );
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
});
