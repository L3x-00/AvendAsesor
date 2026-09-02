import { describe, expect, it } from "vitest";
import type { AdministrativeUser } from "./types";
import {
  accountStatusLabel,
  filterUsers,
  statusCounts,
  userGroup,
} from "./user-directory";

const users: AdministrativeUser[] = [
  {
    accountStatus: "active",
    fullName: "María Docente",
    id: "u1",
    lastAccessAt: "2026-08-01T10:00:00.000Z",
    role: "docente",
  },
  {
    accountStatus: "suspended",
    fullName: "Pedro Pausado",
    id: "u2",
    lastAccessAt: null,
    role: "docente",
  },
  {
    accountStatus: "active",
    fullName: "Ana Admin",
    id: "u3",
    lastAccessAt: "2026-08-02T10:00:00.000Z",
    role: "admin",
  },
  {
    accountStatus: "active",
    fullName: "Sofía Super",
    id: "u4",
    lastAccessAt: null,
    role: "superadmin",
  },
];

describe("user-directory", () => {
  it("classifies docentes vs administrative team", () => {
    expect(userGroup("docente")).toBe("docente");
    expect(userGroup("admin")).toBe("staff");
    expect(userGroup("superadmin")).toBe("staff");
  });

  it("labels account status in the product vocabulary", () => {
    expect(accountStatusLabel("active")).toBe("Activo");
    expect(accountStatusLabel("suspended")).toBe("Pausado");
  });

  it("filters by group, status and name query", () => {
    expect(
      filterUsers(users, { group: "docente", query: "", status: "all" }).map(
        (user) => user.id,
      ),
    ).toEqual(["u1", "u2"]);
    expect(
      filterUsers(users, { group: "staff", query: "", status: "all" }).map(
        (user) => user.id,
      ),
    ).toEqual(["u3", "u4"]);
    expect(
      filterUsers(users, {
        group: "docente",
        query: "",
        status: "suspended",
      }).map((user) => user.id),
    ).toEqual(["u2"]);
    expect(
      filterUsers(users, { group: "docente", query: "maría", status: "all" }).map(
        (user) => user.id,
      ),
    ).toEqual(["u1"]);
  });

  it("counts status per group", () => {
    expect(statusCounts(users, "docente")).toEqual({
      active: 1,
      all: 2,
      suspended: 1,
    });
    expect(statusCounts(users, "staff")).toEqual({
      active: 2,
      all: 2,
      suspended: 0,
    });
  });
});
