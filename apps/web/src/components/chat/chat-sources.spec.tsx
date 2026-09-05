import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatSources } from "./chat-sources";

describe("ChatSources", () => {
  it("renders only the evidence snapshot received from the chat API", () => {
    render(
      <ChatSources
        sources={[
          {
            articleReference: "Artículo 5",
            documentSituation: "current",
            documentTitle: "Ley de Reforma Magisterial",
            id: "9c8b56af-6d0c-4fef-881e-7c00907540dd",
            moduleName: "Licencias",
            numeralReference: "5.1",
            pageEnd: 33,
            pageStart: 33,
            rank: 1,
            relevanceScore: 0.92,
            sectionTitle: "Licencias",
            versionNumber: 1,
          },
        ]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Referencias" })).toBeVisible();
    expect(
      screen.getByRole("table", {
        name: "Fuentes documentales, ubicación y descarga",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("columnheader", { name: "Documento" }),
    ).toBeVisible();
    expect(screen.getByText("1 fuente")).toBeVisible();
    expect(screen.getByText("Ley de Reforma Magisterial")).toBeVisible();
    expect(screen.getByText("Vigente")).toBeVisible();
    expect(screen.getByText("Artículo 5")).toBeVisible();
    expect(screen.getByText("5.1")).toBeVisible();
    expect(screen.getByText("Coincidencia documental: 92%")).toBeVisible();
    expect(screen.getByText("Fuente número:")).toBeInTheDocument();
    expect(screen.getByText("Página:")).toBeInTheDocument();
    expect(screen.getByText("Versión:")).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: /Abrir fuente \[1\]: Ley de Reforma Magisterial/i,
      }),
    ).toHaveAttribute(
      "href",
      "/api/chat/sources/9c8b56af-6d0c-4fef-881e-7c00907540dd/download",
    );
    expect(
      screen.getByRole("link", {
        name: /Abrir fuente \[1\]: Ley de Reforma Magisterial/i,
      }),
    ).toHaveAttribute("target", "_blank");
  }, 15_000);

  it("preserves ranges and a clear fallback when source metadata is absent", () => {
    render(
      <ChatSources
        sources={[
          {
            articleReference: null,
            documentSituation: "current",
            documentTitle: "Reglamento",
            id: "ac8b56af-6d0c-4fef-881e-7c00907540dd",
            moduleName: null,
            numeralReference: null,
            pageEnd: 12,
            pageStart: 10,
            rank: 2,
            relevanceScore: 0.5,
            sectionTitle: null,
            versionNumber: 2,
          },
        ]}
      />,
    );

    expect(screen.getByText("10–12").closest("td")).toHaveAttribute(
      "data-label",
      "Páginas",
    );
    expect(screen.getByText("Coincidencia documental: 50%")).toBeVisible();
    const sourceRow = screen.getByText("Reglamento").closest("tr");
    expect(sourceRow).not.toBeNull();
    expect(
      within(sourceRow as HTMLTableRowElement).getByText(/Proceso:/),
    ).toHaveTextContent("Proceso: No especificado");
    expect(sourceRow).toHaveTextContent("Sección: No especificada");
    expect(sourceRow).toHaveTextContent("Artículo: No especificado");
    expect(sourceRow).toHaveTextContent("Numeral: No especificado");
  });

  it("distinguishes replaced and archived evidence while preserving each source download", () => {
    render(
      <ChatSources
        sources={[
          {
            articleReference: "Artículo 4",
            documentSituation: "replaced",
            documentTitle: "Norma sustituida de 2018",
            id: "source-replaced",
            moduleName: "Evaluación docente",
            numeralReference: null,
            pageEnd: 8,
            pageStart: 7,
            rank: 1,
            relevanceScore: 0.83,
            sectionTitle: "Requisitos anteriores",
            versionNumber: 2,
          },
          {
            articleReference: null,
            documentSituation: "archived",
            documentTitle: "Antecedente archivado de 2009",
            id: "source-archived",
            moduleName: "Evaluación docente",
            numeralReference: null,
            pageEnd: 3,
            pageStart: 3,
            rank: 2,
            relevanceScore: 0.76,
            sectionTitle: "Antecedentes",
            versionNumber: 1,
          },
        ]}
      />,
    );

    expect(screen.getByText("2 fuentes")).toBeVisible();
    const replacedRow = screen.getByText("Norma sustituida de 2018").closest("tr");
    const archivedRow = screen.getByText("Antecedente archivado de 2009").closest("tr");
    expect(replacedRow).toHaveTextContent(
      "Situación: Reemplazado / sin vigencia · Histórico",
    );
    expect(archivedRow).toHaveTextContent(
      "Situación: Archivado · Antecedente histórico",
    );
    expect(screen.queryByText("Vigente")).not.toBeInTheDocument();
    expect(
      within(replacedRow as HTMLTableRowElement).getByRole("link", {
        name: /Abrir fuente \[1\]: Norma sustituida de 2018/,
      }),
    ).toHaveAttribute("href", "/api/chat/sources/source-replaced/download");
    expect(
      within(archivedRow as HTMLTableRowElement).getByRole("link", {
        name: /Abrir fuente \[2\]: Antecedente archivado de 2009/,
      }),
    ).toHaveAttribute("href", "/api/chat/sources/source-archived/download");
  });
});
