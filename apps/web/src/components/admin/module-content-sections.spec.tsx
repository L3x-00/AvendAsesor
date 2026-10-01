import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentLibraryItem } from "@/lib/admin-api/types";
import { ModuleContentSections } from "./module-content-sections";

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

function sectionFor(title: string): HTMLElement {
  const heading = screen.getByRole("heading", { name: new RegExp(`^${title}`) });
  const section = heading.closest("article");
  if (!section) throw new Error(`Sin sección ${title}`);
  return section;
}

const defaults = {
  issuanceYear: 2026,
  issuingEntity: "MINEDU",
  specificDependency: "DIGEDD",
};

function renderSections(
  documents: DocumentLibraryItem[] = [],
  extra: Partial<Parameters<typeof ModuleContentSections>[0]> = {},
) {
  return render(
    <ModuleContentSections
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

function lastPayload(): FormData {
  const call = vi.mocked(fetch).mock.calls.at(-1);
  return call?.[1]?.body as FormData;
}

describe("ModuleContentSections", () => {
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

  it("agrupa por secciones, ordena los anexos por número y no repite «Anexo N»", () => {
    renderSections([
      document({ title: "Anexo 10: constancia" }),
      document({ title: "Anexo 1 Contrato de Servicio Docente" }),
      document({ title: "Anexo N.° 3 Declaración jurada" }),
      document({ resolutionNumber: "2", title: "Solicitud de licencia" }),
      document({
        documentType: "RESOLUCION_MINISTERIAL",
        title: "RM 123-2026-MINEDU",
      }),
      document({
        documentType: "PREGUNTAS_FRECUENTES",
        title: "Preguntas frecuentes del proceso",
      }),
    ]);

    const items = within(sectionFor("Anexos")).getAllByRole("listitem");
    expect(items.map((li) => li.querySelector("p")?.textContent)).toEqual([
      "Anexo 1 Contrato de Servicio Docente",
      "Anexo 2: Solicitud de licencia",
      "Anexo N.° 3 Declaración jurada",
      "Anexo 10: constancia",
    ]);
    expect(
      within(sectionFor("Normativa")).getByText(/RM 123-2026-MINEDU/),
    ).toBeVisible();
    expect(
      within(sectionFor("Preguntas frecuentes")).getByText(
        /Preguntas frecuentes del proceso/,
      ),
    ).toBeVisible();
  });

  it("una «Otra norma» se queda en Normativa con su tipo real", () => {
    renderSections([
      document({
        documentType: "OTRO",
        documentTypeOther: "Decreto de Urgencia",
        metadata: { contentSection: "NORMATIVA" },
        title: "DU 012-2026",
      }),
      document({
        documentType: "OTRO",
        documentTypeOther: "Boletín",
        title: "Boletín interno",
      }),
    ]);

    const normativa = sectionFor("Normativa");
    expect(within(normativa).getByText("DU 012-2026")).toBeVisible();
    expect(within(normativa).getByText(/Decreto de Urgencia · 2026/)).toBeVisible();
    expect(
      within(sectionFor("Otros documentos")).getByText("Boletín interno"),
    ).toBeVisible();
  });

  it("avisa cuando un documento aún no lo usa el asistente", () => {
    renderSections([
      document({ technicalStatus: "pending_approval", title: "Anexo 1" }),
    ]);

    expect(
      within(sectionFor("Anexos")).getByText(/Pendiente de aprobación/),
    ).toBeVisible();
  });

  it("sin permiso de carga explica por qué y no ofrece subir", () => {
    renderSections([], {
      canUpload: false,
      uploadBlockedReason: "Este módulo está inactivo.",
    });

    expect(screen.queryByRole("button", { name: /^\+ Subir/ })).toBeNull();
    expect(screen.getByText("Este módulo está inactivo.")).toBeVisible();
    expect(
      within(sectionFor("Cronograma")).getByText(/Sin cronograma todavía/),
    ).toBeVisible();
  });

  it("«+ Subir anexos» abre una ventana accesible sin navegar y Escape devuelve el foco", async () => {
    const user = userEvent.setup();
    renderSections();

    const opener = within(sectionFor("Anexos")).getByRole("button", {
      name: "+ Subir anexos",
    });
    expect(opener).not.toHaveAttribute("href");
    await user.click(opener);

    const dialog = screen.getByRole("dialog", { name: "Subir a Anexos" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(
      within(dialog).getByLabelText("Archivo (PDF, Word o Markdown)"),
    ).toHaveFocus();
    expect(within(dialog).getByText(/hasta 300/)).toBeVisible();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("formulario resumido de Anexos: tipo fijo, datos del tema resumidos y número de anexo", async () => {
    const user = userEvent.setup();
    renderSections();
    await user.click(screen.getByRole("button", { name: "+ Subir anexos" }));
    const dialog = screen.getByRole("dialog");

    // Tipo visible y fijo; sin selector de tipo.
    expect(within(dialog).getByText("Anexo")).toBeVisible();
    expect(within(dialog).queryByLabelText(/^Tipo documental/)).toBeNull();
    // Año, entidad y dependencia ya completos, en un resumen con «Cambiar».
    expect(within(dialog).getByText("2026 · MINEDU · DIGEDD")).toBeVisible();
    expect(within(dialog).queryByLabelText(/Entidad emisora/)).toBeNull();
    // Palabras clave amigables, nunca el cuadro JSON.
    expect(within(dialog).getByLabelText("Palabras clave (opcional)")).toBeTruthy();
    expect(within(dialog).queryByLabelText(/JSON/)).toBeNull();
    expect(within(dialog).queryByLabelText(/Situación/)).toBeNull();

    // El título y el número se proponen desde el archivo.
    await user.upload(
      within(dialog).getByLabelText("Archivo (PDF, Word o Markdown)"),
      new File(["%PDF-1.7"], "Anexo_N°_03_declaracion_jurada.pdf", {
        type: "application/pdf",
      }),
    );
    expect(within(dialog).getByLabelText("Título")).toHaveValue(
      "Anexo N° 03 declaracion jurada",
    );
    expect(
      within(dialog).getByLabelText("Número de anexo (recomendado)"),
    ).toHaveValue(3);
  });

  it("sube el anexo con el número en metadata, cierra, lleva a la sección y resalta el documento nuevo", async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ id: "nuevo-anexo", title: "Contrato de servicio" }),
        { status: 201 },
      ),
    );
    const view = renderSections();
    const opener = screen.getByRole("button", { name: "+ Subir anexos" });
    await user.click(opener);
    const dialog = screen.getByRole("dialog");

    await user.upload(
      within(dialog).getByLabelText("Archivo (PDF, Word o Markdown)"),
      new File(["%PDF-1.7"], "contrato.pdf", { type: "application/pdf" }),
    );
    await user.clear(within(dialog).getByLabelText("Título"));
    await user.type(
      within(dialog).getByLabelText("Título"),
      "Contrato de servicio",
    );
    await user.type(
      within(dialog).getByLabelText("Número de anexo (recomendado)"),
      "4",
    );
    await user.click(within(dialog).getByRole("button", { name: "Subir anexo" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const payload = lastPayload();
    expect(payload.get("documentType")).toBe("ANEXO");
    expect(payload.get("issuanceYear")).toBe("2026");
    expect(payload.get("issuingEntity")).toBe("MINEDU");
    expect(payload.get("specificDependency")).toBe("DIGEDD");
    expect(payload.get("moduleIds")).toBe(JSON.stringify([MODULE_ID]));
    expect(JSON.parse(String(payload.get("metadata")))).toEqual({
      annexNumber: 4,
    });
    expect(payload.has("annexNumber")).toBe(false);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status", { hidden: true })).toHaveTextContent(
      "«Contrato de servicio» se cargó en Anexos.",
    );

    // La recarga del servidor trae el documento: queda en Anexos y parpadea.
    view.rerender(
      <ModuleContentSections
        apiBaseUrl="https://api.avend.example"
        canUpload
        documents={[
          document({
            id: "nuevo-anexo",
            metadata: { annexNumber: 4 },
            title: "Contrato de servicio",
          }),
        ]}
        moduleId={MODULE_ID}
        moduleName="Contrato docente"
        uploadDefaults={defaults}
      />,
    );

    const row = await waitFor(() => {
      const found = within(sectionFor("Anexos"))
        .getByText("Anexo 4: Contrato de servicio")
        .closest("li");
      expect(found?.className).toMatch(/itemNew/);
      return found!;
    });
    expect(scrollIntoView).toHaveBeenCalled();
    expect(row).toHaveAttribute("data-document-id", "nuevo-anexo");
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
      const existing = document({
        documentType: "CRONOGRAMA",
        id: "nuevo",
        title: "Cronograma",
      });
      renderSections([existing]);
      await user.click(screen.getByRole("button", { name: "+ Subir cronograma" }));
      const dialog = screen.getByRole("dialog");
      await user.upload(
        within(dialog).getByLabelText("Archivo (PDF, Word o Markdown)"),
        new File(["%PDF-1.7"], "cronograma.pdf", { type: "application/pdf" }),
      );
      await user.click(
        within(dialog).getByRole("button", { name: "Subir cronograma" }),
      );
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

      const row = () => screen.getByText("Cronograma", { selector: "p" }).closest("li");
      await waitFor(() => expect(row()?.className).toMatch(/itemNew/));
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      expect(row()?.className).not.toMatch(/itemNew/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("Normativa ofrece «Otra norma» y la guarda como OTRO marcada para Normativa", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: "du", title: "DU 012-2026" }), {
        status: 201,
      }),
    );
    renderSections();
    await user.click(screen.getByRole("button", { name: "+ Subir normativa" }));
    const dialog = screen.getByRole("dialog");

    const type = within(dialog).getByLabelText(/^Tipo documental/);
    expect(within(type).getByRole("option", { name: "Ley" })).toBeTruthy();
    expect(within(type).queryByRole("option", { name: "Anexo" })).toBeNull();
    await user.selectOptions(type, "OTRO");
    await user.upload(
      within(dialog).getByLabelText("Archivo (PDF, Word o Markdown)"),
      new File(["%PDF-1.7"], "du.pdf", { type: "application/pdf" }),
    );
    await user.clear(within(dialog).getByLabelText("Título"));
    await user.type(within(dialog).getByLabelText("Título"), "DU 012-2026");

    // «Nombre del tipo de norma» es obligatorio.
    await user.click(within(dialog).getByRole("button", { name: "Subir norma" }));
    expect(fetch).not.toHaveBeenCalled();
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
  });

  it("sin datos del tema muestra año, entidad y dependencia como obligatorios", async () => {
    const user = userEvent.setup();
    renderSections([], { uploadDefaults: { issuanceYear: 2026 } });
    await user.click(
      screen.getByRole("button", { name: "+ Subir preguntas frecuentes" }),
    );
    const dialog = screen.getByRole("dialog");

    expect(within(dialog).getByLabelText(/Año del documento/)).toHaveValue(
      "2026",
    );
    const entity = within(dialog).getByLabelText(/Entidad emisora/);
    expect(entity).toBeRequired();
    expect(entity).toHaveValue("");
  });

  it("«Cambiar» abre los datos del tema ya completos y enfoca el año", async () => {
    const user = userEvent.setup();
    renderSections();
    await user.click(screen.getByRole("button", { name: "+ Subir anexos" }));
    const dialog = screen.getByRole("dialog");

    await user.click(within(dialog).getByRole("button", { name: "Cambiar" }));
    expect(within(dialog).getByLabelText(/Año del documento/)).toHaveFocus();
    expect(within(dialog).getByLabelText(/Entidad emisora/)).toHaveValue(
      "MINEDU",
    );
    expect(within(dialog).getByLabelText(/Dependencia específica/)).toHaveValue(
      "DIGEDD",
    );
  });

  it("cambiar de sección conserva el título escrito", async () => {
    const user = userEvent.setup();
    renderSections();
    await user.click(screen.getByRole("button", { name: "+ Subir anexos" }));
    const dialog = screen.getByRole("dialog");
    await user.type(
      within(dialog).getByLabelText("Título"),
      "Cronograma de contratación 2026",
    );

    await user.click(within(dialog).getByRole("button", { name: "Cambiar sección" }));
    await user.selectOptions(within(dialog).getByLabelText("Sección"), "CRONOGRAMA");

    expect(
      screen.getByRole("dialog", { name: "Subir a Cronograma" }),
    ).toBeVisible();
    expect(within(dialog).getByLabelText("Título")).toHaveValue(
      "Cronograma de contratación 2026",
    );
    expect(
      dialog.querySelector('input[name="documentType"]'),
    ).toHaveValue("CRONOGRAMA");
    expect(within(dialog).queryByLabelText(/Número de anexo/)).toBeNull();
  });

  it("mantiene el foco dentro de la ventana y se cierra con «Cerrar»", async () => {
    const user = userEvent.setup();
    renderSections();
    const opener = screen.getByRole("button", { name: "+ Subir cronograma" });
    await user.click(opener);
    const dialog = screen.getByRole("dialog");
    const close = within(dialog).getByRole("button", { name: /Cerrar/ });

    close.focus();
    await user.tab({ shift: true });
    expect(dialog.contains(window.document.activeElement)).toBe(true);
    expect(window.document.activeElement).not.toBe(close);

    const submit = within(dialog).getByRole("button", {
      name: "Subir cronograma",
    });
    submit.focus();
    // Desde el último control, Tab vuelve al principio de la ventana.
    const focusables = dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([type="hidden"]), select, summary',
    );
    focusables[focusables.length - 1]!.focus();
    await user.tab();
    expect(close).toHaveFocus();

    await user.click(close);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("no se puede cerrar mientras se sube el documento", async () => {
    const user = userEvent.setup();
    let finish: (response: Response) => void = () => undefined;
    vi.mocked(fetch).mockReturnValue(
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
    );
    renderSections();
    await user.click(screen.getByRole("button", { name: "+ Subir cronograma" }));
    const dialog = screen.getByRole("dialog");
    await user.upload(
      within(dialog).getByLabelText("Archivo (PDF, Word o Markdown)"),
      new File(["%PDF-1.7"], "cronograma_2026.pdf", { type: "application/pdf" }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Subir cronograma" }),
    );

    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: /Cerrar/ })).toBeDisabled(),
    );
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeVisible();

    await act(async () => {
      finish(new Response(JSON.stringify({ id: "c-1" }), { status: 201 }));
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("abre la ventana al llegar con un enlace antiguo de sección", () => {
    renderSections([], { initialUploadSection: "PREGUNTAS_FRECUENTES" });

    expect(
      screen.getByRole("dialog", { name: "Subir a Preguntas frecuentes" }),
    ).toBeVisible();
  });
});
