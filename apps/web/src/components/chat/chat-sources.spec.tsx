import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatSources } from "./chat-sources";

describe("ChatSources", () => {
  it("renders only the evidence snapshot received from the chat API", () => {
    render(
      <ChatSources
        sources={[
          {
            articleReference: "Artículo 5",
            documentTitle: "Ley de Reforma Magisterial",
            moduleName: "Licencias",
            numeralReference: null,
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
    expect(screen.getByText("Ley de Reforma Magisterial")).toBeVisible();
    expect(screen.getByText("92%")).toBeVisible();
  });

  it("preserves ranges and a clear fallback when source metadata is absent", () => {
    render(
      <ChatSources
        sources={[
          {
            articleReference: null,
            documentTitle: "Reglamento",
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

    expect(screen.getByText("10-12")).toBeVisible();
    expect(screen.getByText("No especificada")).toBeVisible();
    expect(screen.getByText("50%")).toBeVisible();
  });
});
