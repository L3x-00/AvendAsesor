import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AdminCurrentTime,
  formatAdminDate,
  formatAdminTime,
} from "./admin-current-time";

const INITIAL_NOW = "2026-08-31T05:45:32.000Z";

afterEach(() => vi.useRealTimers());

describe("AdminCurrentTime", () => {
  it("formats the current Lima time and complete Spanish date", () => {
    const instant = new Date(INITIAL_NOW);

    expect(formatAdminTime(instant)).toBe("12:45:32 a. m.");
    expect(formatAdminDate(instant)).toBe("Lunes, 31 de agosto de 2026");

    render(<AdminCurrentTime initialNow={INITIAL_NOW} />);

    expect(screen.getByText("12:45:32 a. m.")).toBeVisible();
    expect(screen.getByText("Lunes, 31 de agosto de 2026")).toBeVisible();
  });

  it("advances automatically every second and releases its timer", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(INITIAL_NOW));
    const { unmount } = render(<AdminCurrentTime initialNow={INITIAL_NOW} />);

    act(() => vi.advanceTimersByTime(1_000));

    expect(screen.getByText("12:45:33 a. m.")).toBeVisible();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
