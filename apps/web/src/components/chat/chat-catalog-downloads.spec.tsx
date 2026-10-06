import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { ChatCatalogDocument } from "@/lib/chat-api/types";
import { ChatCatalogDownloads } from "./chat-catalog-downloads";

function documents(count: number): ChatCatalogDocument[] {
  return Array.from({ length: count }, (_, index) => ({
    documentId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    documentType: index % 2 ? "ANEXO" : "LEY",
    issuanceYear: 2026,
    mimeType: "application/pdf",
    originalFileName: `archivo-${index + 1}.pdf`,
    pageCount: 5,
    resolutionNumber: null,
    title: `Documento ${index + 1}`,
    versionId: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  }));
}

describe("ChatCatalogDownloads", () => {
  it("muestra corpus grandes de forma progresiva sin perder archivos", async () => {
    const user = userEvent.setup();
    render(<ChatCatalogDownloads documents={documents(35)} />);

    expect(
      screen.getAllByRole("link", { name: /Descargar Documento/u }),
    ).toHaveLength(10);
    expect(screen.getByText(/35 archivos del catálogo/u)).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Ver 10 archivos más" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Ver 10 archivos más" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Ver 5 archivos más" }),
    );

    expect(
      screen.getAllByRole("link", { name: /Descargar Documento/u }),
    ).toHaveLength(35);
    expect(
      screen.queryByRole("button", { name: /archivos más/u }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Descargar Documento 35" }),
    ).toHaveAttribute(
      "href",
      "/api/chat/catalog/documents/20000000-0000-4000-8000-000000000035/download",
    );
  });
});
