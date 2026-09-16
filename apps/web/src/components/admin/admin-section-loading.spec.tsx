import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminSectionLoading } from "./admin-section-loading";

describe("AdminSectionLoading", () => {
  it("announces the label to assistive technologies", () => {
    render(<AdminSectionLoading label="Cargando módulos" />);

    const status = screen.getByRole("status");
    expect(status).toBeInTheDocument();
    expect(screen.getByText("Cargando módulos")).toBeInTheDocument();
  });

  it("renders decorative shapes hidden from assistive technologies", () => {
    const { container } = render(
      <AdminSectionLoading label="Cargando usuarios" />,
    );

    const header = container.querySelector(
      ".avend-admin-section-loading-header",
    );
    const body = container.querySelector(".avend-admin-section-loading-body");

    expect(header).toHaveAttribute("aria-hidden", "true");
    expect(body).toHaveAttribute("aria-hidden", "true");
    expect(body?.querySelectorAll("span")).toHaveLength(3);
  });
});