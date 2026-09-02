export const USER_DIRECTORY_PAGE_SIZE = 25;

export type UserGroup = "docente" | "staff";
export type UserStatusFilter = "active" | "all" | "suspended";
type SearchValue = string | string[] | undefined;
export type UserDirectorySearchParams = Record<string, SearchValue>;

export interface ParsedUserDirectoryQuery {
  group: UserGroup;
  page: number;
  search?: string;
  status: UserStatusFilter;
}

function first(value: SearchValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function clean(value: SearchValue, maxLength: number): string | undefined {
  const normalized = first(value)?.trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

export function parseUserDirectoryQuery(
  params: UserDirectorySearchParams,
): ParsedUserDirectoryQuery {
  const rawGroup = clean(params.group, 16);
  const rawStatus = clean(params.status, 16);
  const rawPage = Number(first(params.page));

  return {
    group: rawGroup === "staff" ? "staff" : "docente",
    page:
      Number.isSafeInteger(rawPage) && rawPage >= 1
        ? Math.min(rawPage, 10_000)
        : 1,
    search: clean(params.search, 160),
    status:
      rawStatus === "active" || rawStatus === "suspended" ? rawStatus : "all",
  };
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
