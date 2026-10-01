import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DocumentIngestionRecovery } from "./document-ingestion-recovery";

vi.mock("@/app/admin/actions", () => ({
  retryDocumentIngestionAction: vi.fn(async () => ({ status: "idle" })),
}));

const documentId = "d60530ac-6fba-46bd-bac7-940c0655db54";

function optionTitles(): string[] {
  const list = screen.getByRole("list");
  return within(list)
    .getAllByRole("listitem")
    .map((item) => item.querySelector("p")?.textContent ?? "");
}

describe("DocumentIngestionRecovery", () => {
  it("explains a timeout and recommends processing again first", () => {
    render(
      <DocumentIngestionRecovery
        canRetry
        cause="timeout"
        documentId={documentId}
      />,
    );

    expect(screen.getByRole("note")).toHaveTextContent(
      /tardó más de lo permitido/,
    );
    expect(optionTitles()).toEqual([
      "Volver a procesar",
      "Subir una versión corregida",
      "Si ya no lo necesitas",
    ]);
    const retry = screen.getByRole("button", { name: "Volver a procesar" });
    expect(
      retry.closest("form")?.querySelector('input[name="documentId"]'),
    ).toHaveValue(documentId);
    expect(
      screen.getByRole("link", { name: "Ir a «Nueva versión»" }),
    ).toHaveAttribute("href", "#new-version");
    expect(
      screen.getByRole("link", { name: "Archivar o desactivar" }),
    ).toHaveAttribute("href", "#document-lifecycle");
    expect(screen.getByRole("link", { name: "Eliminar" })).toHaveAttribute(
      "href",
      "#delete-document",
    );
  });

  it("puts a corrected file first when the file itself is the problem", () => {
    render(
      <DocumentIngestionRecovery
        canRetry
        cause="unsupported_format"
        documentId={documentId}
      />,
    );

    expect(screen.getByRole("note")).toHaveTextContent(/\.docx/);
    expect(optionTitles()).toEqual([
      "Subir una versión corregida",
      "Volver a procesar",
      "Si ya no lo necesitas",
    ]);
  });

  it("still offers a way out when nothing can be processed again", () => {
    render(
      <DocumentIngestionRecovery
        canRetry={false}
        cause={null}
        documentId={documentId}
      />,
    );

    expect(screen.getByRole("note")).toHaveTextContent(
      "No se pudo leer o indexar el archivo.",
    );
    expect(
      screen.queryByRole("button", { name: "Volver a procesar" }),
    ).not.toBeInTheDocument();
    expect(optionTitles()).toEqual([
      "Subir una versión corregida",
      "Si ya no lo necesitas",
    ]);
  });
});
