import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagedModuleSummary } from "@/lib/admin-api/types";
import ModuleDetailPage from "./page";

const { client } = vi.hoisted(() => ({
  client: {
    getDocumentSuggestions: vi.fn(),
    listDocumentLibrary: vi.fn(),
    listModuleSummaries: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/lib/admin-api/authorized-client", () => ({
  createAuthorizedAdminApiContext: vi.fn(async () => ({ client })),
}));
vi.mock("@/lib/admin-api/config", () => ({
  getAdminApiUrl: () => "https://api.example.test",
}));
vi.mock("@/lib/admin-api/replacement-candidates", () => ({
  listReplacementDocumentCandidates: vi.fn(async () => []),
}));
vi.mock("@/lib/admin-api/module-content", () => ({
  contextualUploadDefaults: () => ({}),
  currentLimaYear: () => 2026,
  libraryPageCoversModule: () => true,
  listModuleContentDocuments: vi.fn(async () => ({
    complete: true,
    documents: [],
  })),
  parseContentSectionParam: () => undefined,
}));
vi.mock("@/components/admin/admin-page", () => ({
  AdminPage: ({ children, title }: { children: ReactNode; title: string }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));
vi.mock("@/components/admin/document-library-view", () => ({
  DocumentLibraryView: () => null,
}));
vi.mock("@/components/admin/module-content-sections", () => ({
  ModuleContentSections: () => null,
}));
vi.mock("@/components/admin/document-upload-panel", () => ({
  DocumentUploadPanel: () => null,
}));
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock("@/app/admin/actions", () => ({
  createModuleAction: vi.fn(async () => ({ status: "idle" })),
  deleteModuleAction: vi.fn(async () => ({ status: "idle" })),
  setModuleStatusAction: vi.fn(async () => ({ status: "idle" })),
  updateModuleAction: vi.fn(async () => ({ status: "idle" })),
}));

function summary(
  overrides: Partial<ManagedModuleSummary>,
): ManagedModuleSummary {
  return {
    canManage: true,
    code: "CONTRATO",
    createdAt: "2026-09-01T00:00:00.000Z",
    createdBy: null,
    deactivatedAt: null,
    deactivatedBy: null,
    deactivationReason: null,
    deletedAt: null,
    deletedBy: null,
    deletionReason: null,
    description: null,
    documentCount: 0,
    id: "11111111-1111-4111-8111-111111111111",
    isActive: true,
    isDeleted: false,
    metadata: {},
    name: "Contrato y desplazamiento",
    parentModuleId: null,
    sortOrder: 1,
    submoduleCount: 0,
    updatedAt: "2026-09-01T00:00:00.000Z",
    updatedBy: null,
    ...overrides,
  } as ManagedModuleSummary;
}

async function renderPage(module: ManagedModuleSummary) {
  client.listModuleSummaries.mockResolvedValue([module]);
  const page = await ModuleDetailPage({
    params: Promise.resolve({ moduleId: module.id }),
    searchParams: Promise.resolve({}),
  });
  render(page);
}

describe("página de un módulo: alta de submódulos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    Element.prototype.scrollIntoView = vi.fn();
    client.getDocumentSuggestions.mockResolvedValue({});
    client.listDocumentLibrary.mockResolvedValue({
      items: [],
      limit: 20,
      offset: 0,
      total: 0,
    });
  });

  it("dentro de un módulo inactivo, el submódulo nuevo queda preseleccionado como inactivo", async () => {
    const user = userEvent.setup();
    await renderPage(summary({ isActive: false }));

    await user.click(screen.getByRole("button", { name: "+ Crear submódulo" }));

    const status = screen.getByRole("combobox", { name: /Estado/ });
    expect(status).toHaveValue("false");
    expect(
      within(status).getByRole("option", { name: "Activo" }),
    ).toBeDisabled();
  });

  it("dentro de un módulo activo, el submódulo nuevo empieza activo", async () => {
    const user = userEvent.setup();
    await renderPage(summary({ isActive: true }));

    await user.click(screen.getByRole("button", { name: "+ Crear submódulo" }));

    expect(screen.getByRole("combobox", { name: /Estado/ })).toHaveValue(
      "true",
    );
  });

  it("un módulo con documentos propios no ofrece crear submódulos y explica por qué", async () => {
    await renderPage(summary({ documentCount: 3 }));

    expect(
      screen.queryByRole("button", { name: "+ Crear submódulo" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(
      /ya tiene documentos propios/,
    );
  });
});
