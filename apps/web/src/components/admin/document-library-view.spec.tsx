import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { parseDocumentLibraryQuery } from "@/lib/admin-api/document-library-query";
import type { DocumentLibraryItem, ManagedModule } from "@/lib/admin-api/types";
import { DocumentLibraryView } from "./document-library-view";

const moduleId = "2bd75b4c-6a27-460a-a16c-ebf0c3cdeac3";
const submoduleId = "d4c78ed6-e77d-414f-90f5-85df71f2ad84";
const documentId = "680a1b3e-9a76-46b9-9130-7284e03aa123";
const versionId = "f84e1198-6c7d-4fa2-998e-2dced81389d8";

const modules: ManagedModule[] = [
  {
    code: "EVALUACION",
    createdAt: "2026-08-09T00:00:00.000Z",
    createdBy: null,
    deactivatedAt: null,
    deactivatedBy: null,
    deactivationReason: null,
    deletedAt: null,
    deletedBy: null,
    deletionReason: null,
    description: null,
    id: moduleId,
    isActive: true,
    isDeleted: false,
    metadata: {},
    name: "Evaluación docente",
    parentModuleId: null,
    sortOrder: 1,
    updatedAt: "2026-08-09T00:00:00.000Z",
    updatedBy: null,
  },
  {
    code: "NOMBRAMIENTO",
    createdAt: "2026-08-09T00:00:00.000Z",
    createdBy: null,
    deactivatedAt: null,
    deactivatedBy: null,
    deactivationReason: null,
    deletedAt: null,
    deletedBy: null,
    deletionReason: null,
    description: null,
    id: submoduleId,
    isActive: true,
    isDeleted: false,
    metadata: {},
    name: "Nombramiento docente",
    parentModuleId: moduleId,
    sortOrder: 1,
    updatedAt: "2026-08-09T00:00:00.000Z",
    updatedBy: null,
  },
];

const document: DocumentLibraryItem = {
  articleReference: null,
  createdAt: "2026-09-01T15:00:00.000Z",
  createdBy: null,
  createdByName: "Ana Administradora",
  currentVersionId: versionId,
  currentVersionUploadedAt: "2026-09-01T15:00:00.000Z",
  documentType: "RESOLUCION_MINISTERIAL",
  id: documentId,
  issuanceYear: 2026,
  issuingEntity: "Minedu",
  metadata: {},
  moduleAssociations: [
    {
      linkedModuleId: submoduleId,
      linkedModuleName: "Nombramiento docente",
      moduleId,
      moduleName: "Evaluación docente",
      submoduleId,
      submoduleName: "Nombramiento docente",
    },
  ],
  publicationStatus: "active",
  replacementDate: null,
  replacementDocumentId: null,
  replacementObservation: null,
  replacementReason: null,
  replacementYear: null,
  resolutionNumber: "RM-100-2026",
  situation: "current",
  technicalStatus: "ready",
  title: "Nombramiento docente 2026",
  updatedAt: "2026-09-01T15:00:00.000Z",
  updatedBy: null,
};

describe("DocumentLibraryView", () => {
  it("renders a searchable responsive library with safe document actions", () => {
    render(
      <DocumentLibraryView
        activeFilterCount={0}
        library={{ items: [document], limit: 20, offset: 0, total: 1 }}
        modules={modules}
        query={parseDocumentLibraryQuery({})}
      />,
    );

    expect(
      screen.getByPlaceholderText("Buscar documento..."),
    ).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByText("Vigente").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Listo").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Evaluación docente").length).toBeGreaterThan(0);

    const viewLinks = screen.getAllByRole("link", { name: "Ver PDF" });
    expect(viewLinks[0]).toHaveAttribute(
      "href",
      `/api/admin/documents/${documentId}/access?disposition=inline&versionId=${versionId}`,
    );
    expect(viewLinks[0]).toHaveAttribute("target", "_blank");
    expect(
      screen.queryByRole("button", { name: "Cargar PDF" }),
    ).not.toBeInTheDocument();
  });

  it("distinguishes filtered no-results from an empty library", () => {
    const { rerender } = render(
      <DocumentLibraryView
        activeFilterCount={1}
        library={{ items: [], limit: 20, offset: 0, total: 0 }}
        modules={modules}
        query={parseDocumentLibraryQuery({ q: "inexistente" })}
      />,
    );
    expect(screen.getByText("No encontramos coincidencias")).toBeVisible();

    rerender(
      <DocumentLibraryView
        activeFilterCount={0}
        library={{ items: [], limit: 20, offset: 0, total: 0 }}
        modules={modules}
        query={parseDocumentLibraryQuery({})}
      />,
    );
    expect(screen.getByText("Aún no hay documentos registrados")).toBeVisible();
    expect(screen.getByRole("link", { name: "Ir a Módulos" })).toHaveAttribute(
      "href",
      "/admin/modules",
    );
  });

  it("keeps document details available without offering broken PDF actions", () => {
    render(
      <DocumentLibraryView
        activeFilterCount={0}
        library={{
          items: [
            {
              ...document,
              currentVersionId: null,
              currentVersionUploadedAt: null,
              technicalStatus: "error",
            },
          ],
          limit: 20,
          offset: 0,
          total: 1,
        }}
        modules={modules}
        query={parseDocumentLibraryQuery({})}
      />,
    );

    expect(screen.getAllByText("Sin PDF disponible").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Ver PDF" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Descargar" })).toBeNull();
    expect(
      screen.getAllByRole("link", { name: "Ver detalle" }),
    ).not.toHaveLength(0);
  });
});
