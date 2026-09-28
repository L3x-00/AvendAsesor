import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DocumentLibraryItem } from "@/lib/admin-api/types";
import { annexNumber, ModuleContentSections } from "./module-content-sections";

let sequence = 0;

function document(
  overrides: Partial<DocumentLibraryItem> = {},
): DocumentLibraryItem {
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
    id: `9c8b56af-6d0c-4fef-881e-7c00907540d${sequence}`,
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
    specificDependency: null,
    technicalStatus: "ready",
    title: "Documento",
    updatedAt: "2026-09-05T00:00:00.000Z",
    updatedBy: null,
    ...overrides,
  };
}

function sectionFor(title: string): HTMLElement {
  const heading = screen.getByRole("heading", { name: new RegExp(`^${title}`) });
  const section = heading.closest("article");
  if (!section) throw new Error(`Sin sección ${title}`);
  return section;
}

describe("annexNumber", () => {
  it("lee el número del metadato y, si falta, del título", () => {
    expect(annexNumber({ metadata: { annexNumber: "7" }, title: "Anexo" })).toBe(
      7,
    );
    expect(
      annexNumber({ metadata: {}, title: "Anexo N° 12: formato de licencia" }),
    ).toBe(12);
    expect(annexNumber({ metadata: {}, title: "Formato sin número" })).toBeNull();
  });
});

describe("ModuleContentSections", () => {
  it("agrupa por secciones y ordena los anexos por su número", () => {
    render(
      <ModuleContentSections
        canUpload
        documents={[
          document({ title: "Anexo 10: constancia" }),
          document({ title: "Anexo 2: solicitud" }),
          document({
            documentType: "RESOLUCION_MINISTERIAL",
            title: "RM 123-2026-MINEDU",
          }),
          document({
            documentType: "PREGUNTAS_FRECUENTES",
            title: "Preguntas frecuentes del proceso",
          }),
        ]}
        moduleId="8c8b56af-6d0c-4fef-881e-7c00907540dd"
      />,
    );

    const anexos = sectionFor("Anexos");
    const items = within(anexos).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText(/Anexo 2: solicitud/)).toBeVisible();
    expect(within(items[1]!).getByText(/Anexo 10: constancia/)).toBeVisible();

    expect(
      within(sectionFor("Normativa")).getByText(/RM 123-2026-MINEDU/),
    ).toBeVisible();
    expect(
      within(sectionFor("Preguntas frecuentes")).getByText(
        /Preguntas frecuentes del proceso/,
      ),
    ).toBeVisible();
  });

  it("el botón de subir preselecciona el tipo documental en el formulario", () => {
    render(
      <ModuleContentSections
        canUpload
        documents={[]}
        moduleId="8c8b56af-6d0c-4fef-881e-7c00907540dd"
      />,
    );

    expect(
      within(sectionFor("Anexos")).getByRole("link", {
        name: "+ Subir anexos",
      }),
    ).toHaveAttribute(
      "href",
      "/admin/modules/8c8b56af-6d0c-4fef-881e-7c00907540dd?cargar=1&tipo=ANEXO#cargar-documento",
    );
  });

  it("sin permiso de carga no ofrece subir documentos", () => {
    render(
      <ModuleContentSections canUpload={false} documents={[]} moduleId="m-1" />,
    );

    expect(screen.queryByRole("link", { name: /^\+ Subir/ })).toBeNull();
    expect(
      within(sectionFor("Cronograma")).getByText(/Sin cronograma todavía/),
    ).toBeVisible();
  });
});
