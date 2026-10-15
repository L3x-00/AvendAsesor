import { describe, expect, it } from "vitest";
import { chatCatalogDocumentSchema, chatSourceSchema } from "./types";

describe("chat page-count contracts", () => {
  it("accepts an unverified total without inventing one in catalog or sources", () => {
    expect(
      chatCatalogDocumentSchema.parse({
        documentId: "11111111-1111-4111-8111-111111111111",
        documentType: "DECRETO_SUPREMO",
        issuanceYear: 2026,
        mimeType: "application/pdf",
        originalFileName: "norma-grande.pdf",
        pageCount: null,
        resolutionNumber: "DS N.° 001-2026-EF",
        title: "Norma de prueba",
        versionId: "22222222-2222-4222-8222-222222222222",
      }).pageCount,
    ).toBeNull();

    expect(
      chatSourceSchema.parse({
        articleReference: null,
        documentSituation: "current",
        documentTitle: "Norma de prueba",
        id: "33333333-3333-4333-8333-333333333333",
        moduleName: "Remuneraciones",
        numeralReference: null,
        pageEnd: 3,
        pageStart: 3,
        pdfPageCount: null,
        rank: 1,
        relevanceScore: 0.9,
        sectionTitle: null,
        versionNumber: 1,
      }).pdfPageCount,
    ).toBeNull();
  });
});
