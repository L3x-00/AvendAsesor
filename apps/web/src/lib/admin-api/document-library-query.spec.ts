import { describe, expect, it } from "vitest";
import {
  clearedLibraryFiltersHref,
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

  it("accepts the upload-date and uploader filters the client asked for", () => {
    const parsed = parseDocumentLibraryQuery({
      createdBy: "8d4b660b-9e94-4d34-a3d2-2548a83587e1",
      createdFrom: "2026-01-01",
      createdTo: "2026-12-31",
    });

    expect(parsed).toMatchObject({
      createdBy: "8d4b660b-9e94-4d34-a3d2-2548a83587e1",
      createdFrom: "2026-01-01",
      createdTo: "2026-12-31",
    });
    expect(countDocumentLibraryFilters(parsed)).toBe(3);
    expect(documentLibraryHref(parsed, 1)).toContain(
      "createdFrom=2026-01-01&createdTo=2026-12-31",
    );
  });

  it("rejects a day that does not exist instead of rolling it over", () => {
    // Date.parse desborda 2026-02-30 al 2 de marzo: sería un filtro que el
    // administrador nunca eligió.
    expect(
      parseDocumentLibraryQuery({ createdFrom: "2026-02-30" }).createdFrom,
    ).toBeUndefined();
    expect(
      parseDocumentLibraryQuery({ createdTo: "no-es-fecha" }).createdTo,
    ).toBeUndefined();
  });

  it("ignores an inverted upload-date range rather than emptying the library", () => {
    const parsed = parseDocumentLibraryQuery({
      createdFrom: "2026-12-31",
      createdTo: "2026-01-01",
    });

    expect(parsed.createdFrom).toBeUndefined();
    expect(parsed.createdTo).toBe("2026-01-01");
  });

  it("keeps the chosen ordering when the administrator clears the filters", () => {
    const parsed = parseDocumentLibraryQuery({ q: "licencia", sort: "title" });

    expect(clearedLibraryFiltersHref(parsed)).toBe("/admin/documents?sort=title");
    expect(
      clearedLibraryFiltersHref(
        parseDocumentLibraryQuery({ q: "licencia" }),
        "/admin/modules/abc",
      ),
    ).toBe("/admin/modules/abc");
  });
});
