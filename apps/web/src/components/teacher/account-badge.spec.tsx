import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AccountBadge, initialsOf } from "./account-badge";

describe("AccountBadge", () => {
  it("muestra nombre, iniciales y el rol en lenguaje llano", () => {
    render(<AccountBadge fullName="María Pérez Soto" role="docente" />);

    expect(screen.getByText("María Pérez Soto")).toBeVisible();
    expect(screen.getByText("MP")).toBeInTheDocument();
    expect(screen.getByText("Docente")).toBeVisible();
  });

  it("sin nombre ni rol usa un texto neutro", () => {
    render(<AccountBadge />);

    expect(screen.getByText("Tu cuenta")).toBeVisible();
    expect(initialsOf("  ")).toBe("?");
    expect(initialsOf("ana")).toBe("A");
  });
});
