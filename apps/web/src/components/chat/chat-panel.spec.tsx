import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatPanel } from "./chat-panel";

const chatModule = {
  code: "LICENSES",
  id: "4c8b56af-6d0c-4fef-881e-7c00907540dd",
  name: "Licencias",
  parentModuleId: null,
  sortOrder: 0,
};

const childModule = {
  code: "LICENSES-A",
  id: "7c8b56af-6d0c-4fef-881e-7c00907540dd",
  name: "Licencia por salud",
  parentModuleId: chatModule.id,
  sortOrder: 0,
};

const conversationId = "5c8b56af-6d0c-4fef-881e-7c00907540dd";
const messageId = "6c8b56af-6d0c-4fef-881e-7c00907540dd";

function streamResponse(frames: string[]) {
  return new Response(frames.join(""), { status: 200 });
}

async function submitQuestion(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByRole("textbox", { name: "Escribe tu consulta" }),
    "¿Cómo solicito una licencia?",
  );
  await user.click(screen.getByRole("button", { name: "Enviar consulta" }));
}

afterEach(() => vi.unstubAllGlobals());

describe("ChatPanel", () => {
  it("muestra los submódulos del módulo activo en la zona principal y permite quitar el subtema", async () => {
    const user = userEvent.setup();
    render(
      <ChatPanel
        initialModuleId={chatModule.id}
        modules={[chatModule, childModule]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Licencias" })).toBeVisible();
    expect(screen.queryByText("LICENSES")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /licencia por salud/i }),
    );
    expect(screen.getByText("Tema: Licencia por salud")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Quitar tema" }));
    expect(
      screen.queryByText("Tema: Licencia por salud"),
    ).not.toBeInTheDocument();
  });

  it("renders streamed text and references only after receiving SSE events", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("crypto", { randomUUID: () => "local-id" });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            [
              'event: conversation\ndata: {"conversationId":"5c8b56af-6d0c-4fef-881e-7c00907540dd"}\n\n',
              'event: sources\ndata: {"sources":[{"rank":1,"documentTitle":"Norma de licencias","moduleName":"Licencias","versionNumber":1,"pageStart":1,"pageEnd":1,"sectionTitle":"Artículo 5","articleReference":"Artículo 5","numeralReference":null,"relevanceScore":0.91}]}\n\n',
              'event: token\ndata: {"text":"Respuesta sustentada. [1]"}\n\n',
              'event: done\ndata: {"conversationId":"5c8b56af-6d0c-4fef-881e-7c00907540dd","messageId":"6c8b56af-6d0c-4fef-881e-7c00907540dd","provider":"openai"}\n\n',
            ].join(""),
            { status: 200 },
          ),
      ),
    );
    render(<ChatPanel modules={[chatModule]} />);

    await submitQuestion(user);

    await waitFor(() => {
      expect(screen.getByText("Respuesta sustentada. [1]")).toBeVisible();
    });
    expect(screen.getByText("Norma de licencias")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Referencias" })).toBeVisible();
  });

  it("keeps the empty module state explicit instead of inventing a category", () => {
    render(<ChatPanel modules={[]} />);

    expect(
      screen.getByText(/Aún no hay módulos activos para filtrar/i),
    ).toBeVisible();
    expect(
      screen.getByText(/Escribe una consulta para recibir/i),
    ).toBeVisible();
  });

  it.each([
    [401, "Tu sesión expiró. Inicia sesión nuevamente."],
    [403, "No tienes permiso para realizar esta consulta."],
    [429, "Alcanzaste el límite de consultas. Espera un minuto."],
    [503, "El servicio de consulta no está disponible por el momento."],
    [500, "No fue posible procesar la consulta. Inténtalo nuevamente."],
  ])("shows a safe request error for HTTP %i", async (status, message) => {
    const user = userEvent.setup();
    vi.stubGlobal("crypto", { randomUUID: () => "local-id" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status })),
    );
    render(<ChatPanel modules={[chatModule]} />);

    await submitQuestion(user);

    expect(await screen.findByText(message)).toBeVisible();
  });

  it("does not retain a partial reply if the stream emits a controlled error", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("crypto", { randomUUID: () => "local-id" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        streamResponse([
          `event: conversation\ndata: {"conversationId":"${conversationId}"}\n\n`,
          'event: token\ndata: {"text":"Texto parcial"}\n\n',
          'event: error\ndata: {"code":"CHAT_STREAM_FAILED"}\n\n',
        ]),
      ),
    );
    render(<ChatPanel modules={[chatModule]} />);

    await submitQuestion(user);

    expect(
      await screen.findByText(
        "No se pudo completar la respuesta. No se guardó contenido parcial.",
      ),
    ).toBeVisible();
    expect(screen.queryByText("Texto parcial")).not.toBeInTheDocument();
  });

  it("does not retain a partial reply when the stream closes without a done event", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("crypto", { randomUUID: () => "local-id" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        streamResponse([
          `event: conversation\ndata: {"conversationId":"${conversationId}"}\n\n`,
          'event: token\ndata: {"text":"Texto parcial"}\n\n',
        ]),
      ),
    );
    render(<ChatPanel modules={[chatModule]} />);

    await submitQuestion(user);

    expect(
      await screen.findByText(
        "Se interrumpió la conexión. No se guardó contenido parcial.",
      ),
    ).toBeVisible();
    expect(screen.queryByText("Texto parcial")).not.toBeInTheDocument();
  });

  it("renders a persisted clarification and lets the user choose its module", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("crypto", { randomUUID: () => "local-id" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        streamResponse([
          `event: conversation\ndata: {"conversationId":"${conversationId}"}\n\n`,
          `event: clarification\ndata: {"message":"Precisa el tema.","modules":[${JSON.stringify(chatModule)}]}\n\n`,
          `event: done\ndata: {"conversationId":"${conversationId}","messageId":"${messageId}","provider":"rule"}\n\n`,
        ]),
      ),
    );
    render(<ChatPanel modules={[chatModule]} />);

    await submitQuestion(user);
    expect(await screen.findByText("Precisa el tema.")).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Consultar Licencias" }),
    );
    expect(screen.getByRole("heading", { name: "Licencias" })).toBeVisible();
  });

  it("renders the persisted no-evidence outcome without a fabricated source", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("crypto", { randomUUID: () => "local-id" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        streamResponse([
          `event: conversation\ndata: {"conversationId":"${conversationId}"}\n\n`,
          'event: no_evidence\ndata: {"message":"No hay sustento suficiente."}\n\n',
          `event: done\ndata: {"conversationId":"${conversationId}","messageId":"${messageId}","provider":"rule"}\n\n`,
        ]),
      ),
    );
    render(<ChatPanel modules={[chatModule]} />);

    await submitQuestion(user);

    expect(
      await screen.findByText("No hay sustento suficiente."),
    ).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Referencias" })).toBeNull();
  });

  it.each([
    [
      "event: conversation\ndata: {}\n\n",
      "La conversación recibida no tiene un formato válido.",
    ],
    [
      `event: conversation\ndata: {"conversationId":"${conversationId}"}\n\nevent: sources\ndata: {"sources":[{}]}\n\n`,
      "Las referencias recibidas no tienen un formato válido.",
    ],
    [
      `event: conversation\ndata: {"conversationId":"${conversationId}"}\n\nevent: token\ndata: {"text":""}\n\n`,
      "La respuesta recibida no tiene un formato válido.",
    ],
    [
      `event: conversation\ndata: {"conversationId":"${conversationId}"}\n\nevent: done\ndata: {}\n\n`,
      "El cierre de la respuesta no tiene un formato válido.",
    ],
  ])("rejects malformed %s SSE payloads", async (frame, message) => {
    const user = userEvent.setup();
    vi.stubGlobal("crypto", { randomUUID: () => "local-id" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => streamResponse([frame])),
    );
    render(<ChatPanel modules={[chatModule]} />);

    await submitQuestion(user);

    expect(await screen.findByText(message)).toBeVisible();
  });

  it("treats invalid stream JSON and transport failures as non-persistent failures", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("crypto", { randomUUID: () => "local-id" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => streamResponse(["event: token\ndata: not-json\n\n"])),
    );
    const { unmount } = render(<ChatPanel modules={[chatModule]} />);

    await submitQuestion(user);
    expect(
      await screen.findByText(
        "La respuesta recibida no tiene un formato válido.",
      ),
    ).toBeVisible();
    unmount();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("offline"))),
    );
    render(<ChatPanel modules={[chatModule]} />);
    await submitQuestion(user);
    expect(
      await screen.findByText(
        "Se interrumpió la conexión. No se guardó contenido parcial.",
      ),
    ).toBeVisible();
  });
});
