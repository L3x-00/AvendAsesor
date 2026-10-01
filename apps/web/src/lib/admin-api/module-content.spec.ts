import { describe, expect, it, vi } from "vitest";
import {
  annexNumber,
  annexNumberFromTitle,
  contextualUploadDefaults,
  currentLimaYear,
  documentContentSection,
  libraryPageCoversModule,
  listModuleContentDocuments,
  MAX_MODULE_CONTENT_DOCUMENTS,
  parseContentSectionParam,
  titleFromFileName,
  titleStartsWithAnnexNumber,
} from "./module-content";
import type { DocumentLibraryItem, DocumentLibraryPage } from "./types";

let sequence = 0;

function item(overrides: Partial<DocumentLibraryItem> = {}): DocumentLibraryItem {
  sequence += 1;
  return {
    additionalDetail: null,
    articleReference: null,
    createdAt: "2026-09-05T00:00:00.000Z",
    createdBy: null,
    createdByName: null,
    currentVersionId: null,
    currentVersionUploadedAt: null,
    documentType: "ANEXO",
    documentTypeOther: null,
    id: `doc-${sequence}`,
    issuanceYear: 2026,
    issuingEntity: "MINEDU",
    issuingEntityOther: null,
    keywords: null,
    metadata: {},
    moduleAssociations: [],
    publicationStatus: "active",
    replacementDate: null,
    replacementDocumentId: null,
    replacementObservation: null,
    replacementReason: null,
    replacementYear: null,
    resolutionNumber: null,
    situation: "current",
    specificDependency: "DIGEDD",
    technicalStatus: "ready",
    title: "Documento",
    updatedAt: "2026-09-05T00:00:00.000Z",
    updatedBy: null,
    ...overrides,
  };
}

describe("número de anexo", () => {
  it.each([
    ["Anexo 3", 3],
    ["Anexo N° 12: formato de licencia", 12],
    ["Anexo N.° 03 Declaración jurada", 3],
    ["Anexo Nro. 7", 7],
    ["Anexo No. 8 - Constancia", 8],
    ["Anexo Núm. 4", 4],
    ["ANEXO III", 3],
    ["Formato del anexo 5", 5],
  ])("lee «%s» como %d", (title, expected) => {
    expect(annexNumberFromTitle(title)).toBe(expected);
  });

  it.each(["Anexo 2026 - formato", "Formato sin número", "Anexos varios"])(
    "no inventa un número en «%s»",
    (title) => {
      expect(annexNumberFromTitle(title)).toBeNull();
    },
  );

  it("prefiere el campo propio, luego el título y por último el número del documento", () => {
    expect(
      annexNumber({ metadata: { annexNumber: 9 }, title: "Anexo 2" }),
    ).toBe(9);
    expect(annexNumber({ metadata: { annexNumber: "7" }, title: "Anexo" })).toBe(7);
    expect(annexNumber({ metadata: {}, title: "Anexo 2: solicitud" })).toBe(2);
    expect(
      annexNumber({
        metadata: {},
        resolutionNumber: "3",
        title: "Contrato de Servicio Docente",
      }),
    ).toBe(3);
    expect(
      annexNumber({
        metadata: {},
        resolutionNumber: "123-2026-MINEDU",
        title: "Contrato",
      }),
    ).toBeNull();
    expect(annexNumber({ metadata: { annexNumber: 0 }, title: "x" })).toBeNull();
  });

  it("detecta cuando el título ya empieza por el número", () => {
    expect(titleStartsWithAnnexNumber("Anexo 1 Contrato de Servicio")).toBe(true);
    expect(titleStartsWithAnnexNumber("  Anexo N° 2 Solicitud")).toBe(true);
    expect(titleStartsWithAnnexNumber("Contrato (anexo 1)")).toBe(false);
    expect(titleStartsWithAnnexNumber("Contrato")).toBe(false);
  });
});

describe("documentContentSection", () => {
  it("ubica cada tipo y deja una «Otra norma» en Normativa", () => {
    expect(
      documentContentSection({ documentType: "LEY", metadata: {} }),
    ).toBe("NORMATIVA");
    expect(
      documentContentSection({ documentType: "ANEXO", metadata: {} }),
    ).toBe("ANEXO");
    expect(
      documentContentSection({
        documentType: "OTRO",
        metadata: { contentSection: "NORMATIVA" },
      }),
    ).toBe("NORMATIVA");
    expect(documentContentSection({ documentType: "OTRO", metadata: {} })).toBe(
      null,
    );
    expect(
      documentContentSection({ documentType: "OFICIO", metadata: {} }),
    ).toBe(null);
  });
});

describe("listModuleContentDocuments", () => {
  function pages(total: number) {
    return vi.fn(async (query: { limit?: number; offset?: number }) => {
      const offset = query.offset ?? 0;
      const limit = query.limit ?? 25;
      const count = Math.max(0, Math.min(limit, total - offset));
      const page: DocumentLibraryPage = {
        items: Array.from({ length: count }, (_, index) =>
          item({ id: `p-${offset + index}` }),
        ),
        limit,
        offset,
        total,
      };
      return page;
    });
  }

  it("trae todo el tema por lotes de 100 y sin filtros de la biblioteca", async () => {
    const listDocumentLibrary = pages(230);
    const result = await listModuleContentDocuments(
      { listDocumentLibrary },
      { submoduleId: "sub-1" },
    );

    expect(result.complete).toBe(true);
    expect(result.documents).toHaveLength(230);
    expect(listDocumentLibrary).toHaveBeenCalledTimes(3);
    for (const [query] of listDocumentLibrary.mock.calls) {
      expect(query).toEqual({
        limit: 100,
        moduleId: undefined,
        offset: expect.any(Number),
        sort: "newest",
        submoduleId: "sub-1",
      });
    }
  });

  it("se detiene en el tope y lo avisa", async () => {
    const listDocumentLibrary = pages(MAX_MODULE_CONTENT_DOCUMENTS + 50);
    const result = await listModuleContentDocuments(
      { listDocumentLibrary },
      { moduleId: "mod-1" },
    );

    expect(result.complete).toBe(false);
    expect(result.documents).toHaveLength(MAX_MODULE_CONTENT_DOCUMENTS);
  });

  it("reutiliza la primera página solo si no hay filtros y cabe completa", () => {
    const library: DocumentLibraryPage = {
      items: [item(), item()],
      limit: 20,
      offset: 0,
      total: 2,
    };
    expect(
      libraryPageCoversModule(library, { activeFilterCount: 0, page: 1 }),
    ).toBe(true);
    expect(
      libraryPageCoversModule(library, { activeFilterCount: 1, page: 1 }),
    ).toBe(false);
    expect(
      libraryPageCoversModule(
        { ...library, total: 26 },
        { activeFilterCount: 0, page: 1 },
      ),
    ).toBe(false);
  });
});

describe("contextualUploadDefaults", () => {
  it("usa el año actual y la entidad y dependencia más frecuentes", () => {
    const defaults = contextualUploadDefaults(
      [
        item({ issuingEntity: "UGEL", specificDependency: "UGEL 03" }),
        item({ issuingEntity: "MINEDU", specificDependency: "DIGEDD" }),
        item({ issuingEntity: "MINEDU", specificDependency: "DIGEDD" }),
        item({
          issuingEntity: "MINEDU",
          specificDependency: "Secretaría General",
        }),
      ],
      2026,
    );

    expect(defaults).toEqual({
      issuanceYear: 2026,
      issuingEntity: "MINEDU",
      issuingEntityOther: undefined,
      specificDependency: "DIGEDD",
    });
  });

  it("sin documentos solo propone el año", () => {
    expect(contextualUploadDefaults([], 2026)).toEqual({ issuanceYear: 2026 });
  });

  it("conserva el nombre de «Otra institución»", () => {
    expect(
      contextualUploadDefaults(
        [
          item({
            issuingEntity: "OTRA_INSTITUCION",
            issuingEntityOther: "ESSALUD",
            specificDependency: "Gerencia",
          }),
        ],
        2026,
      ),
    ).toMatchObject({
      issuingEntity: "OTRA_INSTITUCION",
      issuingEntityOther: "ESSALUD",
      specificDependency: "Gerencia",
    });
  });
});

describe("utilidades de la carga por sección", () => {
  it("propone un título legible a partir del archivo", () => {
    expect(titleFromFileName("preguntas_frecuentes_reasignacion_2026.pdf")).toBe(
      "Preguntas frecuentes reasignacion 2026",
    );
    expect(titleFromFileName("RM-123-2026-MINEDU.docx")).toBe(
      "RM-123-2026-MINEDU",
    );
    expect(titleFromFileName("a.pdf")).toBe("");
  });

  it("acepta solo las cuatro secciones en la dirección", () => {
    expect(parseContentSectionParam("ANEXO")).toBe("ANEXO");
    expect(parseContentSectionParam(["normativa"])).toBe("NORMATIVA");
    expect(parseContentSectionParam("LEY")).toBeUndefined();
    expect(parseContentSectionParam(undefined)).toBeUndefined();
  });

  it("calcula el año en la hora de Lima", () => {
    // 1 de enero 03:00 UTC sigue siendo 31 de diciembre en Lima.
    expect(currentLimaYear(new Date("2027-01-01T03:00:00.000Z"))).toBe(2026);
    expect(currentLimaYear(new Date("2026-06-01T12:00:00.000Z"))).toBe(2026);
  });
});
