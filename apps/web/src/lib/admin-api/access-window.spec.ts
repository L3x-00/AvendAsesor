import { describe, expect, it } from "vitest";
import {
  accessExpiryInstant,
  accessStartInstant,
  toDateInputValue,
} from "./access-window";

describe("access-window", () => {
  it("starts a window at the beginning of the day in Lima", () => {
    expect(accessStartInstant("2026-01-01")).toBe("2026-01-01T05:00:00.000Z");
  });

  it("ends a window at the end of the day so access covers it whole", () => {
    expect(accessExpiryInstant("2026-09-09")).toBe("2026-09-10T04:59:59.999Z");
  });

  it("tolerates surrounding whitespace from the form field", () => {
    expect(accessStartInstant("  2026-01-01  ")).toBe(
      "2026-01-01T05:00:00.000Z",
    );
  });

  it("rejects anything that is not a real calendar day", () => {
    for (const invalid of ["", "  ", "01/01/2026", "2026-1-1", "2026-02-30"]) {
      expect(accessStartInstant(invalid)).toBeNull();
      expect(accessExpiryInstant(invalid)).toBeNull();
    }
  });

  it("renders an instant back as the calendar day seen in Lima", () => {
    expect(toDateInputValue("2026-01-01T05:00:00.000Z")).toBe("2026-01-01");
    expect(toDateInputValue("2026-09-10T04:59:59.999Z")).toBe("2026-09-09");
  });

  it("round-trips a chosen day through the API instant", () => {
    const chosen = "2026-12-31";
    const instant = accessExpiryInstant(chosen);

    expect(instant).not.toBeNull();
    expect(toDateInputValue(instant)).toBe(chosen);
  });

  it("renders an absent or unparsable window as an empty field", () => {
    expect(toDateInputValue(null)).toBe("");
    expect(toDateInputValue("no es fecha")).toBe("");
  });
});
