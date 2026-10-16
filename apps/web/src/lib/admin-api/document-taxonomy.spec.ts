import { describe, expect, it } from "vitest";
import {
  DOCUMENT_TYPE_OPTIONS,
  NORMATIVE_DOCUMENT_TYPE_VALUES,
  archiveReasonLabel,
  documentTypeLabel,
  documentYears,
  issuingEntityLabel,
} from "./document-taxonomy";

/**
 * Lista canónica compartida por la restricción gobernada de la base
 * (`documents_governed_type_check`, probada en
 * `supabase/tests/database/module_document_governance_test.sql`) y la API
 * (`DOCUMENT_TYPE_CODES`). Si una capa agrega o quita un tipo sin actualizar las
 * demás, esta prueba falla a propósito (ADR-0025).
 */
const CANONICAL_DOCUMENT_TYPE_CODES = [
  "RESOLUCION_MINISTERIAL",
  "RESOLUCION_VICEMINISTERIAL",
  "RESOLUCION_DIRECTORAL",
  "RESOLUCION_SECRETARIA_GENERAL",
  "DECRETO_SUPREMO",
  "DECRETO_LEGISLATIVO",
  "LEY",
  "REGLAMENTO",
  "DIRECTIVA",
  "NORMA_TECNICA",
  "OFICIO",
  "MEMORANDUM",
  "COMUNICADO",
  "CRONOGRAMA",
  "ANEXO",
  "PREGUNTAS_FRECUENTES",
  "INFORME",
  "INFOGRAFIA",
  "OTRO",
];

describe("document taxonomy labels", () => {
  it("keeps the type options aligned with the database constraint", () => {
    expect(DOCUMENT_TYPE_OPTIONS.map((option) => option.value)).toEqual(
      CANONICAL_DOCUMENT_TYPE_CODES,
    );
  });

  it("treats the Secretaría General resolutions as a normative document", () => {
    expect(NORMATIVE_DOCUMENT_TYPE_VALUES.has("RESOLUCION_SECRETARIA_GENERAL")).toBe(
      true,
    );
    expect(documentTypeLabel("RESOLUCION_SECRETARIA_GENERAL")).toBe(
      "Resolución de Secretaría General",
    );
  });

  it("translates the governed codes into the wording the panel shows", () => {
    expect(documentTypeLabel("NORMA_TECNICA")).toBe("Norma Técnica");
    expect(issuingEntityLabel("DRE_GRE")).toBe("DRE/GRE");
    expect(archiveReasonLabel("DEROGATED_OR_EXPIRED")).toBe(
      "Documento derogado o sin vigencia (fue anulado o venció su plazo)",
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
