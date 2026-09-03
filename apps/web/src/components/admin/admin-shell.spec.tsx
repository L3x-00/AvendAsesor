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

  it("supports the exact dashboard heading, welcome and live-time slot", () => {
    const { container } = render(
      <AdminShell
        activeSection="home"
        description="Resumen general del sistema y accesos principales."
        eyebrow={null}
        headerAside={<time>12:45:32 a. m. | Lunes, 31 de agosto de 2026</time>}
        title="PANEL DE ADMINISTRACIÓN AVEND ASESOR"
        userName="Juan Avend"
        userRole="superadmin"
        welcome="¡Bienvenido de nuevo, Administrador!"
      >
        <p>Contenido administrativo</p>
      </AdminShell>,
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "PANEL DE ADMINISTRACIÓN AVEND ASESOR",
      }),
    ).toBeVisible();
    expect(screen.getByText("¡Bienvenido de nuevo, Administrador!")).toBeVisible();
    expect(
      screen.getByText("Resumen general del sistema y accesos principales."),
    ).toBeVisible();
    expect(screen.queryByText("Administración", { selector: "p" })).toBeNull();
    expect(screen.getByRole("time")).toBeVisible();
    expect(container.firstElementChild).toHaveClass("avend-admin-shell--home");
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
