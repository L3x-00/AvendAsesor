import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminShell } from "./admin-shell";

describe("AdminShell", () => {
  it("renders clear navigation for the protected operational resources", () => {
    render(
      <AdminShell
        activeSection="home"
        description="Descripción"
        isSuperadmin
        title="Administración"
      >
        <p>Contenido administrativo</p>
      </AdminShell>,
    );

    expect(
      screen.getByRole("heading", { name: "Administración" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Módulos" })[0]).toHaveAttribute(
      "href",
      "/admin/modules",
    );
    expect(
      screen.getAllByRole("link", { name: "Documentos" })[0],
    ).toHaveAttribute("href", "/admin/documents");
    expect(
      screen.getAllByRole("link", { name: "Operación" })[0],
    ).toHaveAttribute("href", "/admin/operations");
    expect(
      screen.getAllByRole("link", { name: "Usuarios" })[0],
    ).toHaveAttribute("href", "/admin/users");
    expect(
      screen.getByRole("link", { name: "Saltar al contenido principal" }),
    ).toHaveAttribute("href", "#main-content");
  });

  it("communicates the current administrative section without changing navigation targets", () => {
    render(
      <AdminShell
        activeSection="documents"
        description="Descripción"
        title="Documentos"
      >
        <p>Contenido administrativo</p>
      </AdminShell>,
    );

    expect(
      screen.getAllByRole("link", { name: "Documentos" })[0],
    ).toHaveAttribute("aria-current", "page");
  });
});
