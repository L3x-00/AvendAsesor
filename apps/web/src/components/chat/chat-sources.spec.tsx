import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ChatDownloads,
  ChatSources,
  citationRanks,
  citedSourceRanks,
  groupReferenceSources,
  singleCitedSource,
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

describe("singleCitedSource", () => {
  const source = (rank: number, documentVersionId?: string) =>
    ({
      documentVersionId,
      id: `00000000-0000-4000-8000-00000000000${rank}`,
      rank,
    }) as Parameters<typeof singleCitedSource>[1][number];
  const versionA = "33333333-3333-4333-8333-333333333331";
  const versionB = "33333333-3333-4333-8333-333333333332";

  it("devuelve la fuente de la primera cita cuando todas son del mismo documento", () => {
    const sources = [source(1, versionA), source(2, versionA)];
    expect(singleCitedSource("Uno [2]. Dos [1].", sources)?.rank).toBe(2);
    expect(singleCitedSource("Uno [1]. Dos [1].", sources)?.rank).toBe(1);
  });

  it("no agrupa citas de documentos distintos", () => {
    const sources = [source(1, versionA), source(2, versionB)];
    expect(singleCitedSource("Uno [1]. Dos [2].", sources)).toBeUndefined();
  });

  it("solo cuenta lo citado: una fuente disponible pero no citada no impide agrupar", () => {
    const sources = [source(1, versionA), source(2, versionB)];
    expect(singleCitedSource("Uno [1].", sources)?.rank).toBe(1);
  });

  it("no consolida si alguna cita carece de una fuente conocida", () => {
    const sources = [source(1, versionA)];
    expect(singleCitedSource("Uno [1, 9].", sources)).toBeUndefined();
    expect(singleCitedSource("Uno [9].", sources)).toBeUndefined();
    expect(singleCitedSource("Sin citas.", sources)).toBeUndefined();
  });

  it("sin identidad de versión (historial antiguo) cada fuente es un documento distinto", () => {
    const sources = [source(1), source(2)];
    expect(singleCitedSource("Uno [1]. Dos [2].", sources)).toBeUndefined();
    expect(singleCitedSource("Uno [1]. Dos [1].", sources)?.rank).toBe(1);
  });
});

describe("groupReferenceSources", () => {
  const source = (rank: number, documentVersionId?: string) =>
    ({
      documentVersionId,
      id: `00000000-0000-4000-8000-00000000000${rank}`,
      rank,
    }) as Parameters<typeof groupReferenceSources>[0][number];
  const versionA = "33333333-3333-4333-8333-333333333331";
  const versionB = "33333333-3333-4333-8333-333333333332";

  it("reúne solo fragmentos de la misma versión y conserva los historiales ambiguos", () => {
    const groups = groupReferenceSources([
      source(1, versionA),
      source(2, versionA),
      source(3, versionB),
      source(4),
      source(5),
    ]);

    expect(groups.map((group) => group.sources.map((item) => item.rank))).toEqual(
      [[1, 2], [3], [4], [5]],
    );
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

    expect(screen.getByRole("heading", { name: "Referencias" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Ver fuentes disponibles/u }),
    ).not.toBeInTheDocument();
    const table = screen.getByRole("table", {
      name: "Fuentes documentales, ubicación y descarga",
    });
    expect(table).toBeVisible();
    const downloadsHeading = screen.getByText("Documentos disponibles", {
      selector: "summary span",
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
    const downloads = downloadsHeading.closest("details");
    expect(downloads).not.toHaveAttribute("open");
    expect(
      screen.getByRole("link", {
        name: "Descargar Ley de Reforma Magisterial",
      }),
    ).not.toBeVisible();
    fireEvent.click(downloadsHeading);
    expect(downloads).toHaveAttribute("open");
    expect(
      screen.getByRole("heading", { name: "Documentos disponibles" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", {
        name: "Descargar Ley de Reforma Magisterial",
      }),
    ).toBeVisible();
    fireEvent.click(downloadsHeading);
    expect(downloads).not.toHaveAttribute("open");
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

  it("muestra una sola referencia por documento y reúne sus páginas citadas", () => {
    const documentVersionId = "33333333-3333-4333-8333-333333333333";
    const common = {
      articleReference: null,
      documentSituation: "current" as const,
      documentTitle: "Norma técnica sobre el proceso de encargatura",
      documentVersionId,
      mimeType: "application/pdf",
      moduleName: "Encargatura docente",
      numeralReference: null,
      pdfPageCount: 64,
      relevanceScore: 0.9,
      sectionTitle: null,
      versionNumber: 1,
    };
    render(
      <ChatSources
        citedRanks={[1, 2, 5]}
        messageId="m-referencias"
        sources={[
          { ...common, id: "11111111-1111-4111-8111-111111111111", pageEnd: 36, pageStart: 36, rank: 1 },
          { ...common, id: "22222222-2222-4222-8222-222222222222", pageEnd: 11, pageStart: 11, rank: 2 },
          { ...common, id: "55555555-5555-4555-8555-555555555555", pageEnd: 27, pageStart: 27, rank: 5 },
        ]}
      />,
    );

    const table = screen.getByRole("table", {
      name: "Fuentes documentales, ubicación y descarga",
    });
    const row = within(table)
      .getByText("Norma técnica sobre el proceso de encargatura")
      .closest("tr");
    expect(row).toHaveAttribute("id", "fuente-m-referencias-1");
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    expect(within(row as HTMLTableRowElement).getByText("11, 27, 36 de 64")).toBeVisible();
    expect(row).toHaveTextContent("Sin sección o artículo identificado");
    expect(document.getElementById("fuente-m-referencias-2")).toHaveAttribute(
      "tabindex",
      "-1",
    );
    expect(document.getElementById("fuente-m-referencias-5")).toHaveTextContent(
      "Fuente 5 incluida en esta referencia",
    );
    expect(
      screen.getByRole("link", {
        name: "Abrir fuente [1]: Norma técnica sobre el proceso de encargatura (se abre en una pestaña nueva)",
      }),
    ).toHaveAttribute(
      "href",
      "/api/chat/sources/11111111-1111-4111-8111-111111111111/download?pagina=36",
    );
  });

  it("conserva las ubicaciones jurídicas distintas dentro de una referencia agrupada", () => {
    const documentVersionId = "33333333-3333-4333-8333-333333333334";
    render(
      <ChatSources
        citedRanks={[1, 2]}
        sources={[
          {
            articleReference: "Artículo 4",
            documentSituation: "current",
            documentTitle: "Reglamento de prueba",
            documentVersionId,
            id: "11111111-1111-4111-8111-111111111112",
            mimeType: "application/pdf",
            moduleName: "Pruebas",
            numeralReference: "4.1",
            pageEnd: 11,
            pageStart: 11,
            pdfPageCount: 64,
            rank: 1,
            relevanceScore: 0.9,
            sectionTitle: null,
            versionNumber: 1,
          },
          {
            articleReference: "Artículo 6",
            documentSituation: "current",
            documentTitle: "Reglamento de prueba",
            documentVersionId,
            id: "22222222-2222-4222-8222-222222222223",
            mimeType: "application/pdf",
            moduleName: "Pruebas",
            numeralReference: "6.2",
            pageEnd: 27,
            pageStart: 27,
            pdfPageCount: 64,
            rank: 2,
            relevanceScore: 0.9,
            sectionTitle: null,
            versionNumber: 1,
          },
        ]}
      />,
    );

    const table = screen.getByRole("table", {
      name: "Fuentes documentales, ubicación y descarga",
    });
    const row = within(table).getByText("Reglamento de prueba").closest("tr");
    expect(within(row as HTMLTableRowElement).getByText("11, 27 de 64")).toBeVisible();
    expect(row).toHaveTextContent("Artículo: Artículo 4 · Numeral o literal: 4.1");
    expect(row).toHaveTextContent("Artículo: Artículo 6 · Numeral o literal: 6.2");
  });

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
        "Páginas 10–12 del PDF · Sin sección o artículo identificado",
      ),
    ).toBeVisible();
  });

  it("muestra solo los campos presentes del sustento", () => {
    render(
      <ChatSources
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

    const table = screen.getByRole("table", {
      name: "Fuentes documentales, ubicación y descarga",
    });
    const row = within(table)
      .getByText("Decreto Supremo N.° 306-2017-EF")
      .closest("tr");

    expect(
      screen.getByRole("columnheader", { name: "Ubicación" }),
    ).toBeVisible();
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
    expect(row).not.toHaveTextContent("Sección o subtítulo: Artículo 3.-");
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

    expect(
      screen.getByText("Fragmento interno · sin paginación PDF"),
    ).toBeVisible();
    expect(screen.queryByText("1 de 1")).not.toBeInTheDocument();
  });

  it("ubica un fragmento sin estructura por su página PDF sin inventar el total", () => {
    render(
      <ChatSources
        sources={[
          {
            articleReference: null,
            documentSituation: "current",
            documentTitle: "Decreto Supremo N.° 049-2025-EF",
            id: "salary-page-source",
            mimeType: "application/pdf",
            moduleName: "Remuneraciones",
            numeralReference: null,
            pageEnd: 3,
            pageStart: 3,
            rank: 1,
            relevanceScore: 0.9,
            sectionTitle:
              "7 NORMAS LEGALES Jueves 20 de marzo de 2025 El Peruano",
            versionNumber: 1,
          },
        ]}
      />,
    );
    expect(
      screen.getByText(
        "Página 3 del PDF · Sin sección o artículo identificado",
      ),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: /Abrir fuente/u })).toHaveAttribute(
      "href",
      "/api/chat/sources/salary-page-source/download?pagina=3",
    );
    expect(screen.queryByText("3 de 3")).not.toBeInTheDocument();
  });

  it("mantiene una ubicación honesta para Word sin sección ni paginación física", () => {
    render(
      <ChatSources
        sources={[
          {
            articleReference: null,
            documentSituation: "current",
            documentTitle: "Preguntas frecuentes",
            id: "faq-word-source",
            mimeType:
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            moduleName: null,
            numeralReference: null,
            pageEnd: 2,
            pageStart: 1,
            rank: 1,
            relevanceScore: 0.8,
            sectionTitle: null,
            versionNumber: 1,
          },
        ]}
      />,
    );
    expect(
      screen.getByText(
        "Fragmento del documento · Sin sección o artículo identificado",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/Páginas 1–2 del PDF/u)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Abrir fuente/u })).toHaveAttribute(
      "href",
      "/api/chat/sources/faq-word-source/download?pagina=1",
    );
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

    const table = screen.getByRole("table", {
      name: "Fuentes documentales, ubicación y descarga",
    });
    const replacedRow = within(table)
      .getByText("Norma sustituida de 2018")
      .closest("tr");
    const archivedRow = within(table)
      .getByText("Antecedente archivado de 2009")
      .closest("tr");
    expect(replacedRow).toHaveTextContent(
      "Reemplazado / sin vigencia · Histórico",
    );
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
  function openDownloads() {
    fireEvent.click(
      screen.getByText("Documentos disponibles", { selector: "summary span" }),
    );
  }
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

    openDownloads();
    expect(screen.getAllByText("Anexo de requisitos")).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: "Descargar Anexo de requisitos" }),
    ).toHaveAttribute(
      "href",
      "/api/chat/sources/11111111-1111-4111-8111-111111111111/download?descargar=1",
    );
  });

  it("presenta el plegable con icono, cantidad y flecha en lugar del triángulo nativo", () => {
    const { container } = render(
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
            documentVersionId: "44444444-4444-4444-8444-444444444444",
            documentTitle: "Directiva de licencias",
            id: "22222222-2222-4222-8222-222222222222",
            rank: 2,
          },
        ]}
      />,
    );

    const summary = container.querySelector("summary");
    expect(summary).not.toBeNull();
    // La cantidad va en una insignia propia y el nombre queda sin paréntesis.
    expect(within(summary as HTMLElement).getByText("2")).toBeVisible();
    expect(
      within(summary as HTMLElement).getByText("Documentos disponibles"),
    ).toBeVisible();
    expect(summary?.textContent).not.toContain("(");
    // Icono y flecha son decorativos: el lector de pantalla lee solo nombre y cantidad.
    expect(summary?.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(1);
    expect(
      summary?.querySelector('span[aria-hidden="true"] img[src="/microsoft-word.svg"]'),
    ).not.toBeNull();
    // El lector de pantalla anuncia nombre y cantidad con el mismo formato de siempre.
    expect(summary).toHaveAttribute("aria-label", "Documentos disponibles (2)");
    // Sigue siendo un <details> nativo: se abre sin JavaScript propio.
    const details = container.querySelector("details");
    expect(details).not.toHaveAttribute("open");
    fireEvent.click(summary as HTMLElement);
    expect(details).toHaveAttribute("open");
  });

  it("lista las descargas del documento más nuevo al más antiguo, con los que no tienen año al final", () => {
    const withYear = (
      title: string,
      rank: number,
      issuanceYear: number | null,
      versionSuffix = String(rank),
    ) => ({
      ...base,
      documentTitle: title,
      documentVersionId: `33333333-3333-4333-8333-33333333333${versionSuffix}`,
      id: `11111111-1111-4111-8111-11111111111${rank}`,
      issuanceYear,
      rank,
    });
    render(
      <ChatDownloads
        sources={[
          // El orden de entrada es el de relevancia, no el cronológico.
          withYear("Norma 2017", 1, 2017),
          withYear("Norma 2025", 2, 2025),
          withYear("Norma sin año", 3, null),
          withYear("Norma 2022 A", 4, 2022),
          withYear("Norma 2022 B", 5, 2022),
          // Otro fragmento del documento 2025: no duplica la fila.
          withYear("Norma 2025", 6, 2025, "2"),
        ]}
      />,
    );

    openDownloads();
    const titles = within(screen.getByRole("list"))
      .getAllByRole("listitem")
      .map((item) => within(item).getByRole("strong").textContent);

    expect(titles).toEqual([
      "Norma 2025",
      "Norma 2022 A",
      "Norma 2022 B",
      "Norma 2017",
      "Norma sin año",
    ]);
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

    openDownloads();
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

  it.each([1, 2, 4])(
    "muestra %i referencias citadas sin desplegar y conserva las descargas",
    (count) => {
      const sources = Array.from({ length: count + 1 }, (_, index) => ({
        ...base,
        documentTitle: `Norma ${index + 1}`,
        id: `id-${index + 1}`,
        rank: index + 1,
      }));
      render(
        <ChatSources
          citedRanks={sources.slice(0, count).map((source) => source.rank)}
          messageId="m-1"
          sources={sources}
        />,
      );
      const table = screen.getByRole("table", {
        name: "Fuentes documentales, ubicación y descarga",
      });
      expect(within(table).getAllByRole("row")).toHaveLength(count + 1);
      expect(document.getElementById(`fuente-m-1-${count}`)).toHaveTextContent(
        `Norma ${count}`,
      );
      expect(document.getElementById(`fuente-m-1-${count + 1}`)).toBeNull();
      expect(
        screen.queryByText("Otros fragmentos revisados"),
      ).not.toBeInTheDocument();
      expect(
        screen
          .getByText("Documentos disponibles", { selector: "summary span" })
          .closest("details"),
      ).not.toHaveAttribute("open");
      expect(table.querySelectorAll("tbody strong, tbody b")).toHaveLength(0);
    },
  );
});
