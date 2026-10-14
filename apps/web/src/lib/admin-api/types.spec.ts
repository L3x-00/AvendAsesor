import { describe, expect, it } from "vitest";
import { managedDocumentVersionSchema } from "./types";

describe("managed document version page count", () => {
  it("keeps an unknown PDF total as null until ingestion verifies it", () => {
    const version = managedDocumentVersionSchema.parse({
      fileSizeBytes: 23_000_000,
      id: "11111111-1111-4111-8111-111111111111",
      ingestionStatus: "pending",
      ingestionUpdatedAt: "2026-10-14T12:00:00.000Z",
      issuanceYear: 2026,
      originalFileName: "norma-grande.pdf",
      pageCount: null,
      uploadedAt: "2026-10-14T12:00:00.000Z",
      uploadedBy: null,
      uploadedByName: null,
      versionNumber: 1,
      versionRelation: null,
    });

    expect(version.pageCount).toBeNull();
  });
});
