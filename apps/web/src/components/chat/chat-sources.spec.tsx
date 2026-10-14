import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ChatDownloads,
  ChatSources,
  citationRanks,
  citedSourceRanks,
  sourceCitationLabel,
} from "./chat-sources";

describe("citas del modelo", () => {
  it("shows the normative abbreviation in the citation label", () => {
    expect(
      sourceCitationLabel({
        rank: 1,
        documentType: "RESOLUCION_MINISTERIAL",
      } as Parameters<typeof sourceCitationLabel>[0]),
    ).toBe("[1] RM");
    expect(
      sourceCitationLabel({ rank: 2, documentType: "MEMORANDUM" } as Parameters<
        typeof sourceCitationLabel
      >[0]),
    ).toBe("[2] M");
  });
  it("reads single, double and grouped citations", () => {
    expect(
      citedSourceRanks("Plazo [1]. Requisitos [[2]]. Sanción [1, 3]."),
    ).toEqual([1, 2, 3]);
    expect(citationRanks("[1-3]")).toEqual([1, 2, 3]);
    expect(citationRanks("[1 y 2]")).toEqual([1, 2]);
    expect(citationRanks("[2012]")).toEqual([2012]);
    expect(citationRanks("texto")).toEqual([]);
    // Fechas y rangos absurdos quedan como texto literal.
    expect(citationRanks("[12-05-2024]")).toEqual([]);
    expect(citationRanks("[1-05-2024]")).toEqual([]);
    expect(citationRanks("[1-2012]")).toEqual([]);
    expect(citationRanks("[3-1]")).toEqual([]);
  });
});

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
            pdfPageCount: 47,
            pageStart: 33,
            rank: 1,
            relevanceScore: 0.92,
            sectionTitle: "Licencias",
            versionNumber: 1,
          },
        ]}
      />,
    );

    // Plegadas por defecto: primero se lee la respuesta.
    expect(
      screen.queryByRole("heading", { name: "Referencias" }),
    ).not.toBeInTheDocument();
    const toggle = screen.getByRole("button", {
      name: /Ver fuentes disponibles.*1 referencia.*1 documento/u,
    });
    const panel = document.getElementById(
      toggle.getAttribute("aria-controls") as string,
    );
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(panel).toHaveAttribute("inert");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(panel).not.toHaveAttribute("inert");
    expect(screen.getByRole("heading", { name: "Referencias" })).toBeVisible();
    const table = screen.getByRole("table", {
      name: "Fuentes documentales, ubicación y descarga",
    });
    expect(table).toBeVisible();
    const downloadsHeading = screen.getByRole("heading", {
      name: "Documentos disponibles",
    });
    expect(
      table.compareDocumentPosition(downloadsHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.getByRole("columnheader", { name: "Documento" }),
    ).toBeVisible();
    expect(within(table).getByText("Ley de Reforma Magisterial")).toBeVisible();
    expect(within(table).getByText("Vigente")).toBeVisible();
    expect(within(table).getByText("Artículo 5")).toBeVisible();
    expect(within(table).getByText("5.1")).toBeVisible();
    // El puntaje técnico no se muestra al usuario (se leía como confiabilidad).
    expect(
      screen.queryByText(/Coincidencia documental/u),
    ).not.toBeInTheDocument();
    expect(within(table).getByText("Fuente número:")).toBeInTheDocument();
    expect(within(table).getByText("Página PDF:")).toBeInTheDocument();
    expect(within(table).getByText("33 de 47")).toBeVisible();
    expect(within(table).getByText("Versión 1")).toBeVisible();
    expect(
      screen.getByRole("link", {
        name: /Abrir fuente \[1\]: Ley de Reforma Magisterial/i,
      }),
    ).toHaveAttribute(
      "href",
      "/api/chat/sources/9c8b56af-6d0c-4fef-881e-7c00907540dd/download?pagina=33",
    );
    expect(
      screen.getByRole("link", {
        name: /Abrir fuente \[1\]: Ley de Reforma Magisterial/i,
      }),
    ).toHaveAttribute("target", "_blank");
    expect(
      screen.getByRole("link", {
        name: /Abrir fuente \[1\]: Ley de Reforma Magisterial/i,
      }),
    ).toHaveTextContent("Ver documento");
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

    fireEvent.click(
      screen.getByRole("button", { name: /Ver fuentes disponibles/u }),
    );
    const table = screen.getByRole("table", {
      name: "Fuentes documentales, ubicación y descarga",
    });
    expect(within(table).getByText("10–12").closest("td")).toHaveAttribute(
      "data-label",
      "Pág.",
    );
    expect(
      screen.queryByText(/Coincidencia documental/u),
    ).not.toBeInTheDocument();
    const sourceRow = within(table).getByText("Reglamento").closest("tr");
    expect(sourceRow).not.toBeNull();
    expect(
      within(sourceRow as HTMLTableRowElement).getByText(/Proceso:/),
    ).toHaveTextContent("Proceso: No especificado");
    // La celda «Ubicación» no acumula etiquetas vacías: una sola línea.
    expect(sourceRow).not.toHaveTextContent("Sección:");
    expect(sourceRow).not.toHaveTextContent("Artículo:");
    expect(
      within(sourceRow as HTMLTableRowElement).getByText(
        "No se identificó una ubicación más precisa en el fragmento",
      ),
    ).toBeVisible();
  });

  it("muestra solo los campos presentes del sustento", () => {
    render(
      <ChatSources
        defaultOpen
        sources={[
          {
            articleReference: null,
            documentSituation: "current",
            documentTitle: "Norma puntual",
            id: "dc8b56af-6d0c-4fef-881e-7c00907540dd",
            moduleName: null,
            numeralReference: "5.1",
            pageEnd: 3,
            pageStart: 3,
            rank: 1,
            relevanceScore: 0.8,
            sectionTitle: null,
            versionNumber: 1,
          },
        ]}
      />,
    );
    const row = within(
      screen.getByRole("table", {
        name: "Fuentes documentales, ubicación y descarga",
      }),
    )
      .getByText("Norma puntual")
      .closest("tr");

    expect(row).toHaveTextContent("Numeral o literal: 5.1");
    expect(row).not.toHaveTextContent("Sección:");
    expect(row).not.toHaveTextContent("Artículo:");
  });

  it("muestra el sustento derivado de la sección cuando existe", () => {
    render(
      <ChatSources
        defaultOpen
        sources={[
          {
            articleReference: null,
            documentSituation: "current",
            documentTitle: "Faq contratacion auxiliares",
            id: "ec8b56af-6d0c-4fef-881e-7c00907540dd",
            moduleName: null,
            numeralReference: null,
            pageEnd: 3,
            pageStart: 2,
            rank: 1,
            relevanceScore: 0.8,
            sectionTitle: "¿Cuáles son los requisitos para postular?",
            versionNumber: 1,
          },
        ]}
      />,
    );
    const row = within(
      screen.getByRole("table", {
        name: "Fuentes documentales, ubicación y descarga",
      }),
    )
      .getByText("Faq contratacion auxiliares")
      .closest("tr");

    expect(row).toHaveTextContent(
      "Sección o subtítulo: ¿Cuáles son los requisitos para postular?",
    );
    expect(row).not.toHaveTextContent("Artículo:");
    expect(row).not.toHaveTextContent("Numeral o literal:");
  });

  it("oculta encabezados genéricos de El Peruano y conserva la ubicación precisa", () => {
    render(
      <ChatSources
        sources={[
          {
            articleReference: "Artículo 3",
            documentSituation: "current",
            documentTitle: "Decreto Supremo N.° 306-2017-EF",
            id: "generic-section-source",
            moduleName: "Remuneraciones",
            numeralReference: "Literal h)",
            pageEnd: 1,
            pageStart: 1,
            rank: 1,
            relevanceScore: 0.91,
            sectionTitle:
              "7 NORMAS LEGALES Domingo 29 de octubre de 2017 El Peruano",
            versionNumber: 1,
          },
        ]}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Ver fuentes disponibles/u }),
    );
    const table = screen.getByRole("table", {
      name: "Fuentes documentales, ubicación y descarga",
    });
    const row = within(table)
      .getByText("Decreto Supremo N.° 306-2017-EF")
      .closest("tr");

    expect(screen.getByRole("columnheader", { name: "Ubicación" })).toBeVisible();
    expect(row).not.toHaveTextContent("NORMAS LEGALES");
    expect(row).toHaveTextContent("Artículo: Artículo 3");
    expect(row).toHaveTextContent("Numeral o literal: Literal h)");
  });

  it("muestra el subtítulo sin repetir su artículo", () => {
    render(
      <ChatSources
        sources={[
          {
            articleReference: "Artículo 3.-",
            documentSituation: "current",
            documentTitle: "Decreto Supremo N.° 306-2017-EF",
            id: "article-subtitle-source",
            moduleName: "Remuneraciones",
            numeralReference: "Literal h)",
            pageEnd: 1,
            pageStart: 1,
            rank: 1,
            relevanceScore: 0.91,
            sectionTitle:
              "Artículo 3.- Implementación de la nueva remuneración docente.",
            versionNumber: 1,
          },
        ]}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Ver fuentes disponibles/u }),
    );
    const row = within(
      screen.getByRole("table", {
        name: "Fuentes documentales, ubicación y descarga",
      }),
    )
      .getByText("Decreto Supremo N.° 306-2017-EF")
      .closest("tr");

    expect(row).toHaveTextContent(
      "Sección o subtítulo: Implementación de la nueva remuneración docente.",
    );
    expect(row).not.toHaveTextContent(
      "Sección o subtítulo: Artículo 3.-",
    );
    expect(row).toHaveTextContent("Artículo: Artículo 3.-");
  });

  it("no presenta como página PDF la ubicación sintética de un archivo Word", () => {
    render(
      <ChatSources
        sources={[
          {
            articleReference: null,
            documentSituation: "current",
            documentTitle: "Glosario institucional",
            id: "ac8b56af-6d0c-4fef-881e-7c00907540dd",
            mimeType:
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            moduleName: "Gestión",
            numeralReference: null,
            pageEnd: 1,
            pageStart: 1,
            pdfPageCount: 1,
            rank: 1,
            relevanceScore: 0.8,
            sectionTitle: "Siglas",
            versionNumber: 1,
          },
        ]}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Ver fuentes disponibles/u }),
    );
    expect(
      screen.getByText("Fragmento interno · sin paginación PDF"),
    ).toBeVisible();
    expect(screen.queryByText("1 de 1")).not.toBeInTheDocument();
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

    fireEvent.click(
      screen.getByRole("button", { name: /Ver fuentes disponibles/u }),
    );
    const table = screen.getByRole("table", {
      name: "Fuentes documentales, ubicación y descarga",
    });
    const replacedRow = within(table)
      .getByText("Norma sustituida de 2018")
      .closest("tr");
    const archivedRow = within(table)
      .getByText("Antecedente archivado de 2009")
      .closest("tr");
    expect(replacedRow).toHaveTextContent("Reemplazado / sin vigencia · Histórico");
    expect(archivedRow).toHaveTextContent("Archivado · Antecedente histórico");
    expect(screen.queryByText("Vigente")).not.toBeInTheDocument();
    expect(
      within(replacedRow as HTMLTableRowElement).getByRole("link", {
        name: /Abrir fuente \[1\]: Norma sustituida de 2018/,
      }),
    ).toHaveAttribute(
      "href",
      expect.stringMatching(
        /^\/api\/chat\/sources\/source-replaced\/download\?pagina=\d+$/u,
      ),
    );
    expect(
      within(archivedRow as HTMLTableRowElement).getByRole("link", {
        name: /Abrir fuente \[2\]: Antecedente archivado de 2009/,
      }),
    ).toHaveAttribute(
      "href",
      expect.stringMatching(
        /^\/api\/chat\/sources\/source-archived\/download\?pagina=\d+$/u,
      ),
    );
  });
});

describe("ChatDownloads", () => {
  const base = {
    articleReference: null,
    documentSituation: "current" as const,
    moduleName: "Licencias",
    numeralReference: null,
    pageEnd: 2,
    pageStart: 2,
    relevanceScore: 0.9,
    sectionTitle: null,
    versionNumber: 1,
  };

  it("muestra descargas explícitas y deduplica fragmentos del mismo documento", () => {
    render(
      <ChatDownloads
        sources={[
          {
            ...base,
            documentVersionId: "33333333-3333-4333-8333-333333333333",
            documentTitle: "Anexo de requisitos",
            id: "11111111-1111-4111-8111-111111111111",
            rank: 1,
          },
          {
            ...base,
            documentVersionId: "33333333-3333-4333-8333-333333333333",
            documentTitle: "Anexo de requisitos",
            id: "22222222-2222-4222-8222-222222222222",
            pageEnd: 3,
            pageStart: 3,
            rank: 2,
          },
        ]}
      />,
    );

    expect(screen.getAllByText("Anexo de requisitos")).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: "Descargar Anexo de requisitos" }),
    ).toHaveAttribute(
      "href",
      "/api/chat/sources/11111111-1111-4111-8111-111111111111/download?descargar=1",
    );
  });

  it("conserva dos documentos homónimos cuando sus versiones son distintas", () => {
    render(
      <ChatDownloads
        sources={[
          {
            ...base,
            documentTitle: "Anexo de requisitos",
            documentVersionId: "33333333-3333-4333-8333-333333333331",
            id: "11111111-1111-4111-8111-111111111111",
            rank: 1,
          },
          {
            ...base,
            documentTitle: "Anexo de requisitos",
            documentVersionId: "33333333-3333-4333-8333-333333333332",
            id: "22222222-2222-4222-8222-222222222222",
            rank: 2,
          },
        ]}
      />,
    );

    expect(
      screen.getAllByRole("link", { name: "Descargar Anexo de requisitos" }),
    ).toHaveLength(2);
  });
});

describe("ChatSources — fuentes citadas", () => {
  const base = {
    articleReference: null,
    documentSituation: "current" as const,
    moduleName: null,
    numeralReference: null,
    pageEnd: 1,
    pageStart: 1,
    relevanceScore: 0.8,
    sectionTitle: null,
    versionNumber: 1,
  };

  it("shows the cited sources first, anchored, and folds the uncited ones", () => {
    render(
      <ChatSources
        citedRanks={[2]}
        messageId="m-1"
        sources={[
          { ...base, documentTitle: "Norma revisada", id: "a", rank: 1 },
          { ...base, documentTitle: "Norma citada", id: "b", rank: 2 },
        ]}
      />,
    );

    const toggle = screen.getByRole("button", {
      name: /Ver fuentes disponibles.*1 referencia.*2 documentos/u,
    });
    fireEvent.click(toggle);
    expect(
      screen.getByText(/Documentos citados en la respuesta/u),
    ).toBeVisible();
    expect(document.getElementById("fuente-m-1-2")).toHaveTextContent(
      "Norma citada",
    );
    expect(
      screen.getByText(/Otros fragmentos revisados, no citados/u),
    ).toBeInTheDocument();
  });
});
