import { describe, expect, it } from "vitest";
import {
  archiveReasonLabel,
  documentTypeLabel,
  documentYears,
  issuingEntityLabel,
} from "./document-taxonomy";

describe("document taxonomy labels", () => {
  it("translates the governed codes into the wording the panel shows", () => {
    expect(documentTypeLabel("NORMA_TECNICA")).toBe("Norma Técnica");
    expect(issuingEntityLabel("DRE_GRE")).toBe("DRE/GRE");
    expect(archiveReasonLabel("DEROGATED_OR_EXPIRED")).toBe(
      "Documento derogado o sin vigencia",
    );
  });

  it("shows the stored value instead of an empty cell for an unknown code", () => {
    // Un código heredado no debe desaparecer de la ficha por no estar mapeado.
    expect(documentTypeLabel("CODIGO_HEREDADO")).toBe("CODIGO_HEREDADO");
    expect(issuingEntityLabel("ENTIDAD_HEREDADA")).toBe("ENTIDAD_HEREDADA");
    expect(archiveReasonLabel("MOTIVO_HEREDADO")).toBe("MOTIVO_HEREDADO");
  });

  it("derives the year options from the current year and never below 2014", () => {
    expect(documentYears(2026).slice(0, 3)).toEqual([2026, 2025, 2024]);
    expect(documentYears(2026).at(-1)).toBe(2014);
    // Un reloj atrasado no debe producir una lista vacía.
    expect(documentYears(2010)).toEqual([2014]);
  });
});
