import { describe, expect, it } from "vitest";
import {
  accessStateFilter,
  parseUserDirectoryQuery,
  userDirectoryHref,
} from "./user-directory";

describe("user-directory", () => {
  it("uses safe directory defaults", () => {
    expect(parseUserDirectoryQuery({})).toEqual({
      group: "docente",
      page: 1,
      search: undefined,
      status: "all",
    });
  });

  it("normalizes, bounds and allowlists URL filters", () => {
    expect(
      parseUserDirectoryQuery({
        group: ["staff", "docente"],
        page: "20000",
        search: `  ${"a".repeat(200)}  `,
        status: "por_vencer",
      }),
    ).toEqual({
      group: "staff",
      page: 10_000,
      search: "a".repeat(160),
      status: "por_vencer",
    });
    expect(
      parseUserDirectoryQuery({ group: "unknown", page: "-2", status: "bad" }),
    ).toEqual({
      group: "docente",
      page: 1,
      search: undefined,
      status: "all",
    });
  });

  it("accepts every derived access state as a filter", () => {
    for (const status of ["activo", "por_vencer", "expirado", "pausado"]) {
      expect(parseUserDirectoryQuery({ status }).status).toBe(status);
    }
  });

  it("does not let inherited object keys escape the allowlist", () => {
    for (const status of [
      "toString",
      "constructor",
      "valueOf",
      "hasOwnProperty",
      "__proto__",
    ]) {
      expect(parseUserDirectoryQuery({ status }).status).toBe("all");
    }
  });

  it("keeps links created before vigencias working", () => {
    expect(parseUserDirectoryQuery({ status: "active" }).status).toBe("activo");
    expect(parseUserDirectoryQuery({ status: "suspended" }).status).toBe(
      "pausado",
    );
  });

  it("maps the filter to the access state the API expects", () => {
    expect(accessStateFilter("all")).toBeUndefined();
    expect(accessStateFilter("activo")).toBe("activo");
    expect(accessStateFilter("expirado")).toBe("expirado");
  });

  it("builds stable URLs while omitting default filters", () => {
    expect(
      userDirectoryHref({
        group: "docente",
        page: 1,
        status: "all",
      }),
    ).toBe("/admin/users");
    expect(
      userDirectoryHref({
        group: "staff",
        page: 3,
        search: "Ana María",
        status: "activo",
      }),
    ).toBe(
      "/admin/users?group=staff&search=Ana+Mar%C3%ADa&status=activo&page=3",
    );
  });
});
