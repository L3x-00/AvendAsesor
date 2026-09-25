import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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

const secondChildModule = {
  code: "LICENSES-B",
  id: "ac8b56af-6d0c-4fef-881e-7c00907540dd",
  name: "Licencia por estudios",
  parentModuleId: chatModule.id,
  sortOrder: 1,
};

const secondModule = {
  code: "TEACHER-EVALUATION",
  id: "8c8b56af-6d0c-4fef-881e-7c00907540dd",
  name: "Evaluación docente",
  parentModuleId: null,
  sortOrder: 1,
};

const conversationId = "5c8b56af-6d0c-4fef-881e-7c00907540dd";
const newConversationId = "6d8b56af-6d0c-4fef-881e-7c00907540dd";
const messageId = "6c8b56af-6d0c-4fef-881e-7c00907540dd";
const questionMessageId = "bc8b56af-6d0c-4fef-881e-7c00907540dd";
const sourceId = "9c8b56af-6d0c-4fef-881e-7c00907540dd";
const initialConversation = {
  conversation: {
    createdAt: "2026-08-24T12:00:00.000Z",
    id: conversationId,
    selectedModuleId: chatModule.id,
    title: "Consulta inicial",
    updatedAt: "2026-08-24T12:00:00.000Z",
  },
  messages: [],
};

const eligibleConversation = {
  ...initialConversation,
  messages: [
    {
      content: "¿Qué requisitos corresponden?",
      createdAt: "2026-08-24T12:00:00.000Z",
      id: questionMessageId,
      inReplyToMessageId: null,
      role: "user" as const,
      sources: [],
    },
    {
      content: "Respuesta respaldada. [1]",
      createdAt: "2026-08-24T12:01:00.000Z",
      id: messageId,
      inReplyToMessageId: questionMessageId,
      role: "assistant" as const,
      sources: [
        {
          articleReference: "Artículo 5",
          documentSituation: "current" as const,
          documentTitle: "Norma de licencias",
          id: sourceId,
          moduleName: "Licencias",
          numeralReference: null,
          pageEnd: 1,
          pageStart: 1,
          rank: 1,
          relevanceScore: 0.91,
          sectionTitle: "Requisitos",
          versionNumber: 1,
        },
      ],
    },
  ],
};

function streamResponse(frames: string[]) {
  return new Response(frames.join(""), { status: 200 });
}

function conversationEvent(): string {
  return `event: conversation\ndata: {"conversationId":"${conversationId}","userMessageId":"${questionMessageId}"}\n\n`;
}

function doneEvent(provider: "openai" | "rule"): string {
  return `event: done\ndata: {"conversationId":"${conversationId}","inReplyToMessageId":"${questionMessageId}","messageId":"${messageId}","provider":"${provider}"}\n\n`;
}

async function submitQuestion(user: ReturnType<typeof userEvent.setup>) {
  fireEvent.change(
    screen.getByRole("textbox", { name: "Escribe tu consulta" }),
    { target: { value: "¿Cómo solicito una licencia?" } },
  );
  await user.click(screen.getByRole("button", { name: "Enviar consulta" }));
}

function requestBody(
  call: [input: RequestInfo | URL, init?: RequestInit] | undefined,
) {
  const body = call?.[1]?.body;
  if (typeof body !== "string") {
    throw new Error("La solicitud de chat no contiene un cuerpo JSON.");
  }
  return JSON.parse(body);
}

afterEach(() => vi.unstubAllGlobals());

describe("ChatPanel", () => {
  it("offers the orientation sheet only for a completed sourced assistant message", () => {
    render(
      <ChatPanel
        initialConversation={eligibleConversation}
        modules={[chatModule]}
      />,
    );

    const action = screen.getByRole("link", {
      name: "Preparar ficha de orientación",
    });
    expect(action).toHaveAttribute(
      "href",
      `/chat/${conversationId}/orientacion/${messageId}`,
    );
    expect(action).toHaveAttribute("target", "_blank");
  });

  it("does not offer a document for a source-less assistant outcome", () => {
    render(
      <ChatPanel
        initialConversation={{
          ...eligibleConversation,
          messages: [
            eligibleConversation.messages[0],
            { ...eligibleConversation.messages[1], sources: [] },
          ],
        }}
        modules={[chatModule]}
      />,
    );

    expect(
      screen.queryByRole("link", { name: "Preparar ficha de orientación" }),
    ).not.toBeInTheDocument();
  });

  it("does not offer a document when its question is outside visible history", () => {
    render(
      <ChatPanel
        initialConversation={{
          ...eligibleConversation,
          messages: [
            {
              ...eligibleConversation.messages[0],
              id: "ac8b56af-6d0c-4fef-881e-7c00907540dd",
            },
            eligibleConversation.messages[1],
          ],
        }}
        modules={[chatModule]}
      />,
    );

    expect(
      screen.queryByRole("link", { name: "Preparar ficha de orientación" }),
    ).not.toBeInTheDocument();
  });

  it("renders paragraphs, emphasis and lists with semantic structure", () => {
    const { container } = render(
      <ChatPanel
        initialConversation={{
          ...eligibleConversation,
          messages: [
            eligibleConversation.messages[0],
            {
              ...eligibleConversation.messages[1],
              content:
                "**Requisitos principales**\n\n- Solicitud firmada\n- Certificado médico\n\n1. Presenta los documentos\n2. Conserva el cargo",
            },
          ],
        }}
        modules={[chatModule]}
      />,
    );
    const answer = container.querySelector(".avend-chat-message--assistant");

    expect(answer).not.toBeNull();
    expect(
      within(answer as HTMLElement).getByText("Requisitos principales").tagName,
    ).toBe("STRONG");
    expect(within(answer as HTMLElement).getAllByRole("list")).toHaveLength(2);
    expect(answer?.querySelectorAll(".avend-chat-paragraph")).toHaveLength(1);
  });

  it("dicta, detiene y comunica errores de voz cuando el navegador lo soporta", async () => {
    const user = userEvent.setup();
    const instances: SpeechRecognitionMock[] = [];

    class SpeechRecognitionMock {
      continuous = false;
      interimResults = false;
      lang = "";
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onresult:
        | ((event: {
            resultIndex: number;
            results: ArrayLike<{
              0: { transcript: string };
              isFinal: boolean;
            }>;
          }) => void)
        | null = null;
      start = vi.fn();
      stop = vi.fn();

      constructor() {
        instances.push(this);
      }
    }

    vi.stubGlobal("SpeechRecognition", SpeechRecognitionMock);

    render(<ChatPanel modules={[chatModule]} />);

    await user.click(
      await screen.findByRole("button", {
        name: "Dictar la consulta por voz",
      }),
    );
    expect(instances[0].start).toHaveBeenCalledOnce();
    expect(instances[0]).toMatchObject({
      continuous: false,
      interimResults: false,
      lang: "es-PE",
    });
    expect(
      screen.getByRole("button", { name: "Detener el dictado por voz" }),
    ).toBeVisible();

    act(() => {
      instances[0].onresult?.({
        resultIndex: 0,
        results: [{ 0: { transcript: "licencia médica" }, isFinal: true }],
      });
      instances[0].onend?.();
    });
    expect(
      screen.getByRole("textbox", { name: "Escribe tu consulta" }),
    ).toHaveValue("licencia médica");
    expect(
      screen.getByText(
        "Dictado finalizado. Revisa el texto antes de enviarlo.",
      ),
    ).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Dictar la consulta por voz" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Detener el dictado por voz" }),
    );
    expect(instances[1].stop).toHaveBeenCalledOnce();
    expect(
      screen.getByText("Dictado detenido. Revisa el texto antes de enviarlo."),
    ).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Dictar la consulta por voz" }),
    );
    act(() => instances[2].onerror?.());
    expect(
      screen.getByText(
        "No se pudo usar el micrófono. Escribe tu consulta o revisa el permiso del navegador.",
      ),
    ).toBeVisible();
  });

  it("recupera el control si el navegador rechaza iniciar el dictado", async () => {
    const user = userEvent.setup();

    class SpeechRecognitionStartErrorMock {
      continuous = false;
      interimResults = false;
      lang = "";
      onend = null;
      onerror = null;
      onresult = null;

      start() {
        throw new Error("permission denied");
      }

      stop() {}
    }

    vi.stubGlobal("SpeechRecognition", SpeechRecognitionStartErrorMock);
    render(<ChatPanel modules={[chatModule]} />);

    await user.click(
      await screen.findByRole("button", {
        name: "Dictar la consulta por voz",
      }),
    );

    expect(
      screen.getByText(
        "No se pudo iniciar el micrófono. Escribe tu consulta o revisa el permiso del navegador.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Dictar la consulta por voz" }),
    ).toBeEnabled();
  });

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
    expect(screen.getByRole("status")).toHaveTextContent(
      "Tema: Licencia por salud",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Quitar el tema Licencia por salud",
      }),
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("restarts the workspace transition between sibling submodules", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ChatPanel
        initialModuleId={childModule.id}
        modules={[chatModule, childModule, secondChildModule]}
      />,
    );
    const initialWorkspace = container.querySelector(
      ".avend-chat-workspace-transition",
    );

    expect(initialWorkspace).not.toBeNull();
    await user.click(
      screen.getByRole("button", { name: /licencia por estudios/i }),
    );

    await waitFor(() =>
      expect(
        container.querySelector(".avend-chat-workspace-transition"),
      ).not.toBe(initialWorkspace),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Tema: Licencia por estudios",
    );
    expect(
      screen.getByRole("textbox", { name: "Escribe tu consulta" }),
    ).toHaveFocus();
  });

  it("cambia de módulo raíz de forma local sin una nueva navegación de servidor", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/chat?module=previous");
    render(
      <ChatPanel
        initialModuleId={chatModule.id}
        modules={[chatModule, secondModule]}
      />,
    );

    await user.click(
      screen.getAllByRole("button", { name: "Evaluación docente" })[0],
    );

    expect(
      screen.getByRole("heading", { name: "Evaluación docente" }),
    ).toBeVisible();
    expect(window.location.pathname).toBe("/chat");
    expect(window.location.search).toBe(`?module=${secondModule.id}`);
    expect(
      screen.getByText("Tema actualizado: Evaluación docente."),
    ).toBeVisible();
  });

  it("reinicia la conversación al cambiar o quitar el subtema", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (...args: Parameters<typeof fetch>) => {
      void args;
      return streamResponse([conversationEvent(), doneEvent("rule")]);
    });
    vi.stubGlobal("crypto", { randomUUID: () => "local-id" });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <ChatPanel
        initialConversation={initialConversation}
        modules={[chatModule, childModule]}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /licencia por salud/i }),
    );
    await submitQuestion(user);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(requestBody(fetchMock.mock.calls[0])).toEqual({
      moduleId: childModule.id,
      question: "¿Cómo solicito una licencia?",
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "Quitar el tema Licencia por salud",
        }),
      ).toBeEnabled(),
    );

    await user.click(
      screen.getByRole("button", {
        name: "Quitar el tema Licencia por salud",
      }),
    );
    await submitQuestion(user);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(requestBody(fetchMock.mock.calls[1])).toEqual({
      moduleId: chatModule.id,
      question: "¿Cómo solicito una licencia?",
    });
  }, 10_000);

  it("renders streamed text and references only after receiving SSE events", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("crypto", { randomUUID: () => "local-id" });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            [
              conversationEvent(),
              'event: sources\ndata: {"sources":[{"id":"9c8b56af-6d0c-4fef-881e-7c00907540dd","rank":1,"documentSituation":"current","documentTitle":"Norma de licencias","moduleName":"Licencias","versionNumber":1,"pageStart":1,"pageEnd":1,"sectionTitle":"Artículo 5","articleReference":"Artículo 5","numeralReference":null,"relevanceScore":0.91}]}\n\n',
              'event: token\ndata: {"text":"Respuesta sustentada. [1]"}\n\n',
              doneEvent("openai"),
            ].join(""),
            { status: 200 },
          ),
      ),
    );
    render(<ChatPanel modules={[chatModule]} />);

    await submitQuestion(user);

    await waitFor(() => {
      expect(
        screen.getByText(
          (_, element) =>
            element?.tagName === "P" &&
            element.textContent === "Respuesta sustentada. [1]",
        ),
      ).toBeVisible();
    });
    expect(await screen.findByText("Respuesta lista.")).toBeVisible();
    // La cita [1] enlaza con su fila en Referencias (punto 8).
    expect(
      screen.getByRole("link", { name: "Ver fuente 1: Norma de licencias" }),
    ).toHaveAttribute("href", `#fuente-${messageId}-1`);
    expect(screen.getByText("Norma de licencias")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Referencias" })).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Preparar ficha de orientación" }),
    ).toHaveAttribute(
      "href",
      `/chat/${conversationId}/orientacion/${messageId}`,
    );
  });

  it("keeps the empty module state explicit instead of inventing a category", () => {
    render(<ChatPanel modules={[]} />);

    expect(
      screen.getByText(/Aún no hay módulos activos para filtrar/i),
    ).toBeVisible();
    expect(
      screen.getByText(/Escribe una consulta para recibir/i),
    ).toBeVisible();
    expect(
      screen.queryByText(/Selecciona el tema relacionado/i),
    ).not.toBeInTheDocument();
  });

  it("shows the approved guidance only before an available subtopic group", () => {
    const { rerender } = render(
      <ChatPanel initialModuleId={chatModule.id} modules={[chatModule]} />,
    );

    expect(
      screen.queryByText(/Selecciona el tema relacionado/i),
    ).not.toBeInTheDocument();

    rerender(
      <ChatPanel
        initialModuleId={chatModule.id}
        modules={[chatModule, childModule]}
      />,
    );
    expect(screen.getByText(/Selecciona el tema relacionado/i)).toBeVisible();
  });

  it("enables source links only after the sourced answer is persisted", async () => {
    const user = userEvent.setup();
    const encoder = new TextEncoder();
    let finishStream!: () => void;
    const responseStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            [
              conversationEvent(),
              `event: sources\ndata: {"sources":[{"id":"${sourceId}","rank":1,"documentSituation":"current","documentTitle":"Norma de licencias","moduleName":"Licencias","versionNumber":1,"pageStart":1,"pageEnd":1,"sectionTitle":"Artículo 5","articleReference":"Artículo 5","numeralReference":null,"relevanceScore":0.91}]}\n\n`,
              'event: token\ndata: {"text":"Respuesta en curso. [1]"}\n\n',
            ].join(""),
          ),
        );
        finishStream = () => {
          controller.enqueue(encoder.encode(doneEvent("openai")));
          controller.close();
        };
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(responseStream)),
    );
    render(<ChatPanel modules={[chatModule]} />);

    await submitQuestion(user);
    expect(await screen.findByText("Respuesta en curso. [1]")).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Referencias" }),
    ).not.toBeInTheDocument();

    act(() => finishStream());
    expect(
      await screen.findByRole("heading", { name: "Referencias" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", {
        name: /Abrir fuente \[1\]: Norma de licencias/,
      }),
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
    expect(screen.getByRole("alert")).toHaveClass("avend-chat-error");
    expect(
      screen.getByRole("textbox", { name: "Escribe tu consulta" }),
    ).toHaveValue("¿Cómo solicito una licencia?");
    expect(
      document.querySelector(".avend-chat-message--user"),
    ).not.toBeInTheDocument();
  });

  it("does not retain a partial reply if the stream emits a controlled error", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("crypto", { randomUUID: () => "local-id" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        streamResponse([
          conversationEvent(),
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
    expect(document.querySelectorAll(".avend-chat-message--user")).toHaveLength(
      1,
    );
    expect(screen.queryByText("Texto parcial")).not.toBeInTheDocument();
  });

  it("does not retain a partial reply when the stream closes without a done event", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("crypto", { randomUUID: () => "local-id" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        streamResponse([
          conversationEvent(),
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

  it("shows Markdown headings as plain emphasized text and flags an unanswered saved question", () => {
    render(
      <ChatPanel
        initialConversation={{
          ...initialConversation,
          messages: [
            {
              ...eligibleConversation.messages[0],
              id: "cc8b56af-6d0c-4fef-881e-7c00907540dd",
            },
            eligibleConversation.messages[0],
            {
              ...eligibleConversation.messages[1],
              content:
                "### Misión del cargo\nGestionar los aprendizajes. [[1]]",
            },
          ],
        }}
        modules={[chatModule]}
      />,
    );

    expect(screen.getByText("Misión del cargo")).toBeVisible();
    // La cita [1] del texto guardado enlaza con su fuente.
    expect(
      screen.getByRole("link", { name: "Ver fuente 1: Norma de licencias" }),
    ).toBeVisible();
    expect(screen.queryByText(/###/u)).not.toBeInTheDocument();
    // La primera pregunta quedó guardada sin respuesta: se avisa para reenviarla.
    expect(
      screen.getByText(/Esta consulta no se completó por un problema técnico/u),
    ).toBeVisible();
  });

  it("renders the clarification the API really sends ({id, name}) and re-sends the question for the chosen module", async () => {
    // Contrato real de la API: los módulos de la aclaración llegan como
    // { id, name }. El fixture anterior usaba el ChatModule completo y ocultaba
    // que la web descartaba TODA aclaración como «formato no válido».
    const user = userEvent.setup();
    vi.stubGlobal("crypto", { randomUUID: () => "local-id" });
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () =>
        streamResponse([
          conversationEvent(),
          `event: clarification\ndata: {"message":"Precisa el tema.","modules":[{"id":"${chatModule.id}","name":"${chatModule.name}"}]}\n\n`,
          doneEvent("rule"),
        ]),
      )
      .mockImplementationOnce(async () =>
        streamResponse([
          conversationEvent(),
          'event: no_evidence\ndata: {"message":"No hay sustento suficiente."}\n\n',
          doneEvent("rule"),
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<ChatPanel modules={[chatModule]} />);

    await submitQuestion(user);
    expect(await screen.findByText("Precisa el tema.")).toBeVisible();
    expect(
      screen.getByText("Se necesita una aclaración para continuar."),
    ).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Consultar Licencias" }),
    );

    // La pregunta original se reenvía sola, en una conversación nueva del tema
    // elegido: el docente no tiene que reescribirla.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(
      requestBody(fetchMock.mock.calls[1] as [RequestInfo, RequestInit]),
    ).toEqual({
      moduleId: chatModule.id,
      question: "¿Cómo solicito una licencia?",
    });
    expect(
      await screen.findByText("No hay sustento suficiente."),
    ).toBeVisible();
  });

  it("replaces text already shown when the turn closes as no evidence", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("crypto", { randomUUID: () => "local-id" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        streamResponse([
          conversationEvent(),
          'event: sources\ndata: {"sources":[]}\n\n',
          'event: token\ndata: {"text":"Las fuentes no mencionan el plazo."}\n\n',
          'event: no_evidence\ndata: {"message":"No encontré sustento suficiente."}\n\n',
          doneEvent("rule"),
        ]),
      ),
    );
    render(<ChatPanel modules={[chatModule]} />);

    await submitQuestion(user);

    expect(
      await screen.findByText("No encontré sustento suficiente."),
    ).toBeVisible();
    expect(
      screen.queryByText("Las fuentes no mencionan el plazo."),
    ).not.toBeInTheDocument();
  });

  it("starts a new conversation after «Otra consulta» announces a new topic", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("crypto", { randomUUID: () => "local-id" });
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () =>
        streamResponse([
          'event: conversational\ndata: {"message":"¡Claro! Cuéntame tu consulta.","startsNewTopic":true}\n\n',
        ]),
      )
      .mockImplementationOnce(async () =>
        streamResponse([
          `event: conversation\ndata: {"conversationId":"${newConversationId}","userMessageId":"${questionMessageId}","startedNewConversation":true}\n\n`,
          'event: no_evidence\ndata: {"message":"No hay sustento suficiente."}\n\n',
          doneEvent("rule"),
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState(null, "", `/chat/${conversationId}`);
    render(
      <ChatPanel
        initialConversation={eligibleConversation}
        modules={[chatModule]}
      />,
    );

    fireEvent.change(
      screen.getByRole("textbox", { name: "Escribe tu consulta" }),
      { target: { value: "Otra consulta" } },
    );
    await user.click(screen.getByRole("button", { name: "Enviar consulta" }));
    await screen.findByText("¡Claro! Cuéntame tu consulta.");
    // Recargar ahora no reabre la conversación anterior.
    expect(window.location.pathname).not.toContain(conversationId);
    await submitQuestion(user);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    // La pregunta siguiente se muestra como tema nuevo.
    expect(
      await screen.findByText(/Nuevo tema: esta consulta se guardó/u),
    ).toBeVisible();

    expect(
      requestBody(
        fetchMock.mock.calls[0] as unknown as [RequestInfo, RequestInit],
      ),
    ).toMatchObject({ conversationId });
    expect(
      requestBody(
        fetchMock.mock.calls[1] as unknown as [RequestInfo, RequestInit],
      ),
    ).not.toHaveProperty("conversationId");
  });

  it("flags the last saved question only when it is too old to be in progress", () => {
    const question = eligibleConversation.messages[0];
    const { unmount } = render(
      <ChatPanel
        initialConversation={{
          ...initialConversation,
          messages: [question],
        }}
        modules={[chatModule]}
      />,
    );
    // Guardada el 2026-08-24: la respuesta ya no puede estar en curso.
    expect(
      screen.getByText(/Esta consulta no se completó por un problema técnico/u),
    ).toBeVisible();
    unmount();

    render(
      <ChatPanel
        initialConversation={{
          ...initialConversation,
          messages: [{ ...question, createdAt: new Date().toISOString() }],
        }}
        modules={[chatModule]}
      />,
    );
    expect(
      screen.queryByText(/Esta consulta no se completó/u),
    ).not.toBeInTheDocument();
  });

  it("does not resend the screen module when continuing a conversation", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("crypto", { randomUUID: () => "local-id" });
    const fetchMock = vi.fn(async () =>
      streamResponse([
        conversationEvent(),
        'event: no_evidence\ndata: {"message":"No hay sustento suficiente."}\n\n',
        doneEvent("rule"),
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <ChatPanel initialModuleId={chatModule.id} modules={[chatModule]} />,
    );

    await submitQuestion(user);
    await screen.findByText("No hay sustento suficiente.");
    await submitQuestion(user);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    // Primera consulta: inicia la conversación con el módulo elegido.
    expect(
      requestBody(
        fetchMock.mock.calls[0] as unknown as [RequestInfo, RequestInit],
      ),
    ).toMatchObject({ moduleId: chatModule.id });
    // Seguimiento: solo la conversación; el servidor usa su módulo guardado.
    const followUp = requestBody(
      fetchMock.mock.calls[1] as unknown as [RequestInfo, RequestInit],
    );
    expect(followUp).toMatchObject({ conversationId });
    expect(followUp).not.toHaveProperty("moduleId");
  });

  it("renders the persisted no-evidence outcome without a fabricated source", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("crypto", { randomUUID: () => "local-id" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        streamResponse([
          conversationEvent(),
          'event: no_evidence\ndata: {"message":"No hay sustento suficiente."}\n\n',
          doneEvent("rule"),
        ]),
      ),
    );
    render(<ChatPanel modules={[chatModule]} />);

    await submitQuestion(user);

    expect(
      await screen.findByText("No hay sustento suficiente."),
    ).toBeVisible();
    expect(
      screen.getByText(
        "No se encontró sustento suficiente en los documentos disponibles.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Referencias" })).toBeNull();
  });

  it("answers a greeting conversationally without RAG sources", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("crypto", { randomUUID: () => "local-id" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        streamResponse([
          'event: conversational\ndata: {"message":"¡Hola! Soy AVEND ASESOR. ¿En qué puedo ayudarte hoy?"}\n\n',
        ]),
      ),
    );
    render(<ChatPanel modules={[chatModule]} />);

    await submitQuestion(user);

    expect(
      await screen.findByText(
        "¡Hola! Soy AVEND ASESOR. ¿En qué puedo ayudarte hoy?",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Referencias" })).toBeNull();
    expect(
      screen.getByRole("textbox", { name: "Escribe tu consulta" }),
    ).toBeEnabled();
  });

  it.each([
    [
      "event: conversation\ndata: {}\n\n",
      "La conversación recibida no tiene un formato válido.",
    ],
    [
      "event: conversational\ndata: {}\n\n",
      "La respuesta recibida no tiene un formato válido.",
    ],
    [
      `${conversationEvent()}event: sources\ndata: {"sources":[{}]}\n\n`,
      "Las referencias recibidas no tienen un formato válido.",
    ],
    [
      `${conversationEvent()}event: token\ndata: {"text":""}\n\n`,
      "La respuesta recibida no tiene un formato válido.",
    ],
    [
      `${conversationEvent()}event: done\ndata: {}\n\n`,
      "El cierre de la respuesta no tiene un formato válido.",
    ],
    [
      `${conversationEvent()}event: clarification\ndata: {"message":"Precisa el tema."}\n\n`,
      "La aclaración recibida no tiene un formato válido.",
    ],
    [
      `${conversationEvent()}event: no_evidence\ndata: {}\n\n`,
      "El resultado recibido no tiene un formato válido.",
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

  it("expone la entrada al panel de administración solo para roles administrativos", () => {
    const { unmount } = render(
      <ChatPanel modules={[chatModule]} role="docente" />,
    );
    expect(
      screen.queryByRole("link", { name: "Panel de administración" }),
    ).toBeNull();
    unmount();

    render(<ChatPanel modules={[chatModule]} role="superadmin" />);
    const adminEntries = screen.getAllByRole("link", {
      name: "Panel de administración",
    });
    expect(adminEntries).toHaveLength(2);
    expect(adminEntries[0]).toHaveAttribute("href", "/admin");
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
