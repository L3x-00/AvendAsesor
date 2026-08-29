import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Loading from "./loading";

describe("route loading screen", () => {
  it("keeps the main landmark separate from its announced loading status", () => {
    render(<Loading />);

    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("aria-busy", "true");
    expect(main).not.toHaveAttribute("role", "status");
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("status")).toHaveAttribute("aria-atomic", "true");
  });
});
