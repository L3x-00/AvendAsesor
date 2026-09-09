import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { ORIENTATION_FIELD_LIMITS, type OrientationContext } from "@/lib/orientation-document/model";
import { OrientationPreview } from "./orientation-preview";

const context: OrientationContext = {
  answer: "La solicitud se presenta por mesa de partes. [1]",
  answeredAt: "2026-08-24T12:01:00.000Z",
  conversationId: "4c8b56af-6d0c-4fef-881e-7c00907540dd",
  conversationTitle: "Licencia docente",
  messageId: "6c8b56af-6d0c-4fef-881e-7c00907540dd",
  question: "¿Cómo presento mi solicitud?",
  sources: [
    {
      articleReference: "Artículo 5",
      documentSituation: "current",
      documentTitle: "Ley de Reforma Magisterial",
      id: "9c8b56af-6d0c-4fef-881e-7c00907540dd",
      moduleName: "Licencias",
      numeralReference: "5.1",
      pageEnd: 33,
      pageStart: 33,
      rank: 1,
      relevanceScore: 0.92,
      sectionTitle: "Licencias por salud",
      versionNumber: 2,
    },
  ],
};

let downloadedNames: string[];

beforeEach(() => {
  downloadedNames = [];
  vi.stubGlobal("fetch", vi.fn());
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:orientation"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloadedNames.push(this.download);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("OrientationPreview", () => {
  it("shows trusted conversation content, disclaimer and complete source metadata", () => {
    render(
      <OrientationPreview context={context} initialTeacherName="María Pérez" />,
    );

    expect(
      screen.getByRole("heading", {
        name: "Ficha de orientación AVEND",
        level: 1,
      }),
    ).toBeVisible();
    expect(screen.getByText(context.question)).toBeVisible();
    expect(screen.getByText(context.answer)).toBeVisible();
    expect(screen.getByDisplayValue("María Pérez")).toBeVisible();
    expect(
      screen.getAllByText(/No constituye un acto administrativo/i),
    ).toHaveLength(2);
    expect(screen.getByText("Licencias por salud")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Volver a la conversación" }),
    ).toHaveAttribute("href", `/chat/${context.conversationId}`);
  });

  it("previews optional fields as text and never interprets them as HTML", () => {
    const { container } = render(
      <OrientationPreview context={context} initialTeacherName="María Pérez" />,
    );

    fireEvent.change(screen.getByLabelText("Nombre del docente"), {
      target: { value: "María Pérez" },
    });
    fireEvent.change(screen.getByLabelText("Institución educativa"), {
      target: { value: "IE 123" },
    });
    fireEvent.change(screen.getByLabelText("Título del caso"), {
      target: { value: "Caso personal" },
    });
    fireEvent.change(screen.getByLabelText("Notas del caso"), {
      target: { value: "<script>alert(1)</script>" },
    });

    expect(screen.getByText("María Pérez")).toBeVisible();
    expect(screen.getByText("IE 123")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Caso personal" }),
    ).toBeVisible();
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText("scriptalert(1)/script")).toBeVisible();
  });

  it("submits only optional presentation fields and downloads the returned DOCX", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(
      new Response(new Blob(["PK-binary"]), {
        headers: {
          "Content-Disposition":
            "attachment; filename=\"ficha.docx\"; filename*=UTF-8''Caso%20Mar%C3%ADa.docx",
        },
        status: 200,
      }),
    );
    render(
      <OrientationPreview context={context} initialTeacherName="María Pérez" />,
    );

    fireEvent.change(screen.getByLabelText("Nombre del docente"), {
      target: { value: "María Pérez" },
    });
    await user.click(screen.getByRole("button", { name: "Descargar DOCX" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const [url, options] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe(
      `/api/chat/conversations/${context.conversationId}/messages/${context.messageId}/orientacion/docx`,
    );
    expect(options).toMatchObject({
      credentials: "same-origin",
      method: "POST",
    });
    const formData = options?.body as FormData;
    expect(Object.fromEntries(formData.entries())).toEqual({
      caseNotes: "",
      caseTitle: "Licencia docente",
      institution: "",
      teacherName: "María Pérez",
    });
    expect(downloadedNames).toEqual(["Caso María.docx"]);
    expect(
      await screen.findByText("La descarga DOCX está lista."),
    ).toBeVisible();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:orientation");
  });

  it("honors removing the reused profile name in preview and export", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(
      new Response(new Blob(["%PDF"]), { status: 200 }),
    );
    render(
      <OrientationPreview context={context} initialTeacherName="María Pérez" />,
    );

    fireEvent.change(screen.getByLabelText("Nombre del docente"), {
      target: { value: "" },
    });
    expect(screen.queryByText("María Pérez")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Descargar PDF" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      `/api/chat/conversations/${context.conversationId}/messages/${context.messageId}/orientacion/pdf`,
    );
    const formData = vi.mocked(fetch).mock.calls[0]?.[1]?.body as FormData;
    expect(formData.get("teacherName")).toBe("");
  });

  it("identifies every oversized optional field and clears each error when corrected", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(new Response(new Blob(["PK-binary"]), { status: 200 }));
    render(<OrientationPreview context={context} initialTeacherName="María Pérez" />);
    const fields = [
      [screen.getByLabelText("Nombre del docente"), ORIENTATION_FIELD_LIMITS.teacherName],
      [screen.getByLabelText("Institución educativa"), ORIENTATION_FIELD_LIMITS.institution],
      [screen.getByLabelText("Título del caso"), ORIENTATION_FIELD_LIMITS.caseTitle],
      [screen.getByLabelText("Notas del caso"), ORIENTATION_FIELD_LIMITS.caseNotes],
    ] as const;
    for (const [field, max] of fields) {
      fireEvent.change(field, { target: { value: "a".repeat(max + 1) } });
    }

    await user.click(screen.getByRole("button", { name: "Descargar DOCX" }));

    expect(fetch).not.toHaveBeenCalled();
    for (const [field, max] of fields) {
      expect(field).toHaveAttribute("aria-invalid", "true");
      expect(field).toHaveAccessibleDescription(new RegExp(`no puede superar ${max} caracteres`));
      expect(field).toHaveValue("a".repeat(max + 1));
    }
    await waitFor(() => expect(fields[0][0]).toHaveFocus());
    for (const [field] of fields) {
      fireEvent.change(field, { target: { value: "" } });
      await waitFor(() => expect(field).not.toHaveAttribute("aria-invalid"));
    }
    expect(fields[3][0]).toHaveAccessibleDescription(/Evita incluir datos personales sensibles/);
    await user.click(screen.getByRole("button", { name: "Descargar DOCX" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  });

  it("announces success only after receiving the complete downloadable file", async () => {
    const user = userEvent.setup();
    let completeFile!: () => void;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        completeFile = () => {
          controller.enqueue(new TextEncoder().encode("%PDF"));
          controller.close();
        };
      },
    });
    vi.mocked(fetch).mockResolvedValue(new Response(body, { status: 200 }));
    const { container } = render(
      <ToastProvider>
        <OrientationPreview context={context} initialTeacherName="María Pérez" />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Descargar PDF" }));
    expect(fetch).toHaveBeenCalledOnce();
    expect(downloadedNames).toEqual([]);
    expect(screen.queryByText("La descarga PDF está lista.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preparando PDF…" })).toBeDisabled();

    completeFile();

    await waitFor(() => expect(downloadedNames).toEqual(["ficha-orientacion-avend.pdf"]));
    const toast = container.querySelector<HTMLElement>(".avend-toast--success")!;
    expect(toast).toBeVisible();
    expect(within(toast).getByText("La descarga PDF está lista.")).toBeVisible();
    const feedback = container.querySelector<HTMLElement>(".avend-feedback--success")!;
    expect(feedback).toHaveAttribute("role", "status");
    expect(feedback.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();
  });

  it("keeps visible busy feedback while a PDF is being prepared", async () => {
    const user = userEvent.setup();
    let finish!: (response: Response) => void;
    vi.mocked(fetch).mockImplementation(
      () => new Promise<Response>((resolve) => (finish = resolve)),
    );
    render(
      <OrientationPreview context={context} initialTeacherName="María Pérez" />,
    );

    await user.click(screen.getByRole("button", { name: "Descargar PDF" }));
    expect(
      screen.getByRole("button", { name: "Preparando PDF…" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Descargar DOCX" }),
    ).toBeDisabled();
    const form = screen.getByLabelText("Nombre del docente").closest("form")!;
    fireEvent.submit(form);
    expect(fetch).toHaveBeenCalledOnce();

    finish(new Response(new Blob(["%PDF"]), { status: 200 }));
    expect(
      await screen.findByText("La descarga PDF está lista."),
    ).toBeVisible();
    expect(downloadedNames).toEqual(["ficha-orientacion-avend.pdf"]);
  });

  it.each([
    [401, "Tu sesión expiró. Inicia sesión nuevamente."],
    [403, "No tienes permiso para generar esta ficha."],
    [404, /Esta orientación ya no está disponible/i],
    [400, /Revisa la longitud y el contenido/i],
    [500, /No fue posible preparar el archivo/i],
  ])("shows a recoverable message for HTTP %i", async (status, message) => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status }));
    render(
      <OrientationPreview context={context} initialTeacherName="María Pérez" />,
    );

    await user.click(screen.getByRole("button", { name: "Descargar PDF" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("alert")).toHaveClass("avend-feedback--error");
    expect(screen.getByLabelText("Nombre del docente")).toHaveValue("María Pérez");
    expect(screen.getByLabelText("Título del caso")).toHaveValue("Licencia docente");
    expect(screen.getByRole("button", { name: "Descargar PDF" })).toBeEnabled();
    expect(downloadedNames).toEqual([]);
  });

  it("reports a transport interruption without exposing exception details", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockRejectedValue(new Error("secret transport detail"));
    render(
      <OrientationPreview context={context} initialTeacherName="María Pérez" />,
    );

    await user.click(screen.getByRole("button", { name: "Descargar DOCX" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Se interrumpió la descarga/i);
    expect(alert).not.toHaveTextContent("secret transport detail");
  });
});
