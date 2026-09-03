import { describe, expect, it } from "vitest";
import { hasCurrentAccess, isAdministrativeRole } from "./policy";

describe("isAdministrativeRole", () => {
  it("allows admin and superadmin", () => {
    expect(isAdministrativeRole("admin")).toBe(true);
    expect(isAdministrativeRole("superadmin")).toBe(true);
  });

  it("rejects docente", () => {
    expect(isAdministrativeRole("docente")).toBe(false);
  });

  it("fails closed for absent, malformed or unexpected values", () => {
    expect(isAdministrativeRole(undefined)).toBe(false);
    expect(isAdministrativeRole(null)).toBe(false);
    expect(isAdministrativeRole("")).toBe(false);
    expect(isAdministrativeRole("ADMIN")).toBe(false);
    expect(isAdministrativeRole(0)).toBe(false);
    expect(isAdministrativeRole({ role: "admin" })).toBe(false);
    expect(isAdministrativeRole(["admin"])).toBe(false);
  });
});

describe("hasCurrentAccess", () => {
  const now = Date.parse("2026-09-03T12:00:00.000Z");

  it("accepts indefinite, current and boundary access periods", () => {
    expect(hasCurrentAccess(null, now)).toBe(true);
    expect(hasCurrentAccess("2026-09-03T12:00:00.000Z", now)).toBe(true);
    expect(hasCurrentAccess("2026-09-04T00:00:00.000Z", now)).toBe(true);
  });

  it("denies expired, absent and malformed access periods", () => {
    expect(hasCurrentAccess("2026-09-03T11:59:59.999Z", now)).toBe(false);
    expect(hasCurrentAccess(undefined, now)).toBe(false);
    expect(hasCurrentAccess("not-a-date", now)).toBe(false);
  });
});
