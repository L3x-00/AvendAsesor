import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  linkifyOfficialEntities,
  startsSuggestions,
  ThoughtDuration,
  withoutLegacyLeadIn,
} from "./official-links";

describe("official links", () => {
  it("links every official portal mentioned in a suggestion", () => {
    render(
      <p>
        {linkifyOfficialEntities(
          "Sugerencias: verifica en el portal oficial del MINEDU y consulta con tu UGEL o DRE; para títulos, SUNEDU.",
          "s",
        )}
      </p>,
    );

    expect(
      screen.getByRole("link", { name: /MINEDU \(portal oficial de MINEDU/ }),
    ).toHaveAttribute("href", "https://www.gob.pe/minedu");
    expect(screen.getByRole("link", { name: /^UGEL/ })).toHaveAttribute(
      "href",
      "https://www.gob.pe/busquedas?term=UGEL",
    );
    expect(screen.getByRole("link", { name: /^DRE/ })).toHaveAttribute(
      "href",
      "https://www.gob.pe/busquedas?term=DRE",
    );
    expect(screen.getByRole("link", { name: /^SUNEDU/ })).toHaveAttribute(
      "href",
      "https://www.gob.pe/sunedu",
    );
    screen.getAllByRole("link").forEach((link) => {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });
  });

  it("leaves text without official portals untouched", () => {
    expect(linkifyOfficialEntities("Revisa tu boleta de pago.", "s")).toEqual([
      "Revisa tu boleta de pago.",
    ]);
  });

  it("recognizes where the suggestions start", () => {
    expect(startsSuggestions("Sugerencias: verifica…")).toBe(true);
    expect(startsSuggestions("**Sugerencias:**")).toBe(true);
    expect(startsSuggestions("Las sugerencias del comité")).toBe(false);
  });

  it("says how long the assistant thought, in plain words", () => {
    const { rerender } = render(<ThoughtDuration seconds={0.4} />);
    expect(screen.getByText("Pensado por 1 segundo")).toBeInTheDocument();

    rerender(<ThoughtDuration seconds={12.4} />);
    expect(screen.getByText("Pensado por 12 segundos")).toBeInTheDocument();
  });

  it("hides the retired advisory label from saved answers", () => {
    expect(
      withoutLegacyLeadIn(
        "Orientación general (sin cita de norma):\n\nPara postular a un colegio…",
      ),
    ).toBe("Para postular a un colegio…");
    expect(withoutLegacyLeadIn("Texto normal.")).toBe("Texto normal.");
  });
});
