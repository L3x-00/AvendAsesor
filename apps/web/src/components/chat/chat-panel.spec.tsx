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
import { ChatPanel, FRIENDLY_ERRORS } from "./chat-panel";

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

/**
 * Solo las llamadas del chat: la tarjeta «Documentos de este tema» también
 * consulta la red al abrir un tema.
 */
function chatCalls(mock: { mock: { calls: unknown[][] } }) {
  return mock.mock.calls.filter(
    (call) => !String(call[0]).includes("/api/chat/modules/"),
  ) as [RequestInfo | URL, RequestInit | undefined][];
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

  it("shows how long a saved answer took, links official portals in its suggestions and hides the retired label", () => {
    render(
      <ChatPanel
        initialConversation={{
          ...eligibleConversation,
          messages: [
            eligibleConversation.messages[0],
            {
              content:
                "Orientación general (sin cita de norma):\n\nPara postular como profesor, el MINEDU convoca concursos.\n\nSugerencias: verifica esta orientación en el portal oficial del MINEDU y consulta con tu UGEL o DRE antes de decidir.",
              createdAt: "2026-08-24T12:00:09.000Z",
              id: messageId,
              inReplyToMessageId: questionMessageId,
              role: "no_evidence" as const,
              sources: [],
            },
          ],
        }}
        modules={[chatModule]}
      />,
    );

    expect(screen.getByText("Pensado por 9 segundos")).toBeInTheDocument();
    expect(screen.queryByText(/sin cita de norma/)).not.toBeInTheDocument();
    // Solo el bloque de sugerencias enlaza: la mención del cuerpo queda en texto.
    const minedu = screen.getAllByRole("link", { name: /^MINEDU/ });
    expect(minedu).toHaveLength(1);
    expect(minedu[0]).toHaveAttribute("href", "https://www.gob.pe/minedu");
    expect(screen.getByRole("link", { name: /^UGEL/ })).toHaveAttribute(
      "target",
      "_blank",
    );
    expect(screen.getByRole("link", { name: /^DRE/ })).toBeInTheDocument();
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
    const answerContent = answer?.querySelector(".avend-chat-message-content");
    expect(
      within(answerContent as HTMLElement).getAllByRole("list"),
    ).toHaveLength(2);
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
      onerror: ((event?: { error?: string }) => void) | null = null;
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
      screen.getByRole("button", {
        name: "Dictar la consulta por voz",
        pressed: true,
      }),
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
      screen.getByRole("button", {
        name: "Dictar la consulta por voz",
        pressed: true,
      }),
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

  it("explica la causa real del fallo de voz y reintenta en español general", async () => {
    const user = userEvent.setup();
    const instances: {
      lang: string;
      onend: (() => void) | null;
      onerror: ((event?: { error?: string }) => void) | null;
      start: ReturnType<typeof vi.fn>;
    }[] = [];

    class SpeechRecognitionMock {
      continuous = false;
      interimResults = false;
      lang = "";
      onend: (() => void) | null = null;
      onerror: ((event?: { error?: string }) => void) | null = null;
      onresult = null;
      start = vi.fn();
      stop = vi.fn();

      constructor() {
        instances.push(this);
      }
    }

    vi.stubGlobal("SpeechRecognition", SpeechRecognitionMock);
    render(<ChatPanel modules={[chatModule]} />);
    const mic = await screen.findByRole("button", {
      name: "Dictar la consulta por voz",
    });

    await user.click(mic);
    act(() => {
      instances[0].onerror?.({ error: "language-not-supported" });
      instances[0].onend?.();
    });
    expect(instances[1]).toMatchObject({ lang: "es-ES" });
    expect(instances[1].start).toHaveBeenCalledOnce();

    act(() => {
      instances[1].onerror?.({ error: "no-speech" });
      instances[1].onend?.();
    });
    expect(
      screen.getByText(
        "No escuché nada. Toca el micrófono y habla cerca de él.",
      ),
    ).toBeVisible();

    for (const [code, text] of [
      ["not-allowed", /bloqueó el micrófono/],
      ["service-not-allowed", /no ofrece dictado por voz/],
      ["audio-capture", /No se detectó un micrófono/],
      ["network", /servicio de voz del navegador no respondió/],
    ] as const) {
      await user.click(mic);
      act(() => instances.at(-1)?.onerror?.({ error: code }));
      expect(screen.getByText(text)).toBeVisible();
    }

    await user.click(mic);
    act(() => {
      instances.at(-1)?.onerror?.({ error: "language-not-supported" });
      instances.at(-1)?.onend?.();
    });
    act(() => instances.at(-1)?.onerror?.({ error: "language-not-supported" }));
    expect(screen.getByText(/no reconoce el dictado en español/)).toBeVisible();

    await user.click(mic);
    act(() => {
      instances.at(-1)?.onerror?.({ error: "aborted" });
      instances.at(-1)?.onend?.();
    });
    expect(
      screen.getByText(
        "Dictado finalizado. Revisa el texto antes de enviarlo.",
      ),
    ).toBeVisible();
  });

  it("los eventos tardíos de un dictado detenido no lo reinician ni cancelan el nuevo", async () => {
    const user = userEvent.setup();
    const instances: {
      onend: (() => void) | null;
      onerror: ((event?: { error?: string }) => void) | null;
      start: ReturnType<typeof vi.fn>;
    }[] = [];

    class SpeechRecognitionMock {
      continuous = false;
      interimResults = false;
      lang = "";
      onend: (() => void) | null = null;
      onerror: ((event?: { error?: string }) => void) | null = null;
      onresult = null;
      start = vi.fn();
      stop = vi.fn();

      constructor() {
        instances.push(this);
      }
    }

    vi.stubGlobal("SpeechRecognition", SpeechRecognitionMock);
    render(<ChatPanel modules={[chatModule]} />);
    const mic = await screen.findByRole("button", {
      name: "Dictar la consulta por voz",
    });

    // Se detiene justo cuando el navegador iba a reintentar en otro idioma.
    await user.click(mic);
    act(() => instances[0].onerror?.({ error: "language-not-supported" }));
    await user.click(mic);
    act(() => instances[0].onend?.());
    expect(instances).toHaveLength(1);
    expect(
      screen.getByText("Dictado detenido. Revisa el texto antes de enviarlo."),
    ).toBeVisible();

    // El fin tardío de la sesión anterior no apaga la nueva.
    await user.click(mic);
    act(() => instances[0].onend?.());
    expect(
      screen.getByRole("button", {
        name: "Dictar la consulta por voz",
        pressed: true,
      }),
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
      screen.getByRole("button", { name: "Mostrar temas. 1 tema" }),
    );

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
      screen.getByRole("button", { name: "Mostrar temas. 1 tema" }),
    );

    await user.click(
      screen.getByRole("button", { name: /licencia por salud/i }),
    );
    await submitQuestion(user);
    await waitFor(() => expect(chatCalls(fetchMock)).toHaveLength(1));
    expect(requestBody(chatCalls(fetchMock)[0])).toEqual({
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
    await waitFor(() => expect(chatCalls(fetchMock)).toHaveLength(2));
    expect(requestBody(chatCalls(fetchMock)[1])).toEqual({
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
    const citation = screen.getByRole("link", {
      name: "Ver fuente 1: Norma de licencias",
    });
    expect(citation).toHaveAttribute("href", `#fuente-${messageId}-1`);
    // Las referencias nacen plegadas; tocar la cita [1] las abre.
    const references = screen.getByLabelText("Referencias verificables");
    expect(references).not.toHaveAttribute("open");
    expect(
      screen.getByRole("region", {
        name: "Documentos disponibles para descargar",
      }),
    ).toBeVisible();
    fireEvent.click(citation);
    expect(references).toHaveAttribute("open");
    expect(screen.getByRole("heading", { name: "Referencias" })).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Preparar ficha de orientación" }),
    ).toHaveAttribute(
      "href",
      `/chat/${conversationId}/orientacion/${messageId}`,
    );
  });

  it("saluda por el nombre y un ejemplo solo rellena el cuadro, sin enviar", async () => {
    const user = userEvent.setup();
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    render(<ChatPanel fullName="MARÍA pérez" modules={[chatModule]} />);

    expect(
      screen.getByRole("heading", {
        name: "Hola, María. ¿En qué te ayudo hoy?",
      }),
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", {
        name: "¿Qué requisitos necesito para…?",
      }),
    );

    const box = screen.getByRole("textbox", { name: "Escribe tu consulta" });
    expect(box).toHaveValue("¿Qué requisitos necesito para ");
    expect(box).toHaveFocus();
    expect(request).not.toHaveBeenCalledWith(
      "/api/chat/stream",
      expect.anything(),
    );
  });

  it("keeps the empty module state explicit instead of inventing a category", () => {
    render(<ChatPanel modules={[]} />);

    expect(
      screen.getByText(/Aún no hay módulos activos para filtrar/i),
    ).toBeVisible();
    expect(
      screen.getByText(/Escribe una consulta sobre procesos/i),
    ).toBeVisible();
    expect(
      screen.queryByText(/Elige un tema si ayuda/i),
    ).not.toBeInTheDocument();
  });

  it("shows the approved guidance only before an available subtopic group", () => {
    const { rerender } = render(
      <ChatPanel initialModuleId={chatModule.id} modules={[chatModule]} />,
    );

    expect(
      screen.queryByText(/Elige un tema si ayuda/i),
    ).not.toBeInTheDocument();

    rerender(
      <ChatPanel
        initialModuleId={chatModule.id}
        modules={[chatModule, childModule]}
      />,
    );
    expect(screen.getByText(/Elige un tema si ayuda/i)).toBeInTheDocument();
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
    await user.click(await screen.findByText("Ver referencias"));
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
    [401, FRIENDLY_ERRORS.sessionExpired],
    [403, FRIENDLY_ERRORS.forbidden],
    [429, FRIENDLY_ERRORS.rateLimited],
    [503, FRIENDLY_ERRORS.unavailable],
    [500, FRIENDLY_ERRORS.generic],
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

  it("Enter envía y Shift+Enter hace un salto de línea, como en los chats de IA", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("crypto", { randomUUID: () => "local-id" });
    const request = vi.fn(async () => new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", request);
    render(<ChatPanel modules={[chatModule]} />);

    const box = screen.getByRole("textbox", { name: "Escribe tu consulta" });
    await user.type(box, "Primera línea{Shift>}{Enter}{/Shift}segunda");
    expect(box).toHaveValue("Primera línea\nsegunda");
    expect(request).not.toHaveBeenCalledWith(
      "/api/chat/stream",
      expect.anything(),
    );

    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        "/api/chat/stream",
        expect.anything(),
      ),
    );
  });

  it("Enter que confirma un carácter compuesto (Safari, keyCode 229) no envía", () => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    render(<ChatPanel modules={[chatModule]} />);

    const box = screen.getByRole("textbox", { name: "Escribe tu consulta" });
    fireEvent.change(box, { target: { value: "¿Qué plazo" } });
    fireEvent.keyDown(box, { key: "Enter", keyCode: 229 });

    expect(request).not.toHaveBeenCalledWith(
      "/api/chat/stream",
      expect.anything(),
    );
  });

  it("devuelve el foco al cuadro de consulta cuando termina la respuesta", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("crypto", { randomUUID: () => "local-id" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 503 })),
    );
    render(<ChatPanel modules={[chatModule]} />);

    const box = screen.getByRole("textbox", { name: "Escribe tu consulta" });
    await user.type(box, "Consulta{Enter}");

    await screen.findByText(FRIENDLY_ERRORS.unavailable);
    await waitFor(() => expect(box).toHaveFocus());
  });

  it("ofrece volver a enviar la consulta con un toque tras un error", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("crypto", { randomUUID: () => "local-id" });
    const request = vi.fn(async () => new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", request);
    render(<ChatPanel modules={[chatModule]} />);

    await submitQuestion(user);
    await user.click(
      await screen.findByRole("button", { name: "Volver a enviar" }),
    );

    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  });

  it("si la sesión caducó, lleva a iniciar sesión en vez de reintentar", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("crypto", { randomUUID: () => "local-id" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 401 })),
    );
    render(<ChatPanel modules={[chatModule]} />);

    await submitQuestion(user);

    expect(
      await screen.findByRole("link", { name: "Iniciar sesión" }),
    ).toHaveAttribute("href", "/auth/sign-in?sesion=caducada");
    expect(
      screen.queryByRole("button", { name: "Volver a enviar" }),
    ).toBeNull();
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

    expect(await screen.findByText(FRIENDLY_ERRORS.streamFailed)).toBeVisible();
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

    expect(await screen.findByText(FRIENDLY_ERRORS.connection)).toBeVisible();
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

  it("normalizes old grouped citations and omits unknown sources", () => {
    render(
      <ChatPanel
        initialConversation={{
          ...initialConversation,
          messages: [
            eligibleConversation.messages[0],
            {
              ...eligibleConversation.messages[1],
              content: "La licencia se solicita dentro de 5 días [1, 2].",
            },
          ],
        }}
        modules={[chatModule]}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Ver fuente 1: Norma de licencias" }),
    ).toBeVisible();
    // La fuente 2 no existe en esta respuesta: queda como texto.
    const paragraph = screen
      .getByRole("link", { name: "Ver fuente 1: Norma de licencias" })
      .closest("p");
    expect(paragraph?.textContent).toBe(
      "La licencia se solicita dentro de 5 días [1].",
    );
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
    // La respuesta en vivo dice cuánto tardó (mínimo 1 segundo).
    expect(screen.getByText("Pensado por 1 segundo")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Consultar Licencias" }),
    );

    // La pregunta original se reenvía sola, en una conversación nueva del tema
    // elegido: el docente no tiene que reescribirla.
    await waitFor(() => expect(chatCalls(fetchMock)).toHaveLength(2));
    expect(
      requestBody(chatCalls(fetchMock)[1] as [RequestInfo, RequestInit]),
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
    await waitFor(() => expect(chatCalls(fetchMock)).toHaveLength(2));
    // La pregunta siguiente se muestra como tema nuevo.
    expect(
      await screen.findByText(/Nuevo tema: esta consulta se guardó/u),
    ).toBeVisible();

    expect(
      requestBody(
        chatCalls(fetchMock)[0] as unknown as [RequestInfo, RequestInit],
      ),
    ).toMatchObject({ conversationId });
    expect(
      requestBody(
        chatCalls(fetchMock)[1] as unknown as [RequestInfo, RequestInit],
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
    await waitFor(() => expect(chatCalls(fetchMock)).toHaveLength(2));

    // Primera consulta: inicia la conversación con el módulo elegido.
    expect(
      requestBody(
        chatCalls(fetchMock)[0] as unknown as [RequestInfo, RequestInit],
      ),
    ).toMatchObject({ moduleId: chatModule.id });
    // Seguimiento: solo la conversación; el servidor usa su módulo guardado.
    const followUp = requestBody(
      chatCalls(fetchMock)[1] as unknown as [RequestInfo, RequestInit],
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
        "Respuesta lista.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Referencias" })).toBeNull();
  });

  it("avisa que hay información nueva y deja lista la consulta para volver a enviarla", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ChatPanel
        initialConversation={eligibleConversation}
        modules={[chatModule]}
        resolvedUpdate={{
          conversationId,
          question: "¿Qué requisitos corresponden?",
          resolvedAt: "2026-09-26T10:00:00.000Z",
        }}
      />,
    );

    expect(screen.getByRole("note")).toHaveTextContent(
      "Hay información nueva.",
    );
    await user.click(screen.getByRole("button", { name: "Volver a preguntar" }));
    const box = screen.getByRole("textbox", { name: "Escribe tu consulta" });
    expect(box).toHaveValue("¿Qué requisitos corresponden?");
    expect(box).toHaveFocus();

    rerender(
      <ChatPanel
        initialConversation={eligibleConversation}
        modules={[chatModule]}
        resolvedUpdate={{
          conversationId,
          question: null,
          resolvedAt: "2026-09-26T10:00:00.000Z",
        }}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Volver a preguntar" }),
    ).toBeNull();
  });

  it("el aviso de información nueva desaparece al volver a preguntar", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("crypto", { randomUUID: () => "local-id" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        streamResponse([conversationEvent(), doneEvent("rule")]),
      ),
    );
    render(
      <ChatPanel
        initialConversation={eligibleConversation}
        modules={[chatModule]}
        resolvedUpdate={{
          conversationId,
          question: "¿Qué requisitos corresponden?",
          resolvedAt: "2026-09-26T10:00:00.000Z",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Volver a preguntar" }));
    await user.click(screen.getByRole("button", { name: "Enviar consulta" }));

    await waitFor(() =>
      expect(screen.queryByText(/Hay información nueva/)).toBeNull(),
    );
  });

  it("al abrir un tema muestra sus documentos y deja lista una pregunta sobre ellos", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              documents: [
                {
                  documentType: "LEY",
                  id: "33333333-3333-4333-8333-333333333333",
                  issuanceYear: 2012,
                  resolutionNumber: null,
                  summary: "Regula las licencias del profesorado.",
                  title: "Ley de licencias",
                },
              ],
              moduleId: chatModule.id,
              moduleName: "Licencias",
              scope: "module",
              scopeName: "Licencias",
              total: 1,
            }),
            { headers: { "Content-Type": "application/json" } },
          ),
      ),
    );
    render(
      <ChatPanel initialModuleId={chatModule.id} modules={[chatModule]} />,
    );

    await user.click(
      await screen.findByRole("button", { name: "Ver resumen" }),
    );

    await user.click(
      await screen.findByRole("button", {
        name: /Preguntar sobre este documento/,
      }),
    );

    const box = screen.getByRole("textbox", { name: "Escribe tu consulta" });
    expect(box).toHaveValue("¿Qué establece «Ley de licencias»?");
    expect(box).toHaveFocus();
  });

  it("muestra el catálogo con preguntas recomendadas que rellenan el cuadro", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("crypto", { randomUUID: () => "local-id" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        streamResponse([
          'event: conversational\ndata: {"message":"¡Claro! Hoy puedo responderte con este documento.","suggestions":["¿Qué funciones tiene el Coordinador Pedagógico?"]}\n\n',
        ]),
      ),
    );
    render(<ChatPanel modules={[chatModule]} />);

    await submitQuestion(user);

    const group = await screen.findByRole("region", {
      name: "Preguntas recomendadas",
    });
    await user.click(
      within(group).getByRole("button", {
        name: "¿Qué funciones tiene el Coordinador Pedagógico?",
      }),
    );
    expect(
      screen.getByRole("textbox", { name: "Escribe tu consulta" }),
    ).toHaveValue("¿Qué funciones tiene el Coordinador Pedagógico?");
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
    ["event: conversation\ndata: {}\n\n", FRIENDLY_ERRORS.malformed],
    ["event: conversational\ndata: {}\n\n", FRIENDLY_ERRORS.malformed],
    [
      `${conversationEvent()}event: sources\ndata: {"sources":[{}]}\n\n`,
      FRIENDLY_ERRORS.malformed,
    ],
    [
      `${conversationEvent()}event: token\ndata: {"text":""}\n\n`,
      FRIENDLY_ERRORS.malformed,
    ],
    [
      `${conversationEvent()}event: done\ndata: {}\n\n`,
      FRIENDLY_ERRORS.malformed,
    ],
    [
      `${conversationEvent()}event: clarification\ndata: {"message":"Precisa el tema."}\n\n`,
      FRIENDLY_ERRORS.malformed,
    ],
    [
      `${conversationEvent()}event: no_evidence\ndata: {}\n\n`,
      FRIENDLY_ERRORS.malformed,
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
    expect(await screen.findByText(FRIENDLY_ERRORS.malformed)).toBeVisible();
    unmount();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("offline"))),
    );
    render(<ChatPanel modules={[chatModule]} />);
    await submitQuestion(user);
    expect(await screen.findByText(FRIENDLY_ERRORS.connection)).toBeVisible();
  });
});
