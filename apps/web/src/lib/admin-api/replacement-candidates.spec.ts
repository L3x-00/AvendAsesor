import { describe, expect, it, vi } from "vitest";
import { listReplacementDocumentCandidates } from "./replacement-candidates";

describe("listReplacementDocumentCandidates", () => {
  it("loads every page, removes duplicates, and excludes the edited document", async () => {
    const listDocumentLibrary = vi
      .fn()
      .mockResolvedValueOnce({
        items: [
          { id: "document-a", title: "Documento A" },
          { id: "document-b", title: "Documento B" },
        ],
        limit: 2,
        offset: 0,
        total: 4,
      })
      .mockResolvedValueOnce({
        items: [
          { id: "document-b", title: "Documento B" },
          { id: "document-c", title: "Documento C" },
        ],
        limit: 2,
        offset: 2,
        total: 4,
      });

    await expect(
      listReplacementDocumentCandidates(
        { listDocumentLibrary } as never,
        "document-a",
      ),
    ).resolves.toEqual([
      { id: "document-b", title: "Documento B" },
      { id: "document-c", title: "Documento C" },
    ]);
    expect(listDocumentLibrary).toHaveBeenNthCalledWith(1, {
      limit: 100,
      offset: 0,
      situation: "current",
      sort: "title",
    });
    expect(listDocumentLibrary).toHaveBeenNthCalledWith(2, {
      limit: 100,
      offset: 2,
      situation: "current",
      sort: "title",
    });
  });
});
