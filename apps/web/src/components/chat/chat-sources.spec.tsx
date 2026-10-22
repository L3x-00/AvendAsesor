import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ChatDownloads,
  ChatSources,
  citationRanks,
  citedSourceRanks,
  holdPosition,
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
    const downloadsHeading = screen.getByText("Documentos disponibles (1)");
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
        "Páginas 10–12 del PDF · Sin sección o artículo identificado",
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

    fireEvent.click(
      screen.getByRole("button", { name: /Ver fuentes disponibles/u }),
    );
    expect(
      screen.getByText("Fragmento interno · sin paginación PDF"),
    ).toBeVisible();
    expect(screen.queryByText("1 de 1")).not.toBeInTheDocument();
  });

  it("ubica un fragmento sin estructura por su página PDF sin inventar el total", () => {
    render(
      <ChatSources
        defaultOpen
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
        defaultOpen
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
    fireEvent.click(screen.getByText(/^Documentos disponibles \(/u));
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
    expect(screen.getByRole("heading", { name: "Referencias" })).toBeVisible();
    expect(document.getElementById("fuente-m-1-2")).toHaveTextContent(
      "Norma citada",
    );
    expect(
      document
        .getElementById("fuente-m-1-2")
        ?.querySelector('[data-label="Ubicación"]'),
    ).toHaveTextContent("Página 1 del PDF");
    expect(
      document
        .getElementById("fuente-m-1-1")
        ?.querySelector('[data-label="Ubicación"]'),
    ).toHaveTextContent("Página 1 del PDF");
    const otherFragments = screen.getByText("Otros fragmentos revisados (1)");
    expect(otherFragments).toBeInTheDocument();
    expect(otherFragments.closest("details")).not.toHaveAttribute("open");
  });
});

/** Cola de fotogramas controlada por la prueba: ninguno corre solo. */
function frameQueue() {
  const queue: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    queue.push(callback);
    return queue.length;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  return {
    pending: () => queue.length,
    run: (timestamp: number) => queue.shift()?.(timestamp),
  };
}

/**
 * Elemento cuyo borde superior depende de cuánto creció el panel y de cuánto se
 * desplazó la página: lo que mide `getBoundingClientRect` en el navegador.
 */
function measuredElement(element: HTMLElement, startTop = 400) {
  const layout = { grown: 0, scrolled: 0 };
  vi.spyOn(element, "getBoundingClientRect").mockImplementation(
    () => ({ top: startTop + layout.grown - layout.scrolled }) as DOMRect,
  );
  const scrollBy = vi.fn((options: ScrollToOptions) => {
    layout.scrolled += options.top ?? 0;
  });
  Object.defineProperty(window, "scrollBy", {
    configurable: true,
    value: scrollBy,
    writable: true,
  });
  return { layout, scrollBy };
}

describe("holdPosition", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it("compensa en cada fotograma lo que el panel empuja el botón", () => {
    const frames = frameQueue();
    const button = document.createElement("button");
    document.body.append(button);
    const { layout, scrollBy } = measuredElement(button);

    holdPosition(button, 420);
    layout.grown = 40;
    frames.run(0);
    layout.grown = 100;
    frames.run(16);
    layout.grown = 100;
    frames.run(32);

    expect(scrollBy.mock.calls.map(([options]) => options)).toEqual([
      { behavior: "instant", top: 40 },
      { behavior: "instant", top: 60 },
    ]);
    // El botón terminó donde empezó: es la tabla la que se abrió hacia arriba.
    expect(button.getBoundingClientRect().top).toBe(400);
  });

  it("también compensa al plegar: el botón vuelve a su sitio sin saltar", () => {
    const frames = frameQueue();
    const button = document.createElement("button");
    document.body.append(button);
    const { layout, scrollBy } = measuredElement(button, 700);

    holdPosition(button, 420);
    layout.grown = -120;
    frames.run(0);

    expect(scrollBy).toHaveBeenCalledWith({ behavior: "instant", top: -120 });
  });

  it("deja de corregir al terminar la transición", () => {
    const frames = frameQueue();
    const button = document.createElement("button");
    document.body.append(button);
    measuredElement(button);

    holdPosition(button, 420);
    frames.run(0);
    expect(frames.pending()).toBe(1);
    frames.run(200);
    expect(frames.pending()).toBe(1);
    frames.run(430);
    expect(frames.pending()).toBe(0);
  });

  it("no se queda en bucle si el navegador entrega siempre la misma marca de tiempo", () => {
    const button = document.createElement("button");
    document.body.append(button);
    measuredElement(button);
    // Doble síncrono (como el de otras pruebas del chat): cada llamada ejecuta ya.
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("requestAnimationFrame", requestFrame);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    holdPosition(button, 420);

    expect(requestFrame.mock.calls.length).toBeLessThanOrEqual(120);
  });

  it("devuelve la función que cancela el fotograma pendiente", () => {
    frameQueue();
    const button = document.createElement("button");
    document.body.append(button);
    measuredElement(button);

    const stop = holdPosition(button, 420);
    stop();

    expect(window.cancelAnimationFrame).toHaveBeenCalled();
  });

  it("desplaza el contenedor con scroll propio cuando lo hay", () => {
    const frames = frameQueue();
    const scroller = document.createElement("div");
    scroller.setAttribute("style", "overflow-y: auto");
    Object.defineProperty(scroller, "scrollHeight", { value: 2000 });
    Object.defineProperty(scroller, "clientHeight", { value: 600 });
    Object.defineProperty(scroller, "scrollTop", { value: 50 });
    const scrollTo = vi.fn();
    scroller.scrollTo = scrollTo;
    const button = document.createElement("button");
    scroller.append(button);
    document.body.append(scroller);
    const { layout, scrollBy } = measuredElement(button);

    holdPosition(button, 420);
    layout.grown = 90;
    frames.run(0);

    expect(scrollTo).toHaveBeenCalledWith({ behavior: "instant", top: 140 });
    expect(scrollBy).not.toHaveBeenCalled();
  });
});

describe("ChatSources — despliegue hacia arriba", () => {
  const source = {
    articleReference: null,
    documentSituation: "current" as const,
    documentTitle: "Aprobación del cronograma de destaque 2026",
    id: "11111111-1111-4111-8111-111111111111",
    moduleName: "Destaque",
    numeralReference: null,
    pageEnd: 2,
    pageStart: 1,
    rank: 1,
    relevanceScore: 0.8,
    sectionTitle: null,
    versionNumber: 1,
  };

  function toggleOf(direction?: "down" | "up") {
    render(<ChatSources direction={direction} sources={[source]} />);
    const section = screen.getByLabelText("Referencias verificables");
    const toggle = within(section).getByRole("button", {
      name: /Ver fuentes disponibles/u,
    });
    return { section, toggle };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("por defecto se despliega hacia abajo, como en la ficha de orientación", () => {
    const { section, toggle } = toggleOf();

    expect(section).toHaveAttribute("data-direction", "down");
    expect(toggle.querySelector("svg path")).toHaveAttribute(
      "d",
      "m6 9 6 6 6-6",
    );
  });

  it("con direction=up pinta el panel sobre el botón y conserva el orden del DOM", () => {
    const { section, toggle } = toggleOf("up");
    const panel = document.getElementById(
      toggle.getAttribute("aria-controls") as string,
    ) as HTMLElement;

    expect(section).toHaveAttribute("data-direction", "up");
    // El orden visual lo da el CSS; el foco y el lector de pantalla siguen
    // entrando al panel después de activar el botón.
    expect(
      toggle.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(toggle.querySelector("svg path")).toHaveAttribute(
      "d",
      "m6 15 6-6 6 6",
    );
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(panel).not.toHaveAttribute("inert");
    expect(screen.getByRole("heading", { name: "Referencias" })).toBeVisible();
  });

  it("al tocar el botón ancla su posición mientras el panel crece hacia arriba", () => {
    const frames = frameQueue();
    const { toggle } = toggleOf("up");
    const { layout, scrollBy } = measuredElement(toggle);

    fireEvent.click(toggle);
    layout.grown = 150;
    frames.run(0);

    expect(scrollBy).toHaveBeenCalledWith({ behavior: "instant", top: 150 });
  });

  it("hacia abajo no toca el desplazamiento de la página", () => {
    const frames = frameQueue();
    const { toggle } = toggleOf("down");
    measuredElement(toggle);

    fireEvent.click(toggle);

    expect(frames.pending()).toBe(0);
    expect(window.scrollBy).not.toHaveBeenCalled();
  });

  it("una cita [n] abre sin animación ni anclaje, y el siguiente toque vuelve a animar", () => {
    const frames = frameQueue();
    const { section, toggle } = toggleOf("up");
    const { scrollBy } = measuredElement(toggle);

    toggle.setAttribute("data-instant", "");
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(section).toHaveAttribute("data-motion", "instant");
    expect(toggle).not.toHaveAttribute("data-instant");
    expect(frames.pending()).toBe(0);
    expect(scrollBy).not.toHaveBeenCalled();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(section).not.toHaveAttribute("data-motion");
    expect(frames.pending()).toBe(1);
  });

  it("detiene el anclaje si el componente se desmonta durante la transición", () => {
    frameQueue();
    const view = render(<ChatSources direction="up" sources={[source]} />);
    const toggle = screen.getByRole("button", {
      name: /Ver fuentes disponibles/u,
    });
    measuredElement(toggle);

    fireEvent.click(toggle);
    view.unmount();

    expect(window.cancelAnimationFrame).toHaveBeenCalled();
  });
});
