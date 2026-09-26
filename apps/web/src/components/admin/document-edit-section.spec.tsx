import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DocumentEditSection } from "./document-edit-section";

describe("DocumentEditSection", () => {
  it("renders the summary and the children inside the details", () => {
    render(
      <DocumentEditSection id="edit-section">
        <p>Contenido del formulario</p>
      </DocumentEditSection>,
    );

    expect(screen.getByText("Editar datos del documento")).toBeInTheDocument();
    expect(screen.getByText("Contenido del formulario")).toBeInTheDocument();
  });

  it("forwards the id to the details element", () => {
    const { container } = render(
      <DocumentEditSection id="edit-section">
        <span>Contenido</span>
      </DocumentEditSection>,
    );

    const details = container.querySelector("details");
    expect(details).toHaveAttribute("id", "edit-section");
  });

  it("se abre sola cuando se llega con el ancla del lápiz", () => {
    window.history.replaceState(null, "", "#edit-document");
    try {
      const { container } = render(
        <DocumentEditSection id="edit-document">
          <span>Contenido</span>
        </DocumentEditSection>,
      );

      expect(container.querySelector("details")).toHaveAttribute("open");
    } finally {
      window.history.replaceState(null, "", "#");
    }
  });

  it("renders without an id when none is provided", () => {
    const { container } = render(
      <DocumentEditSection>
        <span>Contenido</span>
      </DocumentEditSection>,
    );

    const details = container.querySelector("details");
    expect(details).not.toHaveAttribute("id");
  });
});