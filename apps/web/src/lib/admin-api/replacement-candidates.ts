import type { AdminApiClient } from "./client";

export interface ReplacementDocumentCandidate {
  id: string;
  title: string;
}

const REPLACEMENT_PAGE_SIZE = 100;

/**
 * Loads every eligible vigente document instead of silently truncating the
 * replacement selector to the first API page.
 */
export async function listReplacementDocumentCandidates(
  client: Pick<AdminApiClient, "listDocumentLibrary">,
  excludedDocumentId?: string,
): Promise<ReplacementDocumentCandidate[]> {
  const candidates: ReplacementDocumentCandidate[] = [];
  const seen = new Set<string>();
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  while (offset < total) {
    const page = await client.listDocumentLibrary({
      limit: REPLACEMENT_PAGE_SIZE,
      offset,
      situation: "current",
      sort: "title",
    });
    total = page.total;

    for (const item of page.items) {
      if (item.id === excludedDocumentId || seen.has(item.id)) continue;
      seen.add(item.id);
      candidates.push({ id: item.id, title: item.title });
    }

    if (page.items.length === 0) break;
    offset += page.limit || REPLACEMENT_PAGE_SIZE;
  }

  return candidates;
}
