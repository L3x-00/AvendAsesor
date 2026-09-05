import type { AdministrativeUserAccessState } from "./types";

export const USER_DIRECTORY_PAGE_SIZE = 25;

export type UserGroup = "docente" | "staff";

/** "all" plus the derived access states the API can filter by. */
export type UserStatusFilter = "all" | AdministrativeUserAccessState;

type SearchValue = string | string[] | undefined;
export type UserDirectorySearchParams = Record<string, SearchValue>;

export interface ParsedUserDirectoryQuery {
  group: UserGroup;
  page: number;
  search?: string;
  status: UserStatusFilter;
}

const ACCESS_STATE_FILTERS: readonly UserStatusFilter[] = [
  "activo",
  "expirado",
  "pausado",
  "por_vencer",
];

/** Links created before vigencias existed used account-status values. */
const LEGACY_STATUS_ALIASES: Record<string, UserStatusFilter> = {
  active: "activo",
  suspended: "pausado",
};

function first(value: SearchValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function clean(value: SearchValue, maxLength: number): string | undefined {
  const normalized = first(value)?.trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function parseStatus(raw: string | undefined): UserStatusFilter {
  if (!raw) return "all";
  if ((ACCESS_STATE_FILTERS as readonly string[]).includes(raw)) {
    return raw as UserStatusFilter;
  }
  // Own-property check only: otherwise "toString" or "constructor" would
  // resolve through the prototype and escape the allowlist as a function.
  return Object.hasOwn(LEGACY_STATUS_ALIASES, raw)
    ? LEGACY_STATUS_ALIASES[raw]
    : "all";
}

export function parseUserDirectoryQuery(
  params: UserDirectorySearchParams,
): ParsedUserDirectoryQuery {
  const rawGroup = clean(params.group, 16);
  const rawPage = Number(first(params.page));

  return {
    group: rawGroup === "staff" ? "staff" : "docente",
    page:
      Number.isSafeInteger(rawPage) && rawPage >= 1
        ? Math.min(rawPage, 10_000)
        : 1,
    search: clean(params.search, 160),
    status: parseStatus(clean(params.status, 16)),
  };
}

/** The access-state filter the API expects, or undefined for "all". */
export function accessStateFilter(
  status: UserStatusFilter,
): AdministrativeUserAccessState | undefined {
  return status === "all" ? undefined : status;
}

export function userDirectoryHref(query: ParsedUserDirectoryQuery): string {
  const params = new URLSearchParams();

  if (query.group !== "docente") params.set("group", query.group);
  if (query.search) params.set("search", query.search);
  if (query.status !== "all") params.set("status", query.status);
  if (query.page > 1) params.set("page", String(query.page));

  const serialized = params.toString();
  return serialized ? `/admin/users?${serialized}` : "/admin/users";
}
