import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DocumentSituationSummary } from "./document-situation-summary";

const replacementId = "680a1b3e-9a76-46b9-9130-7284e03aa123";

const base = {
  archiveObservation: null,
  archiveReasonCode: null,
  archiveReasonDetail: null,
  deactivationReason: null,
  replacementDate: null,
  replacementDocumentId: null,
  replacementObservation: null,
  replacementReason: null,
  replacementYear: null,
  situation: "current" as const,
};

describe("DocumentSituationSummary", () => {
  it("stays out of the way while the document is vigente", () => {
    const { container } = render(
      <DocumentSituationSummary document={base} replacement={null} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the replacing document, the date, the reason and the observation", () => {
    render(
      <DocumentSituationSummary
        document={{
          ...base,
          replacementDate: "2026-08-01",
          replacementDocumentId: replacementId,
          replacementObservation: "Se conserva por trazabilidad",
          replacementReason: "Nueva norma aplicable",
          replacementYear: 2026,
          situation: "replaced",
        }}
        replacement={{ id: replacementId, title: "Reglamento reemplazante" }}
      />,
    );

    const link = screen.getByRole("link", {
      name: "Reglamento reemplazante",
    });
    expect(link).toHaveAttribute("href", `/admin/documents/${replacementId}`);
    expect(screen.getByText("1 de agosto de 2026")).toBeVisible();
    expect(screen.getByText("Nueva norma aplicable")).toBeVisible();
    expect(screen.getByText("Se conserva por trazabilidad")).toBeVisible();
  });

  it("falls back to the year when only the year of the replacement is known", () => {
    render(
      <DocumentSituationSummary
        document={{
          ...base,
          replacementReason: "Norma posterior",
          replacementYear: 2026,
          situation: "replaced",
        }}
        replacement={null}
      />,
    );

    expect(screen.getByText("2026")).toBeVisible();
    expect(screen.getByText("Aún no está registrado en la biblioteca.")).toBeVisible();
  });

  it("never leaves a dead link when the replacing document disappeared", () => {
    render(
      <DocumentSituationSummary
        document={{
          ...base,
          replacementDocumentId: replacementId,
          replacementReason: "Norma posterior",
          replacementYear: 2026,
          situation: "replaced",
        }}
        replacement={null}
      />,
    );

    expect(screen.queryByRole("link")).toBeNull();
    expect(
      screen.getByText("El documento que lo reemplaza ya no está disponible."),
    ).toBeVisible();
  });

  it("explains why an archived document lost its validity", () => {
    render(
      <DocumentSituationSummary
        document={{
          ...base,
          archiveObservation: "Queda como antecedente",
          archiveReasonCode: "DEROGATED_OR_EXPIRED",
          situation: "archived",
        }}
        replacement={null}
      />,
    );

    expect(screen.getByText("Documento archivado")).toBeVisible();
    expect(
      screen.getByText("Documento derogado o sin vigencia"),
    ).toBeVisible();
    expect(screen.getByText("Queda como antecedente")).toBeVisible();
    // Un archivado no muestra datos de reemplazo que no existen.
    expect(screen.queryByText("Documento que lo reemplaza")).toBeNull();
  });

  it("shows the custom detail when the reason was Otro", () => {
    render(
      <DocumentSituationSummary
        document={{
          ...base,
          archiveReasonCode: "OTHER",
          archiveReasonDetail: "Cargado por error en la mesa de partes",
          situation: "archived",
        }}
        replacement={null}
      />,
    );

    expect(
      screen.getByText("Cargado por error en la mesa de partes"),
    ).toBeVisible();
  });
});
