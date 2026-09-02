import { describe, expect, it } from "vitest";
import {
  countDocumentLibraryFilters,
  documentLibraryHref,
  parseDocumentLibraryQuery,
} from "./document-library-query";

describe("document library URL query", () => {
  it("normalizes bounded filters and calculates a server-side offset", () => {
    const parsed = parseDocumentLibraryQuery({
      documentType: " ley ",
      issuanceYear: "2026",
      page: "3",
      q: " licencia docente ",
      situation: "current",
      sort: "title",
    });

    expect(parsed).toMatchObject({
      documentType: "LEY",
      issuanceYear: 2026,
      limit: 20,
      offset: 40,
      page: 3,
      q: "licencia docente",
      situation: "current",
      sort: "title",
    });
    expect(countDocumentLibraryFilters(parsed)).toBe(4);
  });

  it("drops invalid allowlist values and preserves filters in pagination links", () => {
    const parsed = parseDocumentLibraryQuery({
      moduleId: "not-a-uuid",
      page: "-4",
      q: "licencia",
      sort: "DROP TABLE",
      technicalStatus: "error",
    });

    expect(parsed).toMatchObject({
      moduleId: undefined,
      offset: 0,
      page: 1,
      sort: "newest",
    });
    expect(documentLibraryHref(parsed, 2)).toBe(
      "/admin/documents?q=licencia&technicalStatus=error&page=2",
    );
  });
});
