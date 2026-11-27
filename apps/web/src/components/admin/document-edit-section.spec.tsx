import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DocumentEditSection } from "./document-edit-section";

describe("DocumentEditSection", () => {
  it("mantiene el formulario fuera de la página hasta que se pide editar", async () => {
    const user = userEvent.setup();
    render(
      <DocumentEditSection id="edit-section">
        <p>Contenido del formulario</p>
      </DocumentEditSection>,
    );

    expect(
      screen.getByRole("button", { name: "Editar datos" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Contenido del formulario")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Editar datos" }));
    expect(
      screen.getByRole("dialog", { name: "Editar datos del documento" }),
    ).toBeVisible();
    expect(screen.getByText("Contenido del formulario")).toBeVisible();
  });

  it("asocia el botón con el diálogo y conserva el ancla", () => {
    render(
      <DocumentEditSection id="edit-document">
        <span>Contenido</span>
      </DocumentEditSection>,
    );

    const trigger = screen.getByRole("button", { name: "Editar datos" });
    expect(trigger).toHaveAttribute("id", "edit-document");
    expect(trigger).toHaveAttribute("aria-controls", "document-edit-dialog");
  });

  it("se abre sola cuando se llega con el ancla del lápiz", () => {
    window.history.replaceState(null, "", "#edit-document");
    try {
      render(
        <DocumentEditSection id="edit-document">
          <span>Contenido</span>
        </DocumentEditSection>,
      );

      expect(
        screen.getByRole("dialog", { name: "Editar datos del documento" }),
      ).toBeVisible();
    } finally {
      window.history.replaceState(null, "", "#");
    }
  });

  it("se cierra con Escape y devuelve el foco al botón", async () => {
    const user = userEvent.setup();
    render(
      <DocumentEditSection id="edit-document">
        <span>Contenido</span>
      </DocumentEditSection>,
    );
    const trigger = screen.getByRole("button", { name: "Editar datos" });
    await user.click(trigger);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });
});
