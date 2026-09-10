import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FieldError } from "@/components/ui/form-field";
import {
  DocumentPdfUploadForm,
  MAX_ADMIN_PDF_BYTES,
} from "./document-pdf-upload-form";

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

function renderUploadForm(endpoint = "/admin/documents", includeModule = true) {
  render(
    <DocumentPdfUploadForm
      apiBaseUrl="https://api.avend.example"
      endpoint={endpoint}
      submitLabel="Cargar PDF"
      successMessage="Documento PDF creado."
    >
      <label htmlFor="test-file">
        Archivo
        <input id="test-file" name="file" type="file" />
      </label>
      {/* Igual que en la pantalla real: el error del archivo se pinta debajo
          de su campo, no en el aviso general del formulario. */}
      <FieldError name="file" />
      <label htmlFor="test-title">
        Título
        <input id="test-title" name="title" />
      </label>
      <input name="issuanceYearMode" type="hidden" value="2026" />
      <input name="issuanceYear" type="hidden" value="2026" />
      {includeModule ? (
        <label htmlFor="test-module">
          Módulo
          <input
            id="test-module"
            name="moduleId"
            type="checkbox"
            value="module-id"
          />
        </label>
      ) : null}
    </DocumentPdfUploadForm>,
  );
}

describe("DocumentPdfUploadForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.getSession.mockReset();
    mocks.refresh.mockReset();
    mocks.showToast.mockReset();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("uploads directly to the API with the bearer and preserves multipart boundaries", async () => {
    const user = userEvent.setup();
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "verified-token" } },
      error: null,
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: "document-id" }), { status: 201 }),
    );
    renderUploadForm();
    const file = new File(["%PDF-1.7"], "norma.pdf", {
      type: "application/pdf",
    });

    await user.upload(screen.getByLabelText("Archivo"), file);
    await user.type(screen.getByLabelText("Título"), "Norma educativa");
    await user.click(screen.getByLabelText("Módulo"));
    await user.click(screen.getByRole("button", { name: "Cargar PDF" }));

    expect(
      await screen.findByText("Documento PDF creado."),
    ).toBeInTheDocument();
    expect(mocks.showToast).toHaveBeenCalledWith("Documento PDF creado.");
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = vi.mocked(fetch).mock.calls[0] ?? [];
    const headers = options?.headers as Record<string, string>;

    expect(String(url)).toBe("https://api.avend.example/admin/documents");
    expect(headers.Authorization).toBe("Bearer verified-token");
    expect(headers).not.toHaveProperty("Content-Type");
    expect(options?.body).toBeInstanceOf(window.FormData);
    const payload = options?.body as FormData;
    expect(payload.get("title")).toBe("Norma educativa");
    expect(payload.get("moduleIds")).toBe('["module-id"]');
    expect(payload.has("moduleId")).toBe(false);
    expect(payload.has("issuanceYearMode")).toBe(false);
    expect(payload.get("issuanceYear")).toBe("2026");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Título")).toHaveValue("");
  });

  it("keeps the PDF and entered fields when the API rejects the upload", async () => {
    const user = userEvent.setup();
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "verified-token" } },
      error: null,
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ message: "too large" }), { status: 413 }),
    );
    renderUploadForm();
    const file = new File(["%PDF-1.7"], "norma.pdf", {
      type: "application/pdf",
    });
    const fileInput = screen.getByLabelText<HTMLInputElement>("Archivo");
    const titleInput = screen.getByLabelText("Título");

    await user.upload(fileInput, file);
    await user.type(titleInput, "Norma que debe conservarse");
    await user.click(screen.getByRole("button", { name: "Cargar PDF" }));

    // El tamaño es un problema del campo del archivo, así que se señala ahí y
    // no en el aviso general del formulario.
    expect(await screen.findByText(/50 MB/)).toBeVisible();
    expect(titleInput).toHaveValue("Norma que debe conservarse");
    expect(fileInput.files?.[0]?.name).toBe("norma.pdf");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("shows visible progress and blocks a duplicate submission while uploading", async () => {
    const user = userEvent.setup();
    let finishUpload: ((response: Response) => void) | undefined;
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "verified-token" } },
      error: null,
    });
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finishUpload = resolve;
        }),
    );
    renderUploadForm();

    await user.upload(
      screen.getByLabelText("Archivo"),
      new File(["%PDF-1.7"], "norma.pdf", { type: "application/pdf" }),
    );
    await user.type(screen.getByLabelText("Título"), "Norma en carga");
    await user.click(screen.getByRole("button", { name: "Cargar PDF" }));

    const pendingButton = screen.getByRole("button", {
      name: "Cargando…",
    });
    expect(pendingButton).toHaveAttribute("aria-disabled", "true");
    expect(pendingButton).toHaveFocus();
    expect(pendingButton.closest("form")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Cargando el documento. Espera mientras se valida y registra.",
    );
    await user.click(pendingButton);
    expect(fetch).toHaveBeenCalledTimes(1);

    finishUpload?.(
      new Response(JSON.stringify({ id: "document-id" }), { status: 201 }),
    );
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "Documento PDF creado.",
      );
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the form when the session is missing and never calls the API", async () => {
    const user = userEvent.setup();
    mocks.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    renderUploadForm();
    const file = new File(["%PDF-1.7"], "norma.pdf", {
      type: "application/pdf",
    });

    await user.upload(screen.getByLabelText("Archivo"), file);
    await user.type(screen.getByLabelText("Título"), "Norma pendiente");
    await user.click(screen.getByRole("button", { name: "Cargar PDF" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("sesión expiró");
    expect(screen.getByLabelText("Título")).toHaveValue("Norma pendiente");
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("rejects an oversized file before making a network request", async () => {
    const user = userEvent.setup();
    renderUploadForm();
    const file = new File(
      [new Uint8Array(MAX_ADMIN_PDF_BYTES + 1)],
      "grande.pdf",
      { type: "application/pdf" },
    );

    await user.upload(screen.getByLabelText("Archivo"), file);
    await user.type(screen.getByLabelText("Título"), "Documento grande");
    await user.click(screen.getByRole("button", { name: "Cargar PDF" }));

    await waitFor(() => {
      expect(screen.getByText(/50 MB/)).toBeVisible();
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("accepts a PDF from devices that report a generic MIME type", async () => {
    const user = userEvent.setup({ applyAccept: false });
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "verified-token" } },
      error: null,
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: "document-id" }), { status: 201 }),
    );
    renderUploadForm();

    await user.upload(
      screen.getByLabelText("Archivo"),
      new File(["%PDF-1.7"], "dispositivo.pdf", {
        type: "application/octet-stream",
      }),
    );
    await user.type(screen.getByLabelText("Título"), "PDF desde dispositivo");
    await user.click(screen.getByRole("button", { name: "Cargar PDF" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Documento PDF creado.",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("uses the requested version endpoint without a page navigation", async () => {
    const user = userEvent.setup();
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "verified-token" } },
      error: null,
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: "document-id" }), { status: 201 }),
    );
    renderUploadForm("/admin/documents/document-id/versions", false);

    await user.upload(
      screen.getByLabelText("Archivo"),
      new File(["%PDF-1.7"], "version.pdf", { type: "application/pdf" }),
    );
    await user.type(screen.getByLabelText("Título"), "Nueva versión");
    await user.click(screen.getByRole("button", { name: "Cargar PDF" }));

    await screen.findByRole("status");
    expect(fetch).toHaveBeenCalledWith(
      new URL("https://api.avend.example/admin/documents/document-id/versions"),
      expect.any(Object),
    );
  });

  it("omits blank optional fields so the API does not reject them with 400", async () => {
    const user = userEvent.setup();
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "verified-token" } },
      error: null,
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: "document-id" }), { status: 201 }),
    );
    render(
      <DocumentPdfUploadForm
        apiBaseUrl="https://api.avend.example"
        endpoint="/admin/documents"
        submitLabel="Cargar PDF"
        successMessage="Documento PDF creado."
      >
        <label htmlFor="opt-file">
          Archivo
          <input id="opt-file" name="file" type="file" />
        </label>
        <label htmlFor="opt-title">
          Título
          <input id="opt-title" name="title" />
        </label>
        <label htmlFor="opt-entity">
          Entidad
          <input id="opt-entity" name="issuingEntity" />
        </label>
        <label htmlFor="opt-year">
          Año
          <input id="opt-year" name="issuanceYear" />
        </label>
        <label htmlFor="opt-meta">
          Metadatos
          <textarea id="opt-meta" name="metadata" />
        </label>
      </DocumentPdfUploadForm>,
    );

    await user.upload(
      screen.getByLabelText("Archivo"),
      new File(["%PDF-1.7"], "norma.pdf", { type: "application/pdf" }),
    );
    await user.type(screen.getByLabelText("Título"), "Norma sin opcionales");
    await user.click(screen.getByRole("button", { name: "Cargar PDF" }));

    await screen.findByRole("status");
    const payload = vi.mocked(fetch).mock.calls[0]?.[1]?.body as FormData;
    expect(payload.get("title")).toBe("Norma sin opcionales");
    expect(payload.has("issuingEntity")).toBe(false);
    expect(payload.has("issuanceYear")).toBe(false);
    expect(payload.has("metadata")).toBe(false);
  });

  it("surfaces a message and does not upload when a required field is invalid", async () => {
    const user = userEvent.setup();
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "verified-token" } },
      error: null,
    });
    render(
      <DocumentPdfUploadForm
        apiBaseUrl="https://api.avend.example"
        endpoint="/admin/documents"
        submitLabel="Cargar PDF"
        successMessage="Documento PDF creado."
      >
        <label htmlFor="req-file">
          Archivo
          <input id="req-file" name="file" type="file" />
        </label>
        <label htmlFor="req-title">
          Título
          <input id="req-title" name="title" required />
        </label>
      </DocumentPdfUploadForm>,
    );

    await user.upload(
      screen.getByLabelText("Archivo"),
      new File(["%PDF-1.7"], "norma.pdf", { type: "application/pdf" }),
    );
    // Leave the required "Título" empty on purpose.
    await user.click(screen.getByRole("button", { name: "Cargar PDF" }));

    await waitFor(() => expect(screen.getByLabelText("Título")).toHaveFocus());
    expect(screen.getByLabelText("Título")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Título")).toHaveAccessibleDescription(/obligatorio/i);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.getSession).not.toHaveBeenCalled();
  });
  it("marks every missing field, focuses the first in form order and clears corrected errors", async () => {
    const user = userEvent.setup();
    render(
      <DocumentPdfUploadForm apiBaseUrl="https://api.avend.example" endpoint="/admin/documents" submitLabel="Cargar PDF" successMessage="Documento PDF creado.">
        <label htmlFor="all-title">Título<input id="all-title" name="title" required /></label>
        <label htmlFor="all-file">Archivo<input id="all-file" name="file" type="file" required /></label>
      </DocumentPdfUploadForm>,
    );
    const title = screen.getByLabelText("Título");
    const upload = screen.getByLabelText("Archivo");
    await user.click(screen.getByRole("button", { name: "Cargar PDF" }));
    await waitFor(() => expect(title).toHaveFocus());
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(upload).toHaveAttribute("aria-invalid", "true");
    expect(upload).toHaveAccessibleDescription(/obligatorio/i);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await user.type(title, "Norma conservada");
    expect(title).not.toHaveAttribute("aria-invalid", "true");
    expect(upload).toHaveAttribute("aria-invalid", "true");
    await user.upload(upload, new File(["%PDF-1.7"], "norma.pdf", { type: "application/pdf" }));
    expect(upload).not.toHaveAttribute("aria-invalid", "true");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a non-PDF and an empty PDF next to the field without requesting a session", async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderUploadForm();
    const upload = screen.getByLabelText<HTMLInputElement>("Archivo");
    await user.upload(upload, new File(["contenido"], "norma.txt", { type: "text/plain" }));
    await user.click(screen.getByRole("button", { name: "Cargar PDF" }));
    expect(await screen.findByText(/PDF o DOCX o DOC o MD válido/)).toBeVisible();
    await waitFor(() => expect(upload).toHaveFocus());
    expect(upload).toHaveAttribute("aria-invalid", "true");

    await user.upload(upload, new File([], "vacio.pdf", { type: "application/pdf" }));
    await user.click(screen.getByRole("button", { name: "Cargar PDF" }));
    expect(await screen.findByText(/vacío/)).toBeVisible();
    expect(upload.files?.[0]?.name).toBe("vacio.pdf");
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("places a PDF inspection rejection next to the file and clears it when a different file is selected", async () => {
    const user = userEvent.setup();
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "verified-token" } }, error: null });
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ message: "PDF files cannot exceed 300 pages." }), { status: 400 }));
    renderUploadForm();
    const upload = screen.getByLabelText<HTMLInputElement>("Archivo");
    await user.upload(upload, new File(["%PDF-1.7"], "largo.pdf", { type: "application/pdf" }));
    await user.type(screen.getByLabelText("Título"), "Documento que debe conservarse");
    await user.click(screen.getByRole("button", { name: "Cargar PDF" }));
    expect(await screen.findByText("El PDF no puede superar las 300 páginas.")).toBeVisible();
    await waitFor(() => expect(upload).toHaveFocus());
    expect(upload).toHaveAttribute("aria-invalid", "true");
    expect(upload.files?.[0]?.name).toBe("largo.pdf");
    expect(screen.getByLabelText("Título")).toHaveValue("Documento que debe conservarse");
    expect(mocks.showToast).not.toHaveBeenCalled();
    await user.upload(upload, new File(["%PDF-1.7"], "corregido.pdf", { type: "application/pdf" }));
    expect(upload).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText("El PDF no puede superar las 300 páginas.")).not.toBeInTheDocument();
  });

  it("uses a general alert for a service failure and retains the full draft", async () => {
    const user = userEvent.setup();
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "verified-token" } }, error: null });
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 503 }));
    renderUploadForm();
    const upload = screen.getByLabelText<HTMLInputElement>("Archivo");
    await user.upload(upload, new File(["%PDF-1.7"], "norma.pdf", { type: "application/pdf" }));
    await user.type(screen.getByLabelText("Título"), "Documento pendiente");
    await user.click(screen.getByRole("button", { name: "Cargar PDF" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("tardó en responder");
    expect(upload).not.toHaveAttribute("aria-invalid", "true");
    expect(upload.files?.[0]?.name).toBe("norma.pdf");
    expect(screen.getByLabelText("Título")).toHaveValue("Documento pendiente");
    expect(mocks.showToast).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

});
