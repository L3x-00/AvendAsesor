import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GuideContent } from "./guide-content";

describe("GuideContent", () => {
  it("presenta el sistema, los cinco pasos y su alcance", () => {
    render(<GuideContent />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Conoce a AVEND ASESOR" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Hacer una consulta" }),
    ).toHaveAttribute("href", "/chat");

    const steps = within(
      screen.getByRole("region", { name: "Cómo usarlo, en cinco pasos" }),
    ).getAllByRole("listitem");
    expect(steps).toHaveLength(5);
    expect(steps[0]).toHaveTextContent("Elige un tema, si lo deseas");

    const scope = screen.getByRole("region", { name: "Alcance del asistente" });
    expect(within(scope).getByText(/te lo dirá/)).toBeVisible();
    expect(
      screen.getByRole("complementary", {
        name: "Consejo para mejores respuestas",
      }),
    ).toBeVisible();
  });
});
