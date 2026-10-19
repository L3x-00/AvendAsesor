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

  it("shows how long a saved answer took and hides its retired generic portal suggestion", () => {
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
    expect(screen.queryByText(/^Sugerencias:/u)).not.toBeInTheDocument();
    // La mención que queda pertenece al cuerpo de la orientación histórica,
    // no a una petición de portal, así que no debe convertirse en un enlace.
    expect(screen.queryAllByRole("link", { name: /^MINEDU/ })).toHaveLength(0);
    expect(
      screen.queryAllByRole("link", { name: /^(?:UGEL|DRE)/ }),
    ).toHaveLength(0);
  });

  it("does not turn a new no-evidence generic suggestion into an official link", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("crypto", { randomUUID: () => "local-id" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        streamResponse([
          conversationEvent(),
          'event: no_evidence\ndata: {"message":"Sugerencias: visita el portal oficial del MINEDU antes de decidir."}\n\n',
          doneEvent("openai"),
        ]),
      ),
    );
    render(<ChatPanel modules={[chatModule]} />);

    await submitQuestion(user);

    expect(
      await screen.findByText(
        "Sugerencias: visita el portal oficial del MINEDU antes de decidir.",
      ),
    ).toBeVisible();
    expect(screen.queryAllByRole("link", { name: /^MINEDU/ })).toHaveLength(0);
  });

  it("no convierte en enlace una URL incrustada en una fuente del RAG", () => {
    const { container } = render(
      <ChatPanel
        initialConversation={{
          ...eligibleConversation,
          messages: [
            eligibleConversation.messages[0],
            {
              ...eligibleConversation.messages[1],
              content:
                "Consulta el [validador de firma](https://apps.firmaperu.gob.pe/web/validador.xhtml) para verificar el documento. [1]",
            },
          ],
        }}
        modules={[chatModule]}
      />,
    );

    const assistantMessage = document.querySelector(
      ".avend-chat-message--assistant",
    );
    expect(assistantMessage).toHaveTextContent("validador de firma");
    expect(
      within(assistantMessage as HTMLElement).queryByRole("link", {
        name: /validador de firma/u,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Ver fuente 1/u }),
    ).toBeInTheDocument();
    expect(container).not.toHaveTextContent("](https://");
  });

  it("limpia el enlace de validador mal formado de conversaciones guardadas", () => {
    const { container } = render(
      <ChatPanel
        initialConversation={{
          ...eligibleConversation,
          messages: [
            eligibleConversation.messages[0],
            {
              ...eligibleConversation.messages[1],
              content:
                "La firma puede verificarse en [**https://apps.firmaperu.gob.pe/web/validador.xhtml(enlace oficial, se abre en una pestaña nueva)**](<https://apps.firmaperu.gob.pe/web/validador.xhtml(enlace oficial, se abre en una pestaña nueva)>). [1]",
            },
          ],
        }}
        modules={[chatModule]}
      />,
    );

    expect(
      screen.queryByRole("link", { name: /firmaperu/u }),
    ).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent("](<https://");
    expect(container).toHaveTextContent("https://apps.firmaperu.gob.pe");
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

  it("une en una sola lista los elementos numerados separados por líneas en blanco", () => {
    const { container } = render(
      <ChatPanel
        initialConversation={{
          ...eligibleConversation,
          messages: [
            eligibleConversation.messages[0],
            {
              ...eligibleConversation.messages[1],
              content:
                "1. Acreditar estudios superiores\n\n1. Salud física y mental\n\n1. Edad",
            },
          ],
        }}
        modules={[chatModule]}
      />,
    );
    const lists = container.querySelectorAll(
      ".avend-chat-message--assistant ol.avend-chat-list",
    );

    expect(lists).toHaveLength(1);
    expect(lists[0].querySelectorAll("li")).toHaveLength(3);
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
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
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
            element.textContent === "Respuesta sustentada.",
        ),
      ).toBeVisible();
    });
    expect(await screen.findByText("Respuesta lista.")).toBeVisible();
    // La cita [1] enlaza con su fila en Referencias (punto 8). Con una sola
    // fuente se muestra una vez, como «Fuente: [1]», y no pegada al párrafo.
    expect(
      screen.getByRole("link", { name: "Ver fuente 1: Norma de licencias" })
        .parentElement?.textContent,
    ).toBe("Fuente: [1]");
    const citation = screen.getByRole("link", {
      name: "Ver fuente 1: Norma de licencias",
    });
    expect(citation).toHaveAttribute("href", `#fuente-${messageId}-1`);
    // Las referencias nacen plegadas; tocar la cita [1] las abre.
    const references = screen.getByLabelText("Referencias verificables");
    const sourceToggle = within(references).getByRole("button", {
      name: /Ver fuentes disponibles/u,
    });
    expect(sourceToggle).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("region", {
        name: "Documentos disponibles para descargar",
      }),
    ).not.toBeInTheDocument();
    fireEvent.click(citation);
    expect(sourceToggle).toHaveAttribute("aria-expanded", "true");
    const citedSource = document.getElementById(`fuente-${messageId}-1`);
    expect(window.location.hash).toBe(`#fuente-${messageId}-1`);
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "auto",
      block: "center",
    });
    expect(citedSource).toHaveFocus();
    expect(screen.getByRole("heading", { name: "Referencias" })).toBeVisible();
    expect(
      screen.getByRole("region", {
        name: "Documentos disponibles para descargar",
      }),
    ).toBeVisible();
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
    await user.click(
      await screen.findByRole("button", {
        name: /Ver fuentes disponibles/u,
      }),
    );
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

  it("renders a short cited Markdown table as an accessible comparison table", () => {
    render(
      <ChatPanel
        initialConversation={{
          ...initialConversation,
          messages: [
            eligibleConversation.messages[0],
            {
              ...eligibleConversation.messages[1],
              content:
                "La fuente muestra estos valores comparables:\n| Cargo | Remuneración mensual |\n| --- | ---: |\n| Docente coordinador | S/ 2 666,80 [1] |\n| Director encargado | S/ 3 000,00 [1] |",
            },
          ],
        }}
        modules={[chatModule]}
      />,
    );

    const table = screen.getByRole("table", {
      name: "Tabla de la respuesta 1: 2 columnas (Cargo y Remuneración mensual) y 2 filas.",
    });
    expect(
      within(table).getByRole("columnheader", { name: "Cargo" }),
    ).toBeVisible();
    expect(
      within(table).getByRole("columnheader", { name: "Remuneración mensual" }),
    ).toBeVisible();
    expect(table).toHaveTextContent("Docente coordinador");
    expect(table).toHaveTextContent("S/ 2 666,80");
    // Ambas filas citan el mismo documento: la cita no se repite por fila, va
    // una sola vez justo bajo la tabla.
    expect(within(table).queryByRole("link")).not.toBeInTheDocument();
    expect(table).not.toHaveTextContent("[1]");
    const source = screen.getByRole("link", {
      name: "Ver fuente 1: Norma de licencias",
    });
    expect(source.parentElement).toHaveTextContent("Fuente: [1]");
    expect(table.closest(".avend-chat-table-block")?.nextElementSibling).toBe(
      source.parentElement,
    );
    expect(
      screen.getByRole("region", {
        name: "Tabla de la respuesta 1. Desplázate horizontalmente si es necesario.",
      }),
    ).toHaveAttribute("tabindex", "0");
  });

  it("repairs structured salary bullets as a table in a persisted chat", () => {
    render(
      <ChatPanel
        initialConversation={{
          ...initialConversation,
          messages: [
            eligibleConversation.messages[0],
            {
              ...eligibleConversation.messages[1],
              content: [
                "La remuneración varía según la modalidad:",
                "",
                "- Modalidad / Forma: Educación Básica Regular – EBR; Nivel / Ciclo: Inicial; Jornada laboral: 30; Remuneración mensual (S/): 3 500,70",
                "- Modalidad / Forma: Educación Básica Regular – EBR; Nivel / Ciclo: Primaria; Jornada laboral: 30; Remuneración mensual (S/): 3 500,70",
                "",
                "La jornada menor se paga proporcionalmente. [1]",
              ].join("\n"),
            },
          ],
        }}
        modules={[chatModule]}
      />,
    );

    const table = screen.getByRole("table", {
      name: /4 columnas .* y 2 filas/u,
    });
    expect(within(table).getAllByText("3 500,70")).toHaveLength(2);
    expect(screen.queryByText(/Modalidad \/ Forma:/u)).not.toBeInTheDocument();
    expect(
      table.closest(".avend-chat-table-block")?.nextElementSibling,
    ).toHaveTextContent("Fuente: [1]");
  });

  it("keeps a native salary table as a grid when one document supports the block", () => {
    render(
      <ChatPanel
        initialConversation={{
          ...initialConversation,
          messages: [
            eligibleConversation.messages[0],
            {
              ...eligibleConversation.messages[1],
              content: [
                "Aquí tienes una tabla informativa. [1]",
                "",
                "| Modalidad / Forma | Nivel / Ciclo | Jornada laboral | Remuneración mensual (S/) |",
                "| --- | --- | ---: | ---: |",
                "| Educación Básica Regular – EBR | Inicial | 30 | 3,300.60 |",
                "| Educación Básica Regular – EBR | Primaria | 30 | 3,300.60 |",
              ].join("\n"),
            },
          ],
        }}
        modules={[chatModule]}
      />,
    );

    const table = screen.getByRole("table", {
      name: /4 columnas .* y 2 filas/u,
    });
    expect(within(table).getAllByText("3,300.60")).toHaveLength(2);
    expect(screen.queryByText(/Modalidad \/ Forma:/u)).not.toBeInTheDocument();
    expect(
      table.closest(".avend-chat-table-block")?.nextElementSibling,
    ).toHaveTextContent("Fuente: [1]");
  });

  it("renders a one-row table when its immediately following evidence sentence cites the source", () => {
    render(
      <ChatPanel
        initialConversation={{
          ...initialConversation,
          messages: [
            eligibleConversation.messages[0],
            {
              ...eligibleConversation.messages[1],
              content:
                "| Modalidad | Nivel | Jornada laboral | Remuneración mensual |\n| --- | --- | --- | ---: |\n| Educación Básica Regular - EBR | Secundaria | 30 horas | S/ 3 300,60 |\n\nEsta información se encuentra en el artículo 3, numeral 2.2. [1]",
            },
          ],
        }}
        modules={[chatModule]}
      />,
    );

    const table = screen.getByRole("table", {
      name: "Tabla de la respuesta 1: 4 columnas (Modalidad, Nivel, Jornada laboral y Remuneración mensual) y 1 fila.",
    });
    expect(table).toHaveTextContent("Educación Básica Regular - EBR");
    expect(table).toHaveTextContent("S/ 3 300,60");
    expect(
      screen.getByRole("link", { name: "Ver fuente 1: Norma de licencias" }),
    ).toBeVisible();
    expect(screen.queryByText(/^\| Modalidad/u)).not.toBeInTheDocument();
  });

  it("renders the nine-row, five-column pay scale as a table instead of raw bars", () => {
    render(
      <ChatPanel
        initialConversation={{
          ...initialConversation,
          messages: [
            eligibleConversation.messages[0],
            {
              ...eligibleConversation.messages[1],
              content: [
                "Aquí tienes una tabla informativa sobre las remuneraciones mensuales:",
                "",
                "| Modalidad / Forma | Nivel / Ciclo | Jornada laboral | Remuneración mensual (S/) | Cita |",
                "|-------------------|---------------|-----------------|---------------------------|-------|",
                "| Educación Básica Regular - EBR | Inicial | 30 | 3,300.60 | [1] |",
                "| | Primaria | 30 | 3,300.60 | [1] |",
                "| | Secundaria | 30 | 3,300.60 | [1] |",
                "| Educación Básica Especial - EBE | Inicial | 30 | 3,300.60 | [1] |",
                "| | Primaria | 30 | 3,300.60 | [1] |",
                "| Educación Básica Alternativa - EBA | Inicial / Intermedio | 30 | 3,300.60 | [1] |",
                "| | Avanzado | 30 | 3,300.60 | [1] |",
                "| Educación Técnico Productiva - ETP | Básico y Medio | 30 | 3,300.60 | [1] |",
                "| Profesor Coordinador PRONOEI | - | - | 4,400.80 | [1] |",
                "",
                "Los docentes contratados perciben una remuneración proporcional.",
              ].join("\n"),
            },
          ],
        }}
        modules={[chatModule]}
      />,
    );

    // Las nueve filas citan el mismo documento: la columna «Cita» se retira y
    // la fuente se muestra una vez bajo la tabla.
    const table = screen.getByRole("table", {
      name: "Tabla de la respuesta 1: 4 columnas (Modalidad / Forma, Nivel / Ciclo, Jornada laboral y Remuneración mensual (S/)) y 9 filas.",
    });
    expect(
      within(table).queryByRole("columnheader", { name: "Cita" }),
    ).not.toBeInTheDocument();
    expect(within(table).queryByRole("link")).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Ver fuente 1: Norma de licencias" }),
    ).toHaveLength(1);
    expect(within(table).getAllByRole("row")).toHaveLength(10);
    // La primera columna es el encabezado de fila; las celdas combinadas heredan el grupo.
    const rowHeaders = within(table).getAllByRole("rowheader");
    expect(rowHeaders).toHaveLength(9);
    expect(rowHeaders[1]).toHaveTextContent("Educación Básica Regular - EBR");
    expect(rowHeaders[6]).toHaveTextContent(
      "Educación Básica Alternativa - EBA",
    );
    // Solo la columna de montos se alinea a la derecha (sin separador explícito).
    expect(
      within(table).getByRole("columnheader", {
        name: "Remuneración mensual (S/)",
      }),
    ).toHaveAttribute("data-align", "right");
    expect(
      within(table).getByRole("columnheader", { name: "Nivel / Ciclo" }),
    ).not.toHaveAttribute("data-align");
    expect(table).toHaveTextContent("Profesor Coordinador PRONOEI");
    expect(table).toHaveTextContent("4,400.80");
    expect(screen.queryByText(/\|/u)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Los docentes contratados perciben una remuneración proporcional.",
      ),
    ).toBeVisible();
  });

  it("reads an uncited Markdown table row by row instead of showing raw bars", () => {
    render(
      <ChatPanel
        initialConversation={{
          ...initialConversation,
          messages: [
            eligibleConversation.messages[0],
            {
              ...eligibleConversation.messages[1],
              content:
                "| Cargo | Jornada | Remuneración |\n| --- | --- | ---: |\n| Docente coordinador | 30 | S/ 2 666,80 |\n| Director encargado | - | S/ 3 000,00 |",
            },
          ],
        }}
        modules={[chatModule]}
      />,
    );

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText(/\|/u)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Cargo: Docente coordinador; Jornada: 30; Remuneración: S/ 2 666,80",
      ),
    ).toBeVisible();
    expect(
      screen.getByText("Cargo: Director encargado; Remuneración: S/ 3 000,00"),
    ).toBeVisible();
  });

  it("keeps the group of a merged first cell when a row lacks a known citation", () => {
    render(
      <ChatPanel
        initialConversation={{
          ...initialConversation,
          messages: [
            eligibleConversation.messages[0],
            {
              ...eligibleConversation.messages[1],
              content:
                "| Modalidad | Nivel | Monto |\n| --- | --- | --- |\n| EBR | Inicial | 3,300.60 [1] |\n| | Primaria | 3,300.60 |\n| | Secundaria | 3,300.60 [7] |",
            },
          ],
        }}
        modules={[chatModule]}
      />,
    );

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText(/\|/u)).not.toBeInTheDocument();
    expect(
      screen.getByText("Modalidad: EBR; Nivel: Primaria; Monto: 3,300.60"),
    ).toBeVisible();
  });

  it("reads a table beyond the grid limits row by row instead of showing raw bars", () => {
    const rows = Array.from(
      { length: 14 },
      (_, index) => `| Nivel ${index + 1} | S/ ${3000 + index} [1] |`,
    );
    render(
      <ChatPanel
        initialConversation={{
          ...initialConversation,
          messages: [
            eligibleConversation.messages[0],
            {
              ...eligibleConversation.messages[1],
              content: ["| Nivel | Monto |", "| --- | --- |", ...rows].join(
                "\n",
              ),
            },
          ],
        }}
        modules={[chatModule]}
      />,
    );

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText(/\|/u)).not.toBeInTheDocument();
    expect(
      screen.getByText(/^Nivel: Nivel 14; Monto: S\/ 3013/u),
    ).toBeVisible();
  });

  it("keeps a sentence with a vertical bar as regular text", () => {
    render(
      <ChatPanel
        initialConversation={{
          ...initialConversation,
          messages: [
            eligibleConversation.messages[0],
            {
              ...eligibleConversation.messages[1],
              content:
                "El tramo A | B es una referencia literal del documento. [1]",
            },
          ],
        }}
        modules={[chatModule]}
      />,
    );

    expect(
      screen.getByText(
        "El tramo A | B es una referencia literal del documento.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("does not present a Markdown grid without source citations as evidence", () => {
    render(
      <ChatPanel
        initialConversation={{
          ...initialConversation,
          messages: [
            eligibleConversation.messages[0],
            {
              ...eligibleConversation.messages[1],
              content:
                "| Cargo | Remuneración |\n| --- | ---: |\n| Docente coordinador | S/ 2 666,80 |",
            },
          ],
        }}
        modules={[chatModule]}
      />,
    );

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("keeps the known citation beside its paragraph when a grouped rank is unknown", () => {
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
    // La fuente 2 no existe: se omite sin convertir la fuente 1 en una cita
    // global que podría atribuirle otras afirmaciones.
    const paragraph = screen
      .getByRole("link", { name: "Ver fuente 1: Norma de licencias" })
      .closest("p");
    expect(paragraph).toHaveTextContent(
      "La licencia se solicita dentro de 5 días [1].",
    );
    expect(screen.queryByText("Fuente:")).not.toBeInTheDocument();
  });

  describe("cita única de la respuesta", () => {
    const documentVersionId = "33333333-3333-4333-8333-333333333331";
    const otherVersionId = "33333333-3333-4333-8333-333333333332";
    const baseSource = eligibleConversation.messages[1].sources[0];

    function renderAnswer(
      content: string,
      sources: Array<Record<string, unknown>>,
    ) {
      return render(
        <ChatPanel
          initialConversation={{
            ...initialConversation,
            messages: [
              eligibleConversation.messages[0],
              {
                ...eligibleConversation.messages[1],
                content,
                sources: sources.map((source) => ({
                  ...baseSource,
                  ...source,
                })) as (typeof eligibleConversation.messages)[1]["sources"],
              },
            ],
          }}
          modules={[chatModule]}
        />,
      );
    }

    const sameDocument = [
      { documentVersionId, documentType: "DECRETO_SUPREMO", rank: 1 },
    ];

    it("muestra la cita una sola vez al final y no en cada párrafo", () => {
      renderAnswer(
        "Un docente de primaria percibe S/ 3 300,60. [1]\n\nLos contratados reciben una remuneración proporcional. [1]",
        sameDocument,
      );

      const links = screen.getAllByRole("link", { name: /Ver fuente 1/u });
      expect(links).toHaveLength(1);
      expect(links[0]).toHaveTextContent("[1] DS");
      const note = links[0].parentElement;
      expect(note).toHaveClass("avend-chat-source-note");
      expect(note).toHaveTextContent("Fuente: [1] DS");
      // Es lo último del contenido de la respuesta, tras los dos párrafos.
      expect(note?.previousElementSibling).toHaveTextContent(
        "Los contratados reciben una remuneración proporcional.",
      );
      expect(note?.nextElementSibling).toBeNull();
      expect(
        screen.getByText("Un docente de primaria percibe S/ 3 300,60."),
      ).toBeVisible();
    });

    it("agrupa en una cita varios fragmentos del mismo documento", () => {
      renderAnswer("Primer dato. [1]\n\nSegundo dato. [2]", [
        { documentVersionId, rank: 1 },
        {
          documentVersionId,
          id: "1c8b56af-6d0c-4fef-881e-7c00907540dd",
          rank: 2,
        },
      ]);

      const links = screen.getAllByRole("link", { name: /Ver fuente/u });
      expect(links).toHaveLength(1);
      expect(links[0]).toHaveAccessibleName(/Ver fuente 1:/u);
    });

    it("conserva cada cita en su lugar cuando provienen de documentos distintos", () => {
      renderAnswer("Primer dato. [1]\n\nSegundo dato. [2]", [
        { documentVersionId, rank: 1 },
        {
          documentVersionId: otherVersionId,
          documentTitle: "Otra norma",
          id: "1c8b56af-6d0c-4fef-881e-7c00907540dd",
          rank: 2,
        },
      ]);

      expect(screen.getAllByRole("link", { name: /Ver fuente/u })).toHaveLength(
        2,
      );
      expect(screen.getByText(/^Primer dato\./u)).toHaveTextContent(
        "Primer dato. [1]",
      );
      expect(document.querySelector(".avend-chat-source-note")).toBeNull();
    });

    it("no deja un párrafo vacío cuando la cita estaba sola en su línea", () => {
      renderAnswer("Un dato respaldado.\n\n[1]", sameDocument);

      const answer = screen
        .getByText("Un dato respaldado.")
        .closest(".avend-chat-message-content");
      expect(answer?.querySelectorAll(".avend-chat-paragraph")).toHaveLength(1);
      expect(
        screen.getAllByRole("link", { name: /Ver fuente 1/u }),
      ).toHaveLength(1);
    });

    it("coloca la fuente bajo la última tabla, antes de la frase de cierre", () => {
      renderAnswer(
        [
          "Estos son los montos:",
          "",
          "| Escala | Monto | Cita |",
          "| --- | ---: | --- |",
          "| Octava | 2 310,42 | [1] |",
          "| Séptima | 2 090,38 | [1] |",
          "",
          "Esta tabla refleja el decreto vigente.",
        ].join("\n"),
        sameDocument,
      );

      const table = screen.getByRole("table");
      expect(
        within(table).queryByRole("columnheader", { name: "Cita" }),
      ).not.toBeInTheDocument();
      const note = table.closest(".avend-chat-table-block")?.nextElementSibling;
      expect(note).toHaveTextContent("Fuente: [1] DS");
      expect(note?.nextElementSibling).toHaveTextContent(
        "Esta tabla refleja el decreto vigente.",
      );
    });

    it("no quita la columna de citas si la tabla se quedaría con una sola columna", () => {
      renderAnswer(
        ["| Escala | Cita |", "| --- | --- |", "| Octava | [1] |"].join("\n"),
        sameDocument,
      );

      expect(screen.getByRole("columnheader", { name: "Cita" })).toBeVisible();
      // Sus citas siguen visibles: la celda no queda vacía.
      expect(
        within(screen.getByRole("table")).getByRole("link", {
          name: /Ver fuente 1/u,
        }),
      ).toBeVisible();
    });
  });

  it("agrupa «Copiar» y «Preparar ficha de orientación» en la misma barra, sin texto de ayuda visible", () => {
    render(
      <ChatPanel
        initialConversation={eligibleConversation}
        modules={[chatModule]}
      />,
    );

    const ficha = screen.getByRole("link", {
      name: "Preparar ficha de orientación",
    });
    const copy = screen.getByRole("button", { name: "Copiar respuesta" });
    const actions = copy.parentElement;
    expect(actions).toHaveClass("avend-chat-message-actions");
    expect(actions).toContainElement(ficha);
    expect(actions?.parentElement).toHaveClass("avend-chat-message-toolbar");
    // La explicación sigue disponible para lectores de pantalla y como tooltip,
    // pero ya no ocupa una línea visible bajo el botón.
    expect(ficha).toHaveAccessibleDescription(
      "Se abrirá una vista previa editable solo en sus datos de presentación.",
    );
    expect(
      document.getElementById(ficha.getAttribute("aria-describedby") ?? ""),
    ).toHaveClass("avend-visually-hidden");
    expect(ficha).toHaveAttribute(
      "href",
      `/chat/${conversationId}/orientacion/${messageId}`,
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
          `event: clarification\ndata: {"message":"Precisa el tema.","modules":[{"id":"${childModule.id}","name":"${childModule.name}"}]}\n\n`,
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
    render(<ChatPanel modules={[chatModule, childModule]} />);

    await submitQuestion(user);
    expect(await screen.findByText("Precisa el tema.")).toBeVisible();
    expect(
      screen.getByText("Se necesita una aclaración para continuar."),
    ).toBeVisible();
    // La respuesta en vivo dice cuánto tardó (mínimo 1 segundo).
    expect(screen.getByText("Pensado por 1 segundo")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Consultar Licencia por salud" }),
    );

    // La opción elegida navega al módulo padre y queda escrita en el chat,
    // conservando detrás la consulta original.
    await waitFor(() => expect(chatCalls(fetchMock)).toHaveLength(2));
    expect(
      requestBody(chatCalls(fetchMock)[1] as [RequestInfo, RequestInit]),
    ).toEqual({
      // El botón del submódulo resuelve el padre y escribe la opción elegida.
      moduleId: chatModule.id,
      question: "Consultar Licencias: ¿Cómo solicito una licencia?",
    });
    expect(
      await screen.findByText(
        "Consultar Licencias: ¿Cómo solicito una licencia?",
      ),
    ).toBeVisible();
    expect(window.location.pathname).toMatch(/^\/chat\//u);
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
    expect(screen.getByText("Respuesta lista.")).toBeVisible();
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
    await user.click(
      screen.getByRole("button", { name: "Volver a preguntar" }),
    );
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

    await user.click(
      screen.getByRole("button", { name: "Volver a preguntar" }),
    );
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

    await screen.findByRole("button", { name: "Ocultar resumen" });

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
          `event: conversational\ndata: ${JSON.stringify({
            documents: [
              {
                documentId: "13333333-3333-4333-8333-333333333333",
                documentType: "ANEXO",
                issuanceYear: 2026,
                mimeType: "application/pdf",
                originalFileName: "anexo.pdf",
                pageCount: 2,
                resolutionNumber: null,
                title: "Anexo de funciones",
                versionId: "23333333-3333-4333-8333-333333333333",
              },
            ],
            message: "¡Claro! Hoy puedo responderte con este documento.",
            suggestions: ["¿Qué funciones tiene el Coordinador Pedagógico?"],
          })}\n\n`,
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
    expect(
      screen.getByRole("link", { name: "Descargar Anexo de funciones" }),
    ).toHaveAttribute(
      "href",
      "/api/chat/catalog/documents/23333333-3333-4333-8333-333333333333/download",
    );
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

  it("shows the official links the API sends when a portal is requested", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("crypto", { randomUUID: () => "local-id" });
    const message = [
      "Claro, aquí tienes los enlaces oficiales:",
      "",
      "- [Página oficial del Ministerio de Educación (MINEDU)](https://www.gob.pe/minedu): normas, convocatorias, trámites y comunicados del sector educación.",
      "- [Directorio oficial de las UGEL en gob.pe](https://www.gob.pe/busquedas?contenido%5B%5D=instituciones&term=UGEL): cada UGEL tiene su propia página; busca la tuya por el nombre de tu UGEL o de tu provincia.",
    ].join("\n");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        streamResponse([
          `event: conversational\ndata: ${JSON.stringify({ message })}\n\n`,
        ]),
      ),
    );
    render(<ChatPanel modules={[chatModule]} />);

    await submitQuestion(user);

    expect(
      await screen.findByRole("link", {
        name: /^Página oficial del Ministerio de Educación \(MINEDU\)/,
      }),
    ).toHaveAttribute("href", "https://www.gob.pe/minedu");
    expect(
      screen.getByRole("link", {
        name: /^Directorio oficial de las UGEL en gob\.pe/,
      }),
    ).toHaveAttribute(
      "href",
      "https://www.gob.pe/busquedas?contenido%5B%5D=instituciones&term=UGEL",
    );
    // Fuera de «Sugerencias:» la sigla no se enlaza otra vez.
    expect(screen.queryByRole("link", { name: /^UGEL/ })).toBeNull();
    expect(screen.queryByText(/\]\(https:/)).toBeNull();
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
