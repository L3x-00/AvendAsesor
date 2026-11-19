import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { loadHistoryModulePage } from "@/app/admin/documents/actions";
import { parseDocumentLibraryQuery } from "@/lib/admin-api/document-library-query";
import type {
  DocumentLibraryItem,
  ManagedModule,
  ManagedModuleSummary,
} from "@/lib/admin-api/types";
import { DocumentLibraryView } from "./document-library-view";

vi.mock("@/app/admin/actions", () => ({
  deleteDocumentAction: vi.fn(async () => ({ status: "idle" })),
  setDocumentTechnicalStatusAction: vi.fn(async () => ({ status: "idle" })),
}));

// La vista pide los documentos de cada módulo a una server action: en la prueba
// se responde con una página ya armada.
vi.mock("@/app/admin/documents/actions", () => ({
  loadHistoryModulePage: vi.fn(async () => ({ status: "error" })),
}));

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

const moduleSummaries: ManagedModuleSummary[] = modules.map((module) => ({
  ...module,
  canManage: true,
  documentCount: 1,
  submoduleCount: module.parentModuleId ? 0 : 1,
}));

// Vista general del Historial: dos módulos principales con sus conteos.
const remuneracionesId = "7f1c2f7e-5b0c-4ab2-9f4a-8d6f7c1a2b3d";
const historySummaries: ManagedModuleSummary[] = [
  moduleSummaries[0],
  {
    ...moduleSummaries[0],
    code: "REMUNERACIONES",
    documentCount: 29,
    id: remuneracionesId,
    name: "Remuneraciones",
    sortOrder: 2,
  },
];

const document: DocumentLibraryItem = {
  additionalDetail: null,
  articleReference: null,
  createdAt: "2026-09-01T15:00:00.000Z",
  createdBy: null,
  createdByName: "Ana Administradora",
  currentVersionId: versionId,
  currentVersionUploadedAt: "2026-09-01T15:00:00.000Z",
  documentType: "RESOLUCION_MINISTERIAL",
  documentTypeOther: null,
  id: documentId,
  issuanceYear: 2026,
  issuingEntity: "Minedu",
  issuingEntityOther: null,
  keywords: null,
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
  specificDependency: "Secretaría General",
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
      screen.getByPlaceholderText(
        "Buscar documento por nombre, número o entidad...",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByText("Vigente").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Listo").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Evaluación docente").length).toBeGreaterThan(0);

    // Solo dos acciones con ícono: ver detalle (ojo) y editar (lápiz).
    expect(
      screen.getAllByRole("link", { name: /^Ver detalle: / })[0],
    ).toHaveAttribute("href", `/admin/documents/${documentId}`);
    expect(
      screen.getAllByRole("link", { name: /^Editar: / })[0],
    ).toHaveAttribute("href", `/admin/documents/${documentId}#edit-document`);
    // Las acciones rápidas de administración solo se piden desde el Historial.
    expect(screen.queryByRole("button", { name: /^Eliminar: / })).toBeNull();
    expect(screen.queryByRole("link", { name: "Ver PDF" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Descargar PDF" })).toBeNull();
    expect(screen.getByLabelText("Año")).toHaveAttribute("type", "number");
    expect(
      screen.queryByRole("button", { name: "Cargar PDF" }),
    ).not.toBeInTheDocument();
  });

  it("suma eliminar y marcar como Listo cuando el Historial pide acciones rápidas", () => {
    render(
      <DocumentLibraryView
        activeFilterCount={0}
        library={{
          items: [{ ...document, technicalStatus: "pending_approval" }],
          limit: 20,
          offset: 0,
          total: 1,
        }}
        modules={modules}
        query={parseDocumentLibraryQuery({})}
        quickActions
      />,
    );

    expect(
      screen.getAllByRole("button", { name: /^Eliminar: / }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: /^Marcar como Listo: / }).length,
    ).toBeGreaterThan(0);
  });

  it("deja a la vista solo la búsqueda y pliega el resto en Filtros avanzados", () => {
    const { container } = render(
      <DocumentLibraryView
        activeFilterCount={3}
        library={{ items: [document], limit: 20, offset: 0, total: 1 }}
        modules={modules}
        query={parseDocumentLibraryQuery({
          documentType: "LEY",
          issuanceYear: "2020",
          q: "reglamento",
        })}
      />,
    );

    const details = container.querySelector("details");
    expect(details).not.toHaveAttribute("open");
    expect(details).toContainElement(screen.getByLabelText("Año"));
    expect(details).toContainElement(screen.getByLabelText("Tipo documental"));
    expect(details).not.toContainElement(
      screen.getByLabelText("Buscar documentos por nombre"),
    );
    // La búsqueda no cuenta en el contador del panel: 3 activos, 2 avanzados.
    expect(
      screen.getByText("Filtros avanzados").parentElement,
    ).toHaveTextContent("2 filtros activos");
    expect(screen.getByRole("link", { name: "Limpiar filtros" })).toBeVisible();
  });

  it("en la página de un módulo no descuenta dos veces la ubicación fija", () => {
    // La página del módulo ya pasa el conteo sin la ubicación (1 = situación).
    render(
      <DocumentLibraryView
        activeFilterCount={1}
        basePath={`/admin/modules/${moduleId}`}
        library={{ items: [document], limit: 20, offset: 0, total: 1 }}
        lockLocation
        modules={modules}
        query={parseDocumentLibraryQuery({ moduleId, situation: "current" })}
      />,
    );

    expect(
      screen.getByText("Filtros avanzados").parentElement,
    ).toHaveTextContent("1 filtro activo");
    expect(screen.getByLabelText("Año")).not.toHaveAttribute("max");
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
      screen.getAllByRole("link", { name: /^Ver detalle: / }),
    ).not.toHaveLength(0);
  });

  it("shows custom type and institution names in both responsive representations", () => {
    render(
      <DocumentLibraryView
        activeFilterCount={0}
        library={{
          items: [
            {
              ...document,
              documentType: "OTRO",
              documentTypeOther: "Protocolo regional",
              issuingEntity: "OTRA_INSTITUCION",
              issuingEntityOther: "Instituto Pedagógico Regional",
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

    expect(screen.getAllByText(/Protocolo regional/)).toHaveLength(2);
    expect(screen.getAllByText(/Instituto Pedagógico Regional/)).toHaveLength(
      2,
    );
  });

  it("offers the upload-date and uploader filters the client enumerated", () => {
    render(
      <DocumentLibraryView
        activeFilterCount={0}
        library={{ items: [document], limit: 20, offset: 0, total: 1 }}
        modules={modules}
        query={parseDocumentLibraryQuery({})}
        uploaders={[
          { documentCount: 4, fullName: "Ana Auditora", id: versionId },
        ]}
      />,
    );

    expect(screen.getByLabelText("Cargado desde")).toHaveAttribute(
      "name",
      "createdFrom",
    );
    expect(screen.getByLabelText("Cargado hasta")).toHaveAttribute(
      "name",
      "createdTo",
    );
    const uploader = screen.getByLabelText("Administrador que lo cargó");
    expect(uploader).toHaveAttribute("name", "createdBy");
    expect(
      screen.getByRole("option", { name: "Ana Auditora (4)" }),
    ).toBeInTheDocument();
  });

  it("hides the uploader filter while no administrator has uploaded anything", () => {
    render(
      <DocumentLibraryView
        activeFilterCount={0}
        library={{ items: [document], limit: 20, offset: 0, total: 1 }}
        modules={modules}
        query={parseDocumentLibraryQuery({})}
      />,
    );

    expect(screen.queryByLabelText("Administrador que lo cargó")).toBeNull();
  });

  it("keeps situation and technical status tellable apart", () => {
    render(
      <DocumentLibraryView
        activeFilterCount={0}
        library={{ items: [document], limit: 20, offset: 0, total: 1 }}
        modules={modules}
        query={parseDocumentLibraryQuery({})}
      />,
    );

    // Ambos conceptos caen en columnas contiguas: el lector de pantalla debe
    // poder nombrarlos aunque el color sea parecido.
    expect(screen.getAllByText("Situación:").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Estado técnico:").length).toBeGreaterThan(0);
  });

  it("groups submodules under their module so the choice is unambiguous", () => {
    render(
      <DocumentLibraryView
        activeFilterCount={0}
        library={{ items: [document], limit: 20, offset: 0, total: 1 }}
        modules={modules}
        query={parseDocumentLibraryQuery({})}
      />,
    );

    const group = screen.getByLabelText("Submódulo").querySelector("optgroup");
    expect(group).toHaveAttribute("label", "Evaluación docente");
  });

  it("lets a keyboard user reach the horizontally scrollable table", () => {
    render(
      <DocumentLibraryView
        activeFilterCount={0}
        library={{ items: [document], limit: 20, offset: 0, total: 1 }}
        modules={modules}
        query={parseDocumentLibraryQuery({})}
      />,
    );

    expect(
      screen.getByRole("region", {
        name: "Tabla de documentos, desplazable horizontalmente",
      }),
    ).toHaveAttribute("tabindex", "0");
  });

  it("organizes the global history by module without changing document actions", () => {
    render(
      <DocumentLibraryView
        activeFilterCount={0}
        historyGrouped
        historyLayout
        historyModuleId={moduleId}
        library={{ items: [document], limit: 3, offset: 0, total: 1 }}
        moduleSummaries={historySummaries}
        modules={historySummaries}
        query={parseDocumentLibraryQuery({})}
        quickActions
      />,
    );

    expect(screen.getByText("Documentos por módulo")).toBeVisible();
    expect(screen.getByText("Todo el período")).toBeVisible();
    expect(screen.getByRole("button", { name: "Buscar" })).toBeVisible();
    // El primer módulo queda desplegado con su tabla y su total.
    expect(
      screen.getByRole("region", {
        name: "Documentos de Evaluación docente, desplazable horizontalmente",
      }),
    ).toHaveAttribute("tabindex", "0");
    expect(screen.getByText("Mostrando 1 de 1 documento")).toBeVisible();
    expect(
      screen.getByRole("link", { name: /^Ver todos en Evaluación docente/ }),
    ).toHaveAttribute("href", `/admin/modules/${moduleId}`);
    // Los demás módulos se pliegan en una fila que lleva a ese módulo.
    expect(
      screen.getByRole("link", { name: "Abrir el módulo Remuneraciones" }),
    ).toHaveAttribute("href", `/admin/documents?moduleId=${remuneracionesId}`);
    expect(
      screen.getByRole("link", { name: /^Evaluación docente/ }),
    ).toHaveAttribute("aria-current", "page");
    // En el historial las acciones rápidas siguen disponibles.
    expect(
      screen.getAllByRole("button", { name: /^Eliminar: / }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("link", { name: /^Ver detalle: / }).length,
    ).toBeGreaterThan(0);
  });

  it("expands the module chosen in the module rail", () => {
    render(
      <DocumentLibraryView
        activeFilterCount={1}
        historyGrouped
        historyLayout
        historyModuleId={remuneracionesId}
        library={{
          items: [{ ...document, title: "Contrato auxiliares 2026" }],
          limit: 3,
          offset: 0,
          total: 2,
        }}
        moduleSummaries={historySummaries}
        modules={historySummaries}
        query={parseDocumentLibraryQuery({ moduleId: remuneracionesId })}
      />,
    );

    expect(
      screen.getByRole("region", {
        name: "Documentos de Remuneraciones, desplazable horizontalmente",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: /^Remuneraciones/ }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByRole("link", { name: /^Ver todos en Remuneraciones/ }),
    ).toHaveAttribute("href", `/admin/modules/${remuneracionesId}`);
    // El módulo no elegido queda plegado y sin tabla propia.
    expect(
      screen.getByRole("link", { name: "Abrir el módulo Evaluación docente" }),
    ).toHaveAttribute("href", `/admin/documents?moduleId=${moduleId}`);
  });

  it("keeps the flat results when a search can span several modules", () => {
    render(
      <DocumentLibraryView
        activeFilterCount={1}
        historyLayout
        library={{ items: [document], limit: 20, offset: 0, total: 1 }}
        moduleSummaries={historySummaries}
        modules={historySummaries}
        query={parseDocumentLibraryQuery({ q: "nombramiento" })}
      />,
    );

    expect(screen.getByText("Resultados")).toBeVisible();
    expect(
      screen.getByRole("region", {
        name: "Tabla de documentos, desplazable horizontalmente",
      }),
    ).toHaveAttribute("tabindex", "0");
    expect(
      screen.queryByRole("region", { name: /^Documentos de / }),
    ).toBeNull();
  });

  it("does not display a misleading count for an unmanageable parent module", () => {
    const unmanageable = historySummaries.map((module) => ({
      ...module,
      canManage: false,
      documentCount: 0,
    }));

    render(
      <DocumentLibraryView
        activeFilterCount={0}
        historyGrouped
        historyLayout
        historyModuleId={moduleId}
        library={{ items: [], limit: 3, offset: 0, total: 0 }}
        moduleSummaries={unmanageable}
        modules={unmanageable}
        query={parseDocumentLibraryQuery({})}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Evaluación docente" }),
    ).toBeVisible();
    // Sin módulos con documentos se conserva la invitación a cargar desde Módulos.
    expect(screen.getByText("Aún no hay documentos registrados")).toBeVisible();
  });

  it("keeps the module rail usable when the documents request fails", () => {
    render(
      <DocumentLibraryView
        activeFilterCount={0}
        historyGrouped
        historyLayout
        historyModuleId={moduleId}
        library={{ items: [], limit: 3, offset: 0, total: 0 }}
        loadError
        moduleSummaries={historySummaries}
        modules={historySummaries}
        query={parseDocumentLibraryQuery({})}
      />,
    );

    // El aviso queda dentro del panel y ofrece reintentar la misma consulta.
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No pudimos cargar los documentos",
    );
    expect(screen.getByRole("link", { name: "Reintentar" })).toHaveAttribute(
      "href",
      "/admin/documents",
    );
    // La navegación entre módulos no se bloquea.
    expect(
      screen.getByRole("link", { name: "Abrir el módulo Remuneraciones" }),
    ).toHaveAttribute("href", `/admin/documents?moduleId=${remuneracionesId}`);
    expect(screen.queryByText(/^Mostrando/)).toBeNull();
  });

  it("adelanta la consulta del módulo cuando el puntero entra en la fila", () => {
    vi.mocked(loadHistoryModulePage).mockClear();
    vi.mocked(loadHistoryModulePage).mockResolvedValue({
      page: { items: [], limit: 3, offset: 0, total: 0 },
      status: "ok",
    });

    render(
      <DocumentLibraryView
        activeFilterCount={0}
        historyGrouped
        historyLayout
        historyModuleId={moduleId}
        library={{ items: [document], limit: 3, offset: 0, total: 1 }}
        moduleSummaries={historySummaries}
        modules={historySummaries}
        query={parseDocumentLibraryQuery({})}
      />,
    );

    fireEvent.pointerEnter(
      screen.getByRole("link", { name: "Abrir el módulo Remuneraciones" }),
    );

    // La consulta se adelanta antes del clic, así el panel abre sin espera.
    expect(loadHistoryModulePage).toHaveBeenCalledWith(remuneracionesId);
  });

  it("completa el panel inicial sin esperar la consulta en el servidor", async () => {
    vi.mocked(loadHistoryModulePage).mockClear();
    vi.mocked(loadHistoryModulePage).mockResolvedValue({
      page: { items: [document], limit: 3, offset: 0, total: 29 },
      status: "ok",
    });

    render(
      <DocumentLibraryView
        activeFilterCount={0}
        historyGrouped
        historyLayout
        historyModuleId={remuneracionesId}
        initialPagePending
        library={{ items: [], limit: 3, offset: 0, total: 0 }}
        moduleSummaries={historySummaries}
        modules={historySummaries}
        query={parseDocumentLibraryQuery({})}
      />,
    );

    // El conteo viene del resumen: el módulo ya no se muestra vacío mientras
    // carga, y la consulta se pide al montar en lugar de esperarla en el
    // servidor.
    expect(screen.queryByText("0 documentos")).toBeNull();
    expect(loadHistoryModulePage).toHaveBeenCalledWith(remuneracionesId);

    await waitFor(() =>
      expect(
        screen.getByRole("region", {
          name: "Documentos de Remuneraciones, desplazable horizontalmente",
        }),
      ).toBeVisible(),
    );
  });

  it("keeps the open module expanded when another module is opened", async () => {
    vi.mocked(loadHistoryModulePage).mockResolvedValue({
      page: {
        items: [{ ...document, title: "Ley 32498 de remuneraciones" }],
        limit: 3,
        offset: 0,
        total: 2,
      },
      status: "ok",
    });

    render(
      <DocumentLibraryView
        activeFilterCount={0}
        historyGrouped
        historyLayout
        historyModuleId={moduleId}
        library={{ items: [document], limit: 3, offset: 0, total: 1 }}
        moduleSummaries={historySummaries}
        modules={historySummaries}
        query={parseDocumentLibraryQuery({})}
      />,
    );

    fireEvent.click(
      screen.getByRole("link", { name: "Abrir el módulo Remuneraciones" }),
    );

    const remuneracionesPanel = await screen.findByRole("region", {
      name: "Documentos de Remuneraciones, desplazable horizontalmente",
    });
    expect(remuneracionesPanel).toBeVisible();
    expect(loadHistoryModulePage).toHaveBeenCalledWith(remuneracionesId);

    // El módulo anterior sigue abierto: no se cierra ni se recarga la vista.
    expect(
      screen.getByRole("region", {
        name: "Documentos de Evaluación docente, desplazable horizontalmente",
      }),
    ).toBeVisible();

    // El módulo abierto se puede contraer de forma explícita.
    fireEvent.click(
      screen.getByRole("button", { name: "Contraer el módulo Remuneraciones" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("region", {
          name: "Documentos de Remuneraciones, desplazable horizontalmente",
        }),
      ).toBeNull(),
    );
  });
});
