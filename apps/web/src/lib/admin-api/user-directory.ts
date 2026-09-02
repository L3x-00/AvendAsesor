import type { AdministrativeUser } from "./types";

export type UserGroup = "docente" | "staff";
export type UserStatusFilter = "active" | "all" | "suspended";

/** Docentes are end users; admin + superadmin form the administrative team. */
export function userGroup(role: AdministrativeUser["role"]): UserGroup {
  return role === "docente" ? "docente" : "staff";
}

export function accountStatusLabel(
  status: AdministrativeUser["accountStatus"],
): string {
  return status === "active" ? "Activo" : "Pausado";
}

export interface UserDirectoryFilter {
  group: UserGroup;
  query: string;
  status: UserStatusFilter;
}

export function filterUsers(
  users: AdministrativeUser[],
  filter: UserDirectoryFilter,
): AdministrativeUser[] {
  const query = filter.query.trim().toLocaleLowerCase("es");

  return users.filter(
    (user) =>
      userGroup(user.role) === filter.group &&
      (filter.status === "all" || user.accountStatus === filter.status) &&
      (!query || user.fullName.toLocaleLowerCase("es").includes(query)),
  );
}

export interface StatusCounts {
  active: number;
  all: number;
  suspended: number;
}

export function statusCounts(
  users: AdministrativeUser[],
  group: UserGroup,
): StatusCounts {
  const inGroup = users.filter((user) => userGroup(user.role) === group);

  return {
    active: inGroup.filter((user) => user.accountStatus === "active").length,
    all: inGroup.length,
    suspended: inGroup.filter((user) => user.accountStatus === "suspended")
      .length,
  };
}
