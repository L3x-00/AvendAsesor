import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModuleOverviewCard } from "./module-overview";

const moduleId = "11111111-1111-4111-8111-111111111111";
const longTitle =
  "Aprueban Padrones de Instituciones Educativas Públicas y de Docentes Bilingües, para la percepción de asignaciones temporales";

function overview(overrides: Record<string, unknown> = {}) {
  return {
    documents: [
      {
        documentType: "RESOLUCION_MINISTERIAL",
        id: "33333333-3333-4333-8333-333333333333",
        issuanceYear: 2026,
        resolutionNumber: null,
        summary: "Aprueba los padrones para percibir asignaciones.",
        title: longTitle,
      },
    ],
    moduleId,
    moduleName: "Remuneraciones",
    scope: "module",
    scopeName: "Remuneraciones",
    total: 1,
    ...overrides,
  };
}

function respondWith(body: unknown, status = 200) {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        headers: { "Content-Type": "application/json" },
        status,
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ModuleOverviewCard", () => {
  it("pliega el resumen al terminar y permite abrirlo para dejar lista una pregunta", async () => {
    const user = userEvent.setup();
    const fetchMock = respondWith(overview());
    const onAsk = vi.fn();
    render(<ModuleOverviewCard moduleId={moduleId} onAsk={onAsk} />);

    expect(
      screen.getByText("Preparando un resumen de los documentos…"),
    ).toBeVisible();
    expect(await screen.findByText("Resumen listo · 1 documento")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/chat/modules/${moduleId}/overview`,
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
    expect(screen.getByText(longTitle).closest("[aria-hidden]"))
      .toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("Resolución Ministerial · 2026")).toBeInTheDocument();
    expect(
      screen.getByText("Aprueba los padrones para percibir asignaciones."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Resumen orientativo generado con IA/),
    ).toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: "Ver resumen" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(longTitle)).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: /Preguntar sobre este documento/ }),
    );
    expect(onAsk).toHaveBeenCalledWith(
      "¿Qué establece «Aprueban Padrones de Instituciones Educativas Públicas y de Docentes…»?",
    );
  });

  it("si el subtema no tiene documentos, lo dice y muestra los del tema principal", async () => {
    respondWith(
      overview({
        documents: [
          {
            documentType: "OTRO_TIPO",
            id: "33333333-3333-4333-8333-333333333333",
            issuanceYear: null,
            resolutionNumber: null,
            summary: null,
            title: "Ley corta.",
          },
        ],
        moduleName: "Escala remunerativa",
        scope: "parent",
      }),
    );
    render(<ModuleOverviewCard moduleId={moduleId} onAsk={vi.fn()} />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Ver resumen" }),
    );

    expect(
      screen.getByText(
        "Estos son los documentos disponibles sobre «Remuneraciones»:",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/Resumen orientativo/)).not.toBeInTheDocument();
  });

  it("sin documentos invita a consultar igual", async () => {
    respondWith(overview({ documents: [], scope: "empty", total: 0 }));
    render(<ModuleOverviewCard moduleId={moduleId} onAsk={vi.fn()} />);

    expect(
      await screen.findByText(
        /Estoy listo para orientarte con este tema/,
      ),
    ).toBeVisible();
  });

  it("avisa si hay más documentos que los listados", async () => {
    respondWith(overview({ total: 12 }));
    render(<ModuleOverviewCard moduleId={moduleId} onAsk={vi.fn()} />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Ver resumen" }),
    );

    expect(
      screen.getByText(/Y 11 documentos más en este tema/),
    ).toBeVisible();
  });

  it("si el panorama no está disponible, no muestra nada", async () => {
    respondWith({ error: "OVERVIEW_UNAVAILABLE" }, 502);
    const { container } = render(
      <ModuleOverviewCard moduleId={moduleId} onAsk={vi.fn()} />,
    );

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("descarta una respuesta con formato inesperado", async () => {
    respondWith({ documents: "no" });
    const { container } = render(
      <ModuleOverviewCard moduleId={moduleId} onAsk={vi.fn()} />,
    );

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("al desmontarse cancela la consulta sin mostrar error", () => {
    const fetchMock = vi.fn(() => new Promise<Response>(() => undefined));
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = render(
      <ModuleOverviewCard moduleId={moduleId} onAsk={vi.fn()} />,
    );

    unmount();
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit;
    expect(init.signal?.aborted).toBe(true);
  });
});
