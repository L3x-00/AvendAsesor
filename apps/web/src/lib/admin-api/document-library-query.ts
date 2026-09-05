import { z } from "zod";
import type { DocumentLibraryQuery } from "./types";

export const DOCUMENT_LIBRARY_PAGE_SIZE = 20;

type SearchValue = string | string[] | undefined;
export type DocumentLibrarySearchParams = Record<string, SearchValue>;

export interface ParsedDocumentLibraryQuery extends DocumentLibraryQuery {
  page: number;
}

const uuidSchema = z.string().uuid();
const situations = new Set(["archived", "current", "replaced"]);
const technicalStatuses = new Set(["error", "pending_approval", "ready"]);
const sorts = new Set([
  "document_type",
  "issuing_entity",
  "module",
  "newest",
  "oldest",
  "situation",
  "technical_status",
  "title",
  "upload_date",
  "year",
]);

function first(value: SearchValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function clean(value: SearchValue, maxLength: number): string | undefined {
  const normalized = first(value)?.trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function uuid(value: SearchValue): string | undefined {
  const parsed = uuidSchema.safeParse(clean(value, 64));
  return parsed.success ? parsed.data : undefined;
}

export function parseDocumentLibraryQuery(
  params: DocumentLibrarySearchParams,
): ParsedDocumentLibraryQuery {
  const rawPage = Number(first(params.page));
  const page =
    Number.isSafeInteger(rawPage) && rawPage >= 1
      ? Math.min(rawPage, 10_000)
      : 1;
  const rawYear = Number(first(params.issuanceYear));
  const issuanceYear =
    Number.isInteger(rawYear) && rawYear >= 1800 && rawYear <= 2200
      ? rawYear
      : undefined;
  const rawType = clean(params.documentType, 64)?.toUpperCase();
  const documentType =
    rawType && /^[A-Z][A-Z0-9_]{1,63}$/.test(rawType) ? rawType : undefined;
  const rawSituation = clean(params.situation, 32);
  const rawTechnicalStatus = clean(params.technicalStatus, 32);
  const rawSort = clean(params.sort, 32);

  return {
    documentType,
    issuanceYear,
    issuingEntity: clean(params.issuingEntity, 255),
    limit: DOCUMENT_LIBRARY_PAGE_SIZE,
    moduleId: uuid(params.moduleId),
    offset: (page - 1) * DOCUMENT_LIBRARY_PAGE_SIZE,
    page,
    q: clean(params.q, 200),
    situation: situations.has(rawSituation ?? "")
      ? (rawSituation as ParsedDocumentLibraryQuery["situation"])
      : undefined,
    sort: sorts.has(rawSort ?? "")
      ? (rawSort as ParsedDocumentLibraryQuery["sort"])
      : "newest",
    submoduleId: uuid(params.submoduleId),
    technicalStatus: technicalStatuses.has(rawTechnicalStatus ?? "")
      ? (rawTechnicalStatus as ParsedDocumentLibraryQuery["technicalStatus"])
      : undefined,
  };
}

export function countDocumentLibraryFilters(
  query: ParsedDocumentLibraryQuery,
): number {
  return [
    query.documentType,
    query.issuanceYear,
    query.issuingEntity,
    query.moduleId,
    query.q,
    query.situation,
    query.submoduleId,
    query.technicalStatus,
  ].filter((value) => value !== undefined).length;
}

export function documentLibraryHref(
  query: ParsedDocumentLibraryQuery,
  page: number,
  basePath = "/admin/documents",
): string {
  const params = new URLSearchParams();

  if (query.q) params.set("q", query.q);
  if (query.issuanceYear !== undefined) {
    params.set("issuanceYear", String(query.issuanceYear));
  }
  if (query.documentType) params.set("documentType", query.documentType);
  if (query.issuingEntity) params.set("issuingEntity", query.issuingEntity);
  if (query.moduleId) params.set("moduleId", query.moduleId);
  if (query.submoduleId) params.set("submoduleId", query.submoduleId);
  if (query.situation) params.set("situation", query.situation);
  if (query.technicalStatus) {
    params.set("technicalStatus", query.technicalStatus);
  }
  if (query.sort && query.sort !== "newest") params.set("sort", query.sort);
  if (page > 1) params.set("page", String(page));

  const serialized = params.toString();
  return serialized ? `${basePath}?${serialized}` : basePath;
}
