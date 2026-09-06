import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsultationFeedback } from "./consultation-feedback";

const answerMessageId = "19000000-0000-4000-8000-000000000001";
const conversationId = "19000000-0000-4000-8000-000000000002";

describe("ConsultationFeedback", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.restoreAllMocks());

  it("sends only the canonical answer id with a report and confirms success", async () => {
    const user = userEvent.setup();
    const request = vi.fn(async () => new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", request);
    render(
      <ConsultationFeedback
        answerMessageId={answerMessageId}
        conversationId={conversationId}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Reportar" }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Motivo del reporte" }),
      "citation_does_not_support",
    );
    await user.type(
      screen.getByRole("textbox", { name: /Cuéntanos qué ocurrió/ }),
      "La cita no coincide con la afirmación.",
    );
    await user.click(screen.getByRole("button", { name: "Enviar reporte" }));

    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    const [, options] = request.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const payload = options.body as FormData;
    expect(payload.get("answerMessageId")).toBe(answerMessageId);
    expect(payload.get("reason")).toBe("citation_does_not_support");
    expect(payload.get("conversationId")).toBeNull();
    expect(payload.get("submissionId")).toMatch(
      /^[0-9a-f-]{36}$/iu,
    );
    expect(
      await screen.findByText("Gracias. Tu reporte fue enviado para revisión."),
    ).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("retains report input after a failed submission and supports Escape/focus restore", async () => {
    const user = userEvent.setup();
    const request = vi.fn(async () => new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", request);
    render(<ConsultationFeedback answerMessageId={answerMessageId} />);

    const opener = screen.getByRole("button", { name: "Reportar" });
    await user.click(opener);
    const comment = screen.getByRole("textbox", { name: /Cuéntanos qué ocurrió/ });
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Motivo del reporte" }),
      "other",
    );
    await user.type(comment, "Necesita una revisión humana.");
    await user.click(screen.getByRole("button", { name: "Enviar reporte" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo guardar el comentario por el momento.",
    );
    expect(comment).toHaveValue("Necesita una revisión humana.");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("submits a suggestion with the current conversation and its optional document", async () => {
    const user = userEvent.setup();
    const request = vi.fn(async () => new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", request);
    render(<ConsultationFeedback conversationId={conversationId} />);

    await user.click(screen.getByRole("button", { name: "Sugerencia" }));
    await user.type(
      screen.getByRole("textbox", { name: "Sugerencia" }),
      "Comparto una norma publicada esta semana.",
    );
    const upload = screen.getByLabelText(/Adjuntar archivo/) as HTMLInputElement;
    await user.upload(
      upload,
      new File(["%PDF-1.7"], "norma.pdf", { type: "application/pdf" }),
    );
    expect(upload.files?.[0]?.name).toBe("norma.pdf");
    await user.click(screen.getByRole("button", { name: "Enviar sugerencia" }));

    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    const [, options] = request.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const payload = options.body as FormData;
    expect(payload.get("conversationId")).toBe(conversationId);
    expect(
      await screen.findByText(
        "Gracias por tu sugerencia. La tendremos en cuenta para seguir mejorando AVEND ASESOR.",
      ),
    ).toBeVisible();
  });

  it("keeps reporting unavailable until a canonical response exists", () => {
    render(<ConsultationFeedback disabled />);

    expect(screen.getByRole("button", { name: "Reportar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Sugerencia" })).toBeDisabled();
    expect(
      screen.getByText("Podrás reportar cuando recibas una respuesta del asistente."),
    ).toBeVisible();
  });
});
