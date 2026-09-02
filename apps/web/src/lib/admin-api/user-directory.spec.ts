import { describe, expect, it } from "vitest";
import { parseUserDirectoryQuery, userDirectoryHref } from "./user-directory";

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
        status: "suspended",
      }),
    ).toEqual({
      group: "staff",
      page: 10_000,
      search: "a".repeat(160),
      status: "suspended",
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
        status: "active",
      }),
    ).toBe(
      "/admin/users?group=staff&search=Ana+Mar%C3%ADa&status=active&page=3",
    );
  });
});
