import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentLibraryItem } from "@/lib/admin-api/types";
import { SubmoduleContentView } from "./submodule-content-view";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  refresh: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createBrowserSupabaseClient: () => ({
    auth: { getSession: mocks.getSession },
  }),
}));

vi.mock("@/app/admin/actions", () => ({
  deleteDocumentAction: vi.fn(async () => ({ status: "idle" })),
  setDocumentTechnicalStatusAction: vi.fn(async () => ({ status: "idle" })),
}));

const MODULE_ID = "8c8b56af-6d0c-4fef-881e-7c00907540dd";
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

const defaults = {
  issuanceYear: 2026,
  issuingEntity: "MINEDU",
  specificDependency: "DIGEDD",
};

function renderView(
  documents: DocumentLibraryItem[] = [],
  extra: Partial<Parameters<typeof SubmoduleContentView>[0]> = {},
) {
  return render(
    <SubmoduleContentView
      apiBaseUrl="https://api.avend.example"
      canUpload
      documents={documents}
      moduleId={MODULE_ID}
      moduleName="Contrato docente"
      uploadDefaults={defaults}
      {...extra}
    />,
  );
}

function tab(name: RegExp) {
  return screen.getByRole("tab", { name });
}

function lastPayload(): FormData {
  const call = vi.mocked(fetch).mock.calls.at(-1);
  return call?.[1]?.body as FormData;
}

describe("SubmoduleContentView", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.getSession.mockReset();
    mocks.refresh.mockReset();
    mocks.showToast.mockReset();
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "token" } },
      error: null,
    });
    vi.stubGlobal("fetch", vi.fn());
  });

  it("muestra las cuatro secciones con su cantidad y abre solo la activa", async () => {
    const user = userEvent.setup();
    renderView([
      document({ documentType: "RESOLUCION_MINISTERIAL", title: "RM 123-2026" }),
      document({
        documentType: "ANEXO",
        metadata: { annexNumber: 1 },
        title: "Anexo 1 de prueba",
      }),
    ]);

    expect(tab(/^Normativa/)).toBeVisible();
    expect(tab(/^Cronograma/)).toBeVisible();
    expect(tab(/^Anexos/)).toBeVisible();
    expect(tab(/^Preguntas frecuentes/)).toBeVisible();
    expect(tab(/^Normativa/)).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("RM 123-2026")).toBeVisible();
    expect(screen.queryByText("Anexo 1 de prueba")).toBeNull();

    await user.click(tab(/^Anexos/));
    expect(tab(/^Anexos/)).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Anexo 1 de prueba")).toBeVisible();
    expect(screen.queryByText("RM 123-2026")).toBeNull();
  });

  it("permite recorrer las secciones con las flechas del teclado", async () => {
    const user = userEvent.setup();
    renderView();

    tab(/^Normativa/).focus();
    await user.keyboard("{ArrowRight}");
    expect(tab(/^Cronograma/)).toHaveFocus();
    expect(tab(/^Cronograma/)).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowLeft}");
    expect(tab(/^Normativa/)).toHaveFocus();
  });

  it("ordena los anexos por número y no repite «Anexo N»", async () => {
    const user = userEvent.setup();
    renderView([
      document({ title: "Anexo 10: constancia" }),
      document({ title: "Anexo 1 Contrato de Servicio Docente" }),
      document({ title: "Anexo N.° 3 Declaración jurada" }),
      document({ resolutionNumber: "2", title: "Solicitud de licencia" }),
    ]);
    await user.click(tab(/^Anexos/));

    const titles = screen
      .getAllByRole("link", { name: /^Anexo/ })
      .map((link) => link.textContent);
    expect(titles).toEqual([
      "Anexo 1 Contrato de Servicio Docente",
      "Anexo 2: Solicitud de licencia",
      "Anexo N.° 3 Declaración jurada",
      "Anexo 10: constancia",
    ]);
  });

  it("busca por nombre y filtra por situación dentro de la sección", async () => {
    const user = userEvent.setup();
    renderView([
      document({
        documentType: "RESOLUCION_MINISTERIAL",
        title: "RM 123-2026",
      }),
      document({
        documentType: "LEY",
        situation: "archived",
        title: "Ley 30328",
      }),
    ]);

    await user.type(
      screen.getByLabelText("Buscar documento por nombre"),
      "30328",
    );
    expect(screen.getByText("Ley 30328")).toBeVisible();
    expect(screen.queryByText("RM 123-2026")).toBeNull();

    await user.click(screen.getByText("Filtrar"));
    await user.click(screen.getByRole("checkbox", { name: "Vigente" }));
    expect(screen.queryByText("Ley 30328")).toBeNull();
    await user.click(screen.getByRole("checkbox", { name: "Vigente" }));
    expect(screen.getByText("Ley 30328")).toBeVisible();
  });

  it("cambia entre vista de lista y cuadrícula sin perder acciones", async () => {
    const user = userEvent.setup();
    renderView([
      document({
        documentType: "RESOLUCION_MINISTERIAL",
        title: "RM 123-2026",
      }),
    ]);

    expect(screen.getByRole("table")).toBeVisible();
    expect(screen.getByRole("button", { name: "Vista de lista" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Vista de cuadrícula" }));
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("button", { name: "Vista de cuadrícula" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getAllByRole("link", { name: /^Ver detalle: / })[0],
    ).toHaveAttribute("href", `/admin/documents/${documentid()}`);
  });

  it("muestra 5 documentos y «Ver todos» despliega el resto", async () => {
    const user = userEvent.setup();
    renderView(
      Array.from({ length: 7 }, (_, index) =>
        document({
          documentType: "RESOLUCION_MINISTERIAL",
          title: `RM ${index + 1}-2026`,
        }),
      ),
    );

    expect(screen.getAllByRole("row")).toHaveLength(6);
    const toggle = screen.getByRole("button", { name: /Ver todos \(7\)/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(screen.getAllByRole("row")).toHaveLength(8);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("abre la ventana de carga de la sección activa y guarda el metadata", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: "nuevo", title: "DU 012-2026" }), {
        status: 201,
      }),
    );
    renderView();

    await user.click(screen.getByRole("button", { name: "+ Subir normativa" }));
    const dialog = screen.getByRole("dialog", { name: "Subir a Normativa" });
    const type = within(dialog).getByLabelText(/^Tipo documental/);
    expect(within(type).queryByRole("option", { name: "Anexo" })).toBeNull();
    await user.selectOptions(type, "OTRO");
    await user.upload(
      within(dialog).getByLabelText("Archivo (PDF, Word o Markdown)"),
      new File(["%PDF-1.7"], "du.pdf", { type: "application/pdf" }),
    );
    await user.clear(within(dialog).getByLabelText("Título"));
    await user.type(within(dialog).getByLabelText("Título"), "DU 012-2026");
    await user.type(
      within(dialog).getByLabelText("Nombre del tipo de norma"),
      "Decreto de Urgencia",
    );
    await user.click(within(dialog).getByRole("button", { name: "Subir norma" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const payload = lastPayload();
    expect(payload.get("documentType")).toBe("OTRO");
    expect(payload.get("documentTypeOther")).toBe("Decreto de Urgencia");
    expect(JSON.parse(String(payload.get("metadata")))).toEqual({
      contentSection: "NORMATIVA",
    });
    expect(payload.get("moduleIds")).toBe(JSON.stringify([MODULE_ID]));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status", { hidden: true })).toHaveTextContent(
      "se cargó en Normativa",
    );
  });

  it("abre todas las filas cuando el documento cargado queda fuera de los cinco primeros", async () => {
    const user = userEvent.setup();
    Element.prototype.scrollIntoView = vi.fn();
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: "nuevo-ultimo", title: "RM 900-2026" }), {
        status: 201,
      }),
    );
    const existing = Array.from({ length: 7 }, (_, index) =>
      document({
        documentType: "RESOLUCION_MINISTERIAL",
        title: `RM ${index + 1}-2026`,
      }),
    );
    const view = renderView(existing);
    await user.click(screen.getByRole("button", { name: "+ Subir normativa" }));
    const dialog = screen.getByRole("dialog");
    await user.upload(
      within(dialog).getByLabelText("Archivo (PDF, Word o Markdown)"),
      new File(["%PDF-1.7"], "nuevo.pdf", { type: "application/pdf" }),
    );
    await user.clear(within(dialog).getByLabelText("Título"));
    await user.type(within(dialog).getByLabelText("Título"), "RM 900-2026");
    await user.selectOptions(
      within(dialog).getByLabelText(/^Tipo documental/),
      "LEY",
    );
    await user.click(within(dialog).getByRole("button", { name: "Subir norma" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    view.rerender(
      <SubmoduleContentView
        apiBaseUrl="https://api.avend.example"
        canUpload
        documents={[
          ...existing,
          document({
            documentType: "RESOLUCION_MINISTERIAL",
            id: "nuevo-ultimo",
            title: "RM 900-2026",
          }),
        ]}
        moduleId={MODULE_ID}
        moduleName="Contrato docente"
        uploadDefaults={defaults}
      />,
    );

    expect(screen.getByRole("button", { name: /Ver menos/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    const row = await waitFor(() => {
      const found = screen.getByText("RM 900-2026").closest("tr");
      expect(found?.className).toMatch(/rowNew/);
      return found!;
    });
    expect(row).toHaveAttribute("data-document-id", "nuevo-ultimo");
  });

  it("tras cargar resalta el documento nuevo en su sección", async () => {
    const user = userEvent.setup();
    Element.prototype.scrollIntoView = vi.fn();
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: "nuevo-anexo", title: "Anexo nuevo" }), {
        status: 201,
      }),
    );
    const view = renderView();
    await user.click(screen.getByRole("button", { name: "+ Subir normativa" }));
    const dialog = screen.getByRole("dialog");
    await user.upload(
      within(dialog).getByLabelText("Archivo (PDF, Word o Markdown)"),
      new File(["%PDF-1.7"], "anexo.pdf", { type: "application/pdf" }),
    );
    await user.clear(within(dialog).getByLabelText("Título"));
    await user.type(within(dialog).getByLabelText("Título"), "Anexo nuevo");
    await user.selectOptions(
      within(dialog).getByLabelText(/^Tipo documental/),
      "LEY",
    );
    await user.click(within(dialog).getByRole("button", { name: "Subir norma" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    view.rerender(
      <SubmoduleContentView
        apiBaseUrl="https://api.avend.example"
        canUpload
        documents={[
          document({
            documentType: "RESOLUCION_MINISTERIAL",
            id: "nuevo-anexo",
            title: "Anexo nuevo",
          }),
        ]}
        moduleId={MODULE_ID}
        moduleName="Contrato docente"
        uploadDefaults={defaults}
      />,
    );

    const row = await waitFor(() => {
      const found = screen.getByText("Anexo nuevo").closest("tr");
      expect(found?.className).toMatch(/rowNew/);
      return found!;
    });
    expect(row).toHaveAttribute("data-document-id", "nuevo-anexo");
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("sin permiso de carga explica por qué y no ofrece subir", () => {
    renderView([], {
      canUpload: false,
      uploadBlockedReason: "Este submódulo está inactivo.",
    });
    expect(screen.queryByRole("button", { name: /^\+ Subir/ })).toBeNull();
    expect(screen.getByText("Este submódulo está inactivo.")).toBeVisible();
    expect(screen.getByText("Sin normativa todavía.")).toBeVisible();
  });

  it("abre la ventana al llegar con un enlace antiguo de sección", () => {
    renderView([], { initialUploadSection: "PREGUNTAS_FRECUENTES" });
    expect(
      screen.getByRole("dialog", { name: "Subir a Preguntas frecuentes" }),
    ).toBeVisible();
  });

  it("el resaltado termina solo", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      Element.prototype.scrollIntoView = vi.fn();
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ id: "nuevo", title: "Cronograma" }), {
          status: 201,
        }),
      );
      renderView([
        document({
          documentType: "RESOLUCION_MINISTERIAL",
          id: "nuevo",
          title: "Cronograma",
        }),
      ]);
      await user.click(screen.getByRole("button", { name: "+ Subir normativa" }));
      const dialog = screen.getByRole("dialog");
      await user.upload(
        within(dialog).getByLabelText("Archivo (PDF, Word o Markdown)"),
        new File(["%PDF-1.7"], "cronograma.pdf", { type: "application/pdf" }),
      );
      await user.selectOptions(
        within(dialog).getByLabelText(/^Tipo documental/),
        "LEY",
      );
      await user.click(
        within(dialog).getByRole("button", { name: "Subir norma" }),
      );
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

      const row = () =>
        within(screen.getByRole("table")).getByText("Cronograma").closest("tr");
      await waitFor(() => expect(row()?.className).toMatch(/rowNew/));
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      expect(row()?.className).not.toMatch(/rowNew/);
    } finally {
      vi.useRealTimers();
    }
  });
});

function documentid(): string {
  return screen
    .getAllByRole("link", { name: /^Ver detalle: / })[0]
    .getAttribute("href")!
    .replace("/admin/documents/", "");
}
