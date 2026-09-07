import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminPage } from "./admin-page";

describe("AdminPage", () => {
  it("supports the exact dashboard heading, welcome and live-time slot", () => {
    render(
      <AdminPage
        description="Resumen general del sistema y accesos principales."
        eyebrow={null}
        headerAside={<time>12:45:32 a. m. | Lunes, 31 de agosto de 2026</time>}
        title="PANEL DE ADMINISTRACIÓN AVEND ASESOR"
        welcome="¡Bienvenido de nuevo, Administrador!"
      >
        <p>Contenido administrativo</p>
      </AdminPage>,
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "PANEL DE ADMINISTRACIÓN AVEND ASESOR",
      }),
    ).toBeVisible();
    expect(
      screen.getByText("¡Bienvenido de nuevo, Administrador!"),
    ).toBeVisible();
    expect(
      screen.getByText("Resumen general del sistema y accesos principales."),
    ).toBeVisible();
    expect(screen.queryByText("Administración", { selector: "p" })).toBeNull();
    expect(screen.getByRole("time")).toBeVisible();
    expect(screen.getByText("Contenido administrativo")).toBeVisible();
  });

  it("shows the default eyebrow and marks the header when it carries an aside", () => {
    const { container } = render(
      <AdminPage description="Descripción" title="Usuarios y accesos">
        <p>Contenido</p>
      </AdminPage>,
    );

    expect(screen.getByText("Administración", { selector: "p" })).toBeVisible();
    expect(container.querySelector("header")).not.toHaveClass(
      "avend-admin-header--with-aside",
    );
  });

  it("marks the header when it carries an aside", () => {
    const { container } = render(
      <AdminPage
        description="Descripción"
        headerAside={<span>Reloj</span>}
        title="Inicio"
      >
        <p>Contenido</p>
      </AdminPage>,
    );

    expect(container.querySelector("header")).toHaveClass(
      "avend-admin-header--with-aside",
    );
  });
});
