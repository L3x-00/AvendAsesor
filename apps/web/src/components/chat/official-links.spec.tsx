import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  isOfficialUrl,
  linkifyOfficialEntities,
  linkifyOfficialUrls,
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
    // Las UGEL y las DRE no tienen una página única: directorio filtrado de
    // gob.pe, no la búsqueda general que abría con una UGEL concreta.
    expect(
      screen.getByRole("link", {
        name: /^UGEL \(directorio oficial de las UGEL en gob\.pe/,
      }),
    ).toHaveAttribute(
      "href",
      "https://www.gob.pe/busquedas?contenido%5B%5D=instituciones&term=UGEL",
    );
    expect(screen.getByRole("link", { name: /^DRE/ })).toHaveAttribute(
      "href",
      "https://www.gob.pe/busquedas?contenido%5B%5D=instituciones&term=DRE+GRE",
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

  it("does not link an acronym that is part of a norm code", () => {
    render(
      <p>
        {linkifyOfficialEntities(
          "Sugerencias: revisa la RM N.° 123-2024-MINEDU y el oficio 45-2025-DRE/UGEL; luego consulta en ESSALUD.",
          "s",
        )}
      </p>,
    );

    expect(screen.queryByRole("link", { name: /^MINEDU/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /^DRE/ })).toBeNull();
    expect(screen.getByRole("link", { name: /^ESSALUD/ })).toHaveAttribute(
      "href",
      "https://www.gob.pe/essalud",
    );
  });

  it("leaves text without official portals untouched", () => {
    expect(linkifyOfficialEntities("Revisa tu boleta de pago.", "s")).toEqual([
      "Revisa tu boleta de pago.",
    ]);
  });

  it("links official addresses sent as Markdown or written plainly", () => {
    render(
      <p>
        {linkifyOfficialUrls(
          "- [Página oficial del Ministerio de Educación (MINEDU)](https://www.gob.pe/minedu): normas. Mira también https://www.perueduca.pe.",
          "u",
        )}
      </p>,
    );

    expect(
      screen.getByRole("link", { name: /^Página oficial del Ministerio/ }),
    ).toHaveAttribute("href", "https://www.gob.pe/minedu");
    const plain = screen.getByRole("link", {
      name: /^https:\/\/www\.perueduca\.pe \(enlace oficial/,
    });
    // El punto final cierra la frase; no forma parte de la dirección.
    expect(plain).toHaveAttribute("href", "https://www.perueduca.pe");
    screen.getAllByRole("link").forEach((link) => {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });
    expect(screen.getByText(/: normas\. Mira también/)).toBeInTheDocument();
  });

  it("keeps typographic quotes and ellipses out of the address", () => {
    render(
      <p>
        {linkifyOfficialUrls(
          "Abre “https://www.gob.pe/minedu” o https://www.gob.pe/sunedu…",
          "u",
        )}
      </p>,
    );

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "https://www.gob.pe/minedu",
      "https://www.gob.pe/sunedu",
    ]);
  });

  it("leaves non-official addresses as plain text", () => {
    const text =
      "Descarga la norma en https://bit.ly/ContratacionAuxiliares2026 o en [este enlace](https://gob.pe.example.com/x).";

    expect(linkifyOfficialUrls(text, "u")).toEqual([text]);
  });

  it("accepts only https addresses of official domains", () => {
    expect(isOfficialUrl("https://www.gob.pe/minedu")).toBe(true);
    expect(isOfficialUrl("https://escale.minedu.gob.pe/")).toBe(true);
    expect(isOfficialUrl("https://busquedas.elperuano.pe")).toBe(true);
    expect(isOfficialUrl("http://www.gob.pe/minedu")).toBe(false);
    expect(isOfficialUrl("https://gob.pe.example.com")).toBe(false);
    expect(isOfficialUrl("https://notgob.pe")).toBe(false);
    expect(isOfficialUrl("https://user:pass@www.gob.pe")).toBe(false);
    expect(isOfficialUrl("no es una dirección")).toBe(false);
  });

  it("recognizes where the suggestions start", () => {
    expect(startsSuggestions("Sugerencias: verifica…")).toBe(true);
    expect(startsSuggestions("**Sugerencias:**")).toBe(true);
    expect(startsSuggestions("**Sugerencias**: revisa…")).toBe(true);
    expect(startsSuggestions("### Sugerencias")).toBe(true);
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
