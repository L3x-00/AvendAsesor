import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ChatSource } from "@/lib/chat-api/types";
import { linkPageReferences } from "./chat-page-links";

const source = (overrides: Partial<ChatSource> = {}): ChatSource => ({
  articleReference: null,
  documentId: "11111111-1111-4111-8111-111111111111",
  documentSituation: "current",
  documentTitle: "Norma Técnica de contratación de auxiliares",
  documentType: "NORMA_TECNICA",
  documentVersionId: "22222222-2222-4222-8222-222222222222",
  id: "33333333-3333-4333-8333-333333333333",
  issuanceYear: 2026,
  mimeType: "application/pdf",
  moduleName: "Auxiliares de educación",
  numeralReference: null,
  pageEnd: 17,
  pageStart: 17,
  pdfPageCount: 41,
  rank: 1,
  relevanceScore: 0.9,
  resolutionNumber: null,
  sectionTitle: null,
  versionNumber: 1,
  ...overrides,
});

const renderReference = (text: string, sources: ChatSource[], rank?: number) =>
  render(
    <div data-testid="content">
      {linkPageReferences(text, sources, rank, "test")}
    </div>,
  );

describe("linkPageReferences", () => {
  it("lleva «Página 17 de 41» a esa página del documento citado", () => {
    renderReference(
      "6.2.6 La experiencia laboral se reconoce. Página 17 de 41 [1]",
      [source()],
      1,
    );

    const link = screen.getByRole("link", {
      name: /Abrir Página 17 de 41 de la fuente 1/,
    });
    expect(link).toHaveAttribute(
      "href",
      "/api/chat/sources/33333333-3333-4333-8333-333333333333/download?pagina=17",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveClass("avend-chat-page-link");
  });

  it("usa la fuente única aunque el texto no repita la cita", () => {
    renderReference("El requisito consta en la página 3 de 10.", [
      source({ pageEnd: 3, pageStart: 3 }),
    ]);

    expect(
      screen.getByRole("link", { name: /Abrir página 3 de 10/ }),
    ).toHaveAttribute(
      "href",
      "/api/chat/sources/33333333-3333-4333-8333-333333333333/download?pagina=3",
    );
  });

  it("abre la página física del fragmento cuando la impresa no coincide", () => {
    renderReference("Página 17 de 41", [
      source({ pageEnd: 22, pageStart: 22, pdfPageCount: 46 }),
    ]);

    const link = screen.getByRole("link", {
      name: /Abrir Página 17 de 41 de la fuente 1.*página 22 del PDF/,
    });
    expect(link).toHaveAttribute(
      "href",
      "/api/chat/sources/33333333-3333-4333-8333-333333333333/download?pagina=22",
    );
  });

  it("no adivina la fuente cuando hay varias y ninguna cita cercana", () => {
    renderReference("El requisito consta en la página 3 de 10.", [
      source(),
      source({
        documentVersionId: "44444444-4444-4444-8444-444444444444",
        id: "55555555-5555-4555-8555-555555555555",
        rank: 2,
      }),
    ]);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByTestId("content")).toHaveTextContent("página 3 de 10");
  });

  it("no enlaza una página que excede el total del documento", () => {
    renderReference("Página 45 de 41", [source()], 1);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("abre un rango de páginas en su primera página", () => {
    renderReference(
      "Páginas 10-12 de 20",
      [source({ pageEnd: 12, pageStart: 10 })],
      1,
    );

    expect(
      screen.getByRole("link", { name: /Abrir Páginas 10-12 de 20/ }),
    ).toHaveAttribute(
      "href",
      "/api/chat/sources/33333333-3333-4333-8333-333333333333/download?pagina=10",
    );
  });

  it("no enlaza una página en un documento que no es PDF", () => {
    renderReference(
      "Página 17 de 41",
      [
        source({
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
      ],
      1,
    );

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("no enlaza una página física que excede el total del PDF", () => {
    renderReference(
      "Página 50 de 60",
      [source({ pageEnd: 50, pageStart: 50, pdfPageCount: 46 })],
      1,
    );

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("deja intacto el texto que no menciona una página", () => {
    renderReference(
      "La remuneración se fija por decreto supremo. [1]",
      [source()],
      1,
    );

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByTestId("content")).toHaveTextContent(
      "La remuneración se fija por decreto supremo.",
    );
  });
});
