"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import type {
  ChatConversationDetail,
  ChatHistoryMessage,
  ChatModule,
  ChatSource,
} from "@/lib/chat-api/types";
import { chatStreamPayloadSchemas } from "@/lib/chat-api/types";
import { TeacherShell } from "@/components/teacher/teacher-shell";
import { ChatSources } from "./chat-sources";

type MessageRole = ChatHistoryMessage["role"];

interface RenderedMessage {
  content: string;
  id: string;
  modules?: ChatModule[];
  role: MessageRole;
  sources: ChatSource[];
}

interface ChatPanelProps {
  initialConversation?: ChatConversationDetail;
  initialModuleId?: string;
  modules: ChatModule[];
  role?: "docente" | "admin" | "superadmin";
}

function initialMessages(
  conversation: ChatConversationDetail | undefined,
): RenderedMessage[] {
  return (conversation?.messages ?? []).map((message) => ({
    content: message.content,
    id: message.id,
    role: message.role,
    sources: message.sources,
  }));
}

function requestError(response: Response): string {
  if (response.status === 401)
    return "Tu sesión expiró. Inicia sesión nuevamente.";
  if (response.status === 403)
    return "No tienes permiso para realizar esta consulta.";
  if (response.status === 429)
    return "Alcanzaste el límite de consultas. Espera un minuto.";
  if (response.status === 503)
    return "El servicio de consulta no está disponible por el momento.";
  return "No fue posible procesar la consulta. Inténtalo nuevamente.";
}

function parseSseFrames(buffer: string): {
  frames: Array<{ data: string; event: string }>;
  remainder: string;
} {
  const parts = buffer.split("\n\n");
  const remainder = parts.pop() ?? "";
  const frames = parts.flatMap((part) => {
    const event = part.match(/^event: ([^\n]+)$/m)?.[1];
    const data = part.match(/^data: (.+)$/m)?.[1];

    return event && data ? [{ data, event }] : [];
  });

  return { frames, remainder };
}

function sortModules(list: ChatModule[]): ChatModule[] {
  return [...list].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );
}

/** Módulo raíz activo a partir de la selección (sea un módulo o un submódulo). */
function resolveActiveParentId(
  modules: ChatModule[],
  selectedModuleId: string | undefined,
): string | undefined {
  if (!selectedModuleId) return undefined;
  const selected = modules.find((module) => module.id === selectedModuleId);
  if (!selected) return undefined;
  return selected.parentModuleId ?? selected.id;
}

/** Resalta frases clave con **negrita** sin inyectar HTML (guía §6). El resto
 * del cuerpo se mantiene en texto normal (negro); el azul se reserva para
 * acentos, enlaces y estados. */
function renderInline(text: string): ReactNode[] {
  return text
    .split("**")
    .map((segment, index) =>
      index % 2 === 1 ? <strong key={index}>{segment}</strong> : segment,
    );
}

function renderRichContent(content: string): ReactNode[] {
  const paragraphs = content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

  const source = paragraphs.length > 0 ? paragraphs : [content];

  return source.map((paragraph, index) => (
    <p className="avend-chat-paragraph" key={index}>
      {renderInline(paragraph)}
    </p>
  ));
}

interface SpeechRecognitionResultLike {
  0: { transcript: string };
  isFinal: boolean;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

/** Detección segura del dictado por voz (no está en todos los navegadores). */
function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const candidate = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return (
    candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null
  );
}

function subscribeToSpeechRecognitionSupport(): () => void {
  return () => undefined;
}

function getSpeechRecognitionSupportSnapshot(): boolean {
  return getSpeechRecognition() !== null;
}

function getServerSpeechRecognitionSupportSnapshot(): boolean {
  return false;
}

export function ChatPanel({
  initialConversation,
  initialModuleId,
  modules,
  role,
}: ChatPanelProps) {
  const [conversationId, setConversationId] = useState<string | undefined>(
    initialConversation?.conversation.id,
  );
  const [messages, setMessages] = useState<RenderedMessage[]>(() =>
    initialMessages(initialConversation),
  );
  const [question, setQuestion] = useState("");
  const [selectedModuleId, setSelectedModuleId] = useState<string | undefined>(
    initialConversation?.conversation.selectedModuleId ?? initialModuleId,
  );
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isDictating, setIsDictating] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const micSupported = useSyncExternalStore(
    subscribeToSpeechRecognitionSupport,
    getSpeechRecognitionSupportSnapshot,
    getServerSpeechRecognitionSupportSnapshot,
  );
  const activeParentId = useMemo(
    () => resolveActiveParentId(modules, selectedModuleId),
    [modules, selectedModuleId],
  );
  const activeParent = useMemo(
    () => modules.find((module) => module.id === activeParentId),
    [modules, activeParentId],
  );
  const submodules = useMemo(
    () =>
      activeParentId
        ? sortModules(
            modules.filter((module) => module.parentModuleId === activeParentId),
          )
        : [],
    [modules, activeParentId],
  );
  // Etiqueta de contexto: solo cuando el usuario elige un submódulo concreto.
  const selectedSubmodule = useMemo(() => {
    const selected = modules.find((module) => module.id === selectedModuleId);
    return selected && selected.parentModuleId ? selected : undefined;
  }, [modules, selectedModuleId]);

  function changeModuleContext(moduleId: string | undefined) {
    if (isStreaming || moduleId === selectedModuleId) return;
    // Una conversación conserva el módulo con el que fue creada. Cambiar el
    // contexto inicia la siguiente consulta en una conversación nueva.
    setSelectedModuleId(moduleId);
    setConversationId(undefined);
  }

  function clearSubmodule() {
    changeModuleContext(activeParentId);
  }

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, []);

  function stopDictation() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsDictating(false);
  }

  function toggleDictation() {
    if (isStreaming) return;
    if (isDictating) {
      stopDictation();
      return;
    }

    const Recognition = getSpeechRecognition();
    if (!Recognition) return;

    const recognition = new Recognition();
    recognition.lang = "es-PE";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const clean = Array.from(event.results)
        .slice(event.resultIndex)
        .filter((result) => result.isFinal)
        .map((result) => result[0].transcript)
        .join("")
        .trim();
      if (clean) {
        setQuestion((current) => (current ? `${current} ${clean}` : clean));
      }
    };
    recognition.onerror = () => stopDictation();
    recognition.onend = () => {
      recognitionRef.current = null;
      setIsDictating(false);
    };

    recognitionRef.current = recognition;
    setIsDictating(true);
    recognition.start();
  }

  function replaceStreamingMessage(
    update: (message: RenderedMessage) => RenderedMessage,
  ) {
    setMessages((current) => {
      const latest = current.at(-1);
      if (!latest || latest.id !== "streaming") return current;
      return [...current.slice(0, -1), update(latest)];
    });
  }

  function discardStreamingMessage(message: string) {
    setMessages((current) => current.filter((item) => item.id !== "streaming"));
    setError(message);
    setStatus(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedQuestion = question.trim();
    if (!normalizedQuestion || isStreaming) return;
    if (isDictating) stopDictation();

    const abortController = new AbortController();
    setMessages((current) => [
      ...current,
      {
        content: normalizedQuestion,
        id: `local-question-${crypto.randomUUID()}`,
        role: "user",
        sources: [],
      },
    ]);
    setIsStreaming(true);
    setQuestion("");
    setError(null);
    setStatus("Buscando sustento en los documentos vigentes…");

    try {
      let currentSources: ChatSource[] = [];
      const response = await fetch("/api/chat/stream", {
        body: JSON.stringify({
          ...(conversationId ? { conversationId } : {}),
          ...(selectedModuleId ? { moduleId: selectedModuleId } : {}),
          question: normalizedQuestion,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        signal: abortController.signal,
      });

      if (!response.ok || !response.body) {
        discardStreamingMessage(requestError(response));
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;

      while (!completed) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        const parsed = parseSseFrames(buffer);
        buffer = parsed.remainder;

        for (const frame of parsed.frames) {
          let payload: unknown;
          try {
            payload = JSON.parse(frame.data);
          } catch {
            discardStreamingMessage(
              "La respuesta recibida no tiene un formato válido.",
            );
            return;
          }

          if (frame.event === "conversation") {
            const result =
              chatStreamPayloadSchemas.conversation.safeParse(payload);
            if (!result.success) {
              discardStreamingMessage(
                "La conversación recibida no tiene un formato válido.",
              );
              return;
            }
            setConversationId(result.data.conversationId);
            window.history.replaceState(
              null,
              "",
              `/chat/${result.data.conversationId}`,
            );
            continue;
          }

          if (frame.event === "sources") {
            const result = chatStreamPayloadSchemas.sources.safeParse(payload);
            if (!result.success) {
              discardStreamingMessage(
                "Las referencias recibidas no tienen un formato válido.",
              );
              return;
            }
            currentSources = result.data.sources;
            setStatus("Redactando una respuesta con el sustento encontrado…");
            continue;
          }

          if (frame.event === "token") {
            const result = chatStreamPayloadSchemas.token.safeParse(payload);
            if (!result.success) {
              discardStreamingMessage(
                "La respuesta recibida no tiene un formato válido.",
              );
              return;
            }
            setMessages((current) => {
              const latest = current.at(-1);
              if (latest?.id === "streaming") {
                return [
                  ...current.slice(0, -1),
                  {
                    ...latest,
                    content: `${latest.content}${result.data.text}`,
                  },
                ];
              }
              return [
                ...current,
                {
                  content: result.data.text,
                  id: "streaming",
                  role: "assistant",
                  sources: currentSources,
                },
              ];
            });
            setStatus("Respuesta en curso…");
            continue;
          }

          if (frame.event === "clarification") {
            const result =
              chatStreamPayloadSchemas.clarification.safeParse(payload);
            if (!result.success) {
              discardStreamingMessage(
                "La aclaración recibida no tiene un formato válido.",
              );
              return;
            }
            setMessages((current) => [
              ...current,
              {
                content: result.data.message,
                id: `clarification-${crypto.randomUUID()}`,
                modules: result.data.modules,
                role: "clarification",
                sources: [],
              },
            ]);
            setStatus(null);
            continue;
          }

          if (frame.event === "no_evidence") {
            const result =
              chatStreamPayloadSchemas.no_evidence.safeParse(payload);
            if (!result.success) {
              discardStreamingMessage(
                "El resultado recibido no tiene un formato válido.",
              );
              return;
            }
            setMessages((current) => [
              ...current,
              {
                content: result.data.message,
                id: `no-evidence-${crypto.randomUUID()}`,
                role: "no_evidence",
                sources: [],
              },
            ]);
            setStatus(null);
            continue;
          }

          if (frame.event === "error") {
            const result = chatStreamPayloadSchemas.error.safeParse(payload);
            discardStreamingMessage(
              result.success && result.data.code === "CHAT_STREAM_FAILED"
                ? "No se pudo completar la respuesta. No se guardó contenido parcial."
                : "La consulta no se pudo completar.",
            );
            return;
          }

          if (frame.event === "done") {
            const result = chatStreamPayloadSchemas.done.safeParse(payload);
            if (!result.success) {
              discardStreamingMessage(
                "El cierre de la respuesta no tiene un formato válido.",
              );
              return;
            }
            replaceStreamingMessage((message) => ({
              ...message,
              id: result.data.messageId,
            }));
            setStatus(null);
            completed = true;
          }
        }

        if (done && !completed) {
          discardStreamingMessage(
            "Se interrumpió la conexión. No se guardó contenido parcial.",
          );
          return;
        }
      }
    } catch {
      discardStreamingMessage(
        "Se interrumpió la conexión. No se guardó contenido parcial.",
      );
    } finally {
      setIsStreaming(false);
    }
  }

  return (
    <TeacherShell
      activeSection="chat"
      modules={modules}
      role={role}
      selectedModuleId={activeParentId}
    >
      <section aria-labelledby="chat-title" className="avend-chat-page">
        <header className="avend-chat-header">
          <div>
            <p className="avend-eyebrow">Consulta normativa</p>
            <h1 id="chat-title">
              {activeParent ? activeParent.name : "Chat general"}
            </h1>
            {activeParent?.description ? (
              <p className="avend-chat-module-description">
                {activeParent.description}
              </p>
            ) : null}
            <p>
              Selecciona el tema relacionado si lo deseas. También puedes
              escribir directamente tu consulta.
            </p>
          </div>
        </header>

        {modules.length === 0 ? (
          <p className="avend-chat-empty-modules">
            Aún no hay módulos activos para filtrar la consulta. Puedes
            consultar de forma general cuando existan documentos procesados.
          </p>
        ) : activeParent && submodules.length > 0 ? (
          <section
            aria-label={`Subtemas de ${activeParent.name}`}
            className="avend-chat-modules avend-chat-submodules"
          >
            {submodules.map((submodule) => (
              <button
                aria-pressed={submodule.id === selectedModuleId}
                className="avend-chat-module"
                disabled={isStreaming}
                key={submodule.id}
                onClick={() => changeModuleContext(submodule.id)}
                type="button"
              >
                 <span>{submodule.name}</span>
              </button>
            ))}
          </section>
        ) : null}

        {selectedSubmodule ? (
          <div className="avend-chat-context" role="status">
            <span>Tema: {selectedSubmodule.name}</span>
            <button
              disabled={isStreaming}
              onClick={clearSubmodule}
              type="button"
            >
              Quitar tema
            </button>
          </div>
        ) : null}

        <section aria-busy={isStreaming} className="avend-chat-conversation">
          {messages.length === 0 ? (
            <p className="avend-chat-empty-state">
              Escribe una consulta para recibir una respuesta respaldada
              únicamente por los documentos vigentes disponibles.
            </p>
          ) : (
            messages.map((message) => (
              <article
                className={`avend-chat-message avend-chat-message--${message.role}`}
                key={message.id}
              >
                <p className="avend-chat-message-label">
                  {message.role === "user" ? "Tu consulta" : "AVEND ASESOR"}
                </p>
                <div className="avend-chat-message-content">
                  {renderRichContent(message.content)}
                </div>
                {message.modules?.length ? (
                  <div className="avend-chat-clarification-options">
                    {message.modules.map((module) => (
                      <button
                        disabled={isStreaming}
                        key={module.id}
                        onClick={() => {
                          setSelectedModuleId(module.id);
                          setConversationId(undefined);
                        }}
                        type="button"
                      >
                        Consultar {module.name}
                      </button>
                    ))}
                  </div>
                ) : null}
                {message.sources.length ? (
                  <ChatSources sources={message.sources} />
                ) : null}
              </article>
            ))
          )}
        </section>

        {error ? (
          <p className="avend-chat-error" role="alert">
            {error}
          </p>
        ) : null}

        <form className="avend-chat-composer" onSubmit={handleSubmit}>
          <label htmlFor="chat-question">Escribe tu consulta</label>
          <textarea
            disabled={isStreaming}
            id="chat-question"
            maxLength={8_000}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Escribe tu consulta aquí…"
            required
            rows={3}
            value={question}
          />
          <div className="avend-chat-composer-actions">
            <p aria-live="polite" className="avend-chat-status">
              {status ??
                "La respuesta se sustentará en los documentos disponibles."}
            </p>
            <div className="avend-chat-composer-buttons">
              {micSupported ? (
                <button
                  aria-label={
                    isDictating
                      ? "Detener el dictado por voz"
                      : "Dictar la consulta por voz"
                  }
                  aria-pressed={isDictating}
                  className={`avend-chat-mic${isDictating ? " avend-chat-mic--active" : ""}`}
                  disabled={isStreaming}
                  onClick={toggleDictation}
                  type="button"
                >
                  <svg
                    aria-hidden="true"
                    className="avend-chat-mic-icon"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.6"
                    viewBox="0 0 24 24"
                  >
                    <rect height="11" rx="3" width="6" x="9" y="3" />
                    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                  </svg>
                  <span>{isDictating ? "Escuchando…" : "Voz"}</span>
                </button>
              ) : null}
              <button
                className="avend-button avend-button--primary"
                disabled={isStreaming || !question.trim()}
                type="submit"
              >
                {isStreaming ? "Consultando…" : "Enviar consulta"}
              </button>
            </div>
          </div>
        </form>
      </section>
    </TeacherShell>
  );
}
