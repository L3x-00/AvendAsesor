"use client";

import Link from "next/link";
import {
  FormEvent,
  Fragment,
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
  ClarificationModule,
} from "@/lib/chat-api/types";
import { chatStreamPayloadSchemas } from "@/lib/chat-api/types";
import { TeacherShell } from "@/components/teacher/teacher-shell";
import { ConsultationFeedback } from "./consultation-feedback";
import { ChatSources, citedSourceRanks, sourceAnchorId } from "./chat-sources";

type MessageRole = ChatHistoryMessage["role"];

interface RenderedMessage {
  content: string;
  /** Conversación a la que pertenece (la API puede abrir otra por cambio de tema). */
  conversationId?: string;
  id: string;
  inReplyToMessageId: string | null;
  modules?: ClarificationModule[];
  role: MessageRole;
  sources: ChatSource[];
  /** La consulta empezó una conversación nueva por cambio de tema. */
  startsNewTopic?: boolean;
  /** Consulta guardada que no recibió respuesta (fallo técnico o corte). */
  unanswered?: boolean;
}

/** Tras este tiempo sin respuesta se avisa que el servicio puede estar activándose. */
const COLD_START_NOTICE_MS = 12_000;
// Una respuesta (con arranque en frío incluido) no tarda más que esto: pasado
// ese tiempo, la última pregunta sin respuesta ya no está en curso.
const STALE_QUESTION_MS = 3 * 60_000;

interface ChatPanelProps {
  initialConversation?: ChatConversationDetail;
  initialModuleId?: string;
  modules: ChatModule[];
  role?: "docente" | "admin" | "superadmin";
}

export function canPrepareOrientation(
  message: Pick<
    RenderedMessage,
    "id" | "inReplyToMessageId" | "role" | "sources"
  >,
  conversationId: string | undefined,
  hasLinkedVisibleQuestion: boolean,
): boolean {
  return Boolean(
    conversationId &&
    message.inReplyToMessageId &&
    hasLinkedVisibleQuestion &&
    message.id !== "streaming" &&
    message.role === "assistant" &&
    message.sources.length > 0,
  );
}

function initialMessages(
  conversation: ChatConversationDetail | undefined,
): RenderedMessage[] {
  const messages = conversation?.messages ?? [];
  const answeredIds = new Set(
    messages.map((message) => message.inReplyToMessageId).filter(Boolean),
  );
  const now = Date.now();
  return messages.map((message, index) => ({
    content: message.content,
    conversationId: conversation?.conversation.id,
    id: message.id,
    inReplyToMessageId: message.inReplyToMessageId,
    role: message.role,
    sources: message.sources,
    // La última pregunta puede estar respondiéndose todavía (p. ej. al retomar
    // desde el Historial mientras se genera): se marca si hubo mensajes
    // después o si pasó más tiempo del que tarda una respuesta.
    unanswered:
      message.role === "user" &&
      !answeredIds.has(message.id) &&
      (index < messages.length - 1 ||
        now - Date.parse(message.createdAt) > STALE_QUESTION_MS),
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

interface CitationContext {
  messageId: string;
  sources: ChatSource[];
}

/**
 * Convierte cada cita [n] en un enlace a la fila n de «Referencias» (Hito 3,
 * punto 8): el usuario ve de dónde sale cada afirmación sin buscarla. Una cita
 * sin fuente correspondiente queda como texto.
 */
function linkCitations(
  text: string,
  citations: CitationContext | undefined,
  keyPrefix: string,
): ReactNode[] {
  if (!citations?.sources.length) return [text];
  // Tolera la cita doble ([[4]]) que a veces escribe el modelo.
  return text.split(/(\[\[?\d+\]\]?)/u).map((part, index) => {
    const rank = Number(part.match(/^\[\[?(\d+)\]\]?$/u)?.[1]);
    const source = rank
      ? citations.sources.find((item) => item.rank === rank)
      : undefined;
    if (!source) return part;
    return (
      <a
        aria-label={`Ver fuente ${rank}: ${source.documentTitle}`}
        className="avend-chat-citation"
        href={`#${sourceAnchorId(citations.messageId, rank)}`}
        key={`${keyPrefix}-${index}`}
      >
        [{rank}]
      </a>
    );
  });
}

/** Resalta frases clave con **negrita** sin inyectar HTML (guía §6). El resto
 * del cuerpo se mantiene en texto normal (negro); el azul se reserva para
 * acentos, enlaces y estados. */
function renderInline(text: string, citations?: CitationContext): ReactNode[] {
  return text.split("**").map((segment, index) => {
    const parts = linkCitations(segment, citations, `c${index}`);
    if (index % 2 === 1) return <strong key={index}>{parts}</strong>;
    return parts.length === 1 && typeof parts[0] === "string" ? (
      parts[0]
    ) : (
      <Fragment key={index}>{parts}</Fragment>
    );
  });
}

const headingPattern = /^#{1,6}\s+(.+)$/;
const unorderedListItemPattern = /^\s*[-*•]\s+(.+)$/;
const orderedListItemPattern = /^\s*\d+[.)]\s+(.+)$/;
const persistedMessageIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function renderRichContent(
  content: string,
  citations?: CitationContext,
): ReactNode[] {
  const blocks: ReactNode[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];
  let listOrdered = false;

  function flushParagraph() {
    if (paragraphLines.length === 0) return;
    const paragraph = paragraphLines.join(" ");
    blocks.push(
      <p className="avend-chat-paragraph" key={`paragraph-${blocks.length}`}>
        {renderInline(paragraph, citations)}
      </p>,
    );
    paragraphLines = [];
  }

  function flushList() {
    if (listItems.length === 0) return;
    const List = listOrdered ? "ol" : "ul";
    blocks.push(
      <List className="avend-chat-list" key={`list-${blocks.length}`}>
        {listItems.map((item, index) => (
          <li key={`${index}-${item}`}>{renderInline(item, citations)}</li>
        ))}
      </List>,
    );
    listItems = [];
  }

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    // Un encabezado Markdown ("### Misión del cargo") se muestra como texto
    // destacado, sin los símbolos #.
    const heading = line.match(headingPattern)?.[1];
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push(
        <p
          className="avend-chat-paragraph avend-chat-paragraph--heading"
          key={`heading-${blocks.length}`}
        >
          <strong>
            {renderInline(heading.replaceAll("**", ""), citations)}
          </strong>
        </p>,
      );
      continue;
    }

    const unorderedMatch = line.match(unorderedListItemPattern);
    const orderedMatch = line.match(orderedListItemPattern);
    const nextListOrdered = Boolean(orderedMatch);
    const listItem = orderedMatch?.[1] ?? unorderedMatch?.[1];

    if (listItem) {
      flushParagraph();
      if (listItems.length > 0 && nextListOrdered !== listOrdered) flushList();
      listOrdered = nextListOrdered;
      listItems.push(listItem);
      continue;
    }

    flushList();
    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();
  return blocks;
}

function relatedRouteLabel(message: RenderedMessage): string | null {
  const relatedSource = message.sources.find(
    (source) => source.relatedModuleName,
  );
  if (!relatedSource?.relatedModuleName) return null;
  return relatedSource.relatedSubmoduleName
    ? `${relatedSource.relatedModuleName} › ${relatedSource.relatedSubmoduleName}`
    : relatedSource.relatedModuleName;
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
  const questionInputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Contador monotónico para keys locales estables (evita colisiones de key de
  // React entre mensajes creados en el cliente, independiente de crypto.randomUUID).
  const localIdRef = useRef(0);
  // Estado mutable del turno en streaming (conversación, fuentes y pregunta
  // guardada); un solo turno a la vez por la guarda de isStreaming.
  const turnRef = useRef<{
    conversationId?: string;
    sources: ChatSource[];
    userMessageId: string | null;
  }>({ sources: [], userMessageId: null });
  // «Otra consulta» a secas: la próxima pregunta abre una conversación nueva y
  // se marca en pantalla como tema nuevo.
  const pendingNewTopicRef = useRef(false);

  function nextLocalId(prefix: string): string {
    localIdRef.current += 1;
    return `${prefix}-${localIdRef.current}`;
  }
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
            modules.filter(
              (module) => module.parentModuleId === activeParentId,
            ),
          )
        : [],
    [modules, activeParentId],
  );
  // Etiqueta de contexto: solo cuando el usuario elige un submódulo concreto.
  const selectedSubmodule = useMemo(() => {
    const selected = modules.find((module) => module.id === selectedModuleId);
    return selected && selected.parentModuleId ? selected : undefined;
  }, [modules, selectedModuleId]);
  const latestReportableAnswerId = useMemo(
    () =>
      [...messages]
        .reverse()
        .find(
          (message) =>
            message.role !== "user" &&
            persistedMessageIdPattern.test(message.id),
        )?.id,
    [messages],
  );

  function changeModuleContext(
    moduleId: string | undefined,
    forceNewConversation = false,
  ) {
    if (
      isStreaming ||
      (!forceNewConversation && moduleId === selectedModuleId)
    ) {
      return;
    }
    const shouldMoveFocusToComposer = Boolean(
      document.activeElement instanceof HTMLElement &&
      document.activeElement.closest(".avend-chat-page"),
    );
    // Una conversación conserva el módulo con el que fue creada. Cambiar el
    // contexto inicia la siguiente consulta en una conversación nueva, sin
    // esperar una nueva navegación de servidor.
    setSelectedModuleId(moduleId);
    setConversationId(undefined);
    setMessages([]);
    setError(null);
    const selectedModule = modules.find((module) => module.id === moduleId);
    setStatus(
      selectedModule
        ? `Tema actualizado: ${selectedModule.name}.`
        : "Chat general activado.",
    );
    window.history.replaceState(
      null,
      "",
      moduleId ? `/chat?module=${encodeURIComponent(moduleId)}` : "/chat",
    );
    if (shouldMoveFocusToComposer) {
      queueMicrotask(() => questionInputRef.current?.focus());
    }
  }

  function clearSubmodule() {
    changeModuleContext(activeParentId);
  }

  function startNewChat() {
    changeModuleContext(undefined, true);
  }

  useEffect(() => {
    return () => {
      const recognition = recognitionRef.current;
      if (recognition) {
        recognition.onend = null;
        recognition.onerror = null;
        recognition.onresult = null;
        recognition.stop();
      }
      recognitionRef.current = null;
    };
  }, []);

  function stopDictation() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsDictating(false);
    setStatus("Dictado detenido. Revisa el texto antes de enviarlo.");
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
        setStatus("Dictado añadido. Revisa el texto antes de enviarlo.");
      }
    };
    let recognitionFailed = false;
    recognition.onerror = () => {
      recognitionFailed = true;
      recognitionRef.current = null;
      setIsDictating(false);
      setStatus(
        "No se pudo usar el micrófono. Escribe tu consulta o revisa el permiso del navegador.",
      );
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setIsDictating(false);
      if (!recognitionFailed) {
        setStatus("Dictado finalizado. Revisa el texto antes de enviarlo.");
      }
    };

    recognitionRef.current = recognition;
    setIsDictating(true);
    setStatus("Escuchando el dictado…");
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setIsDictating(false);
      setStatus(
        "No se pudo iniciar el micrófono. Escribe tu consulta o revisa el permiso del navegador.",
      );
    }
  }

  function replacePendingResponseMessage(
    update: (message: RenderedMessage) => RenderedMessage,
  ) {
    setMessages((current) => {
      const latest = current.at(-1);
      if (
        !latest ||
        (latest.id !== "streaming" &&
          !latest.id.startsWith("clarification-") &&
          !latest.id.startsWith("no-evidence-"))
      ) {
        return current;
      }
      return [...current.slice(0, -1), update(latest)];
    });
  }

  function discardStreamingMessage(
    message: string,
    retryQuestion?: string,
    unpersistedQuestionId?: string,
    persistedQuestionId?: string | null,
  ) {
    setMessages((current) =>
      current
        .filter((item, index) => {
          if (item.id === "streaming" || item.id === unpersistedQuestionId) {
            return false;
          }
          const isLatest = index === current.length - 1;
          return !(
            isLatest &&
            (item.id.startsWith("clarification-") ||
              item.id.startsWith("no-evidence-"))
          );
        })
        // La consulta ya quedó guardada sin respuesta: se avisa en pantalla (y
        // en el historial) para que el usuario sepa que puede reenviarla.
        .map((item) =>
          persistedQuestionId && item.id === persistedQuestionId
            ? { ...item, unanswered: true }
            : item,
        ),
    );
    if (retryQuestion) {
      setQuestion((current) => current || retryQuestion);
    }
    setError(message);
    setStatus(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendQuestion(question.trim());
  }

  /**
   * Responde una aclaración con un clic: reenvía la pregunta original en una
   * conversación nueva del tema elegido, sin obligar a reescribirla (Hito 3,
   * punto 5). Si la pregunta no está en pantalla, solo cambia el tema.
   */
  function answerClarification(
    clarification: RenderedMessage,
    module: ClarificationModule,
  ) {
    if (isStreaming) return;
    const original = messages.find(
      (message) =>
        message.role === "user" &&
        message.id === clarification.inReplyToMessageId,
    )?.content;
    if (!original) {
      changeModuleContext(module.id);
      return;
    }
    setSelectedModuleId(module.id);
    // Sin la conversación anterior: si el reenvío falla, el reintento también
    // empieza una conversación nueva en el tema elegido.
    setConversationId(undefined);
    void sendQuestion(original, {
      fromClarification: true,
      moduleId: module.id,
      newConversation: true,
    });
  }

  async function sendQuestion(
    normalizedQuestion: string,
    options: {
      fromClarification?: boolean;
      moduleId?: string;
      newConversation?: boolean;
    } = {},
  ) {
    if (!normalizedQuestion || isStreaming) return;
    if (isDictating) stopDictation();

    // El módulo solo se envía al INICIAR una conversación: al continuarla, el
    // servidor usa el módulo guardado. Reenviar el módulo de la pantalla tras
    // un cambio de tema abría otra conversación sin contexto (punto 6).
    const targetConversationId = options.newConversation
      ? undefined
      : conversationId;
    const targetModuleId = options.moduleId ?? selectedModuleId;
    const hadVisibleMessages = messages.length > 0;
    const announcedNewTopic = pendingNewTopicRef.current;
    pendingNewTopicRef.current = false;
    const abortController = new AbortController();
    const localQuestionId = nextLocalId("local-question");
    // Estado del turno en curso: se completa a medida que llegan los eventos.
    turnRef.current = { sources: [], userMessageId: null };
    const turn = turnRef.current;
    let receivedFrame = false;
    const coldStartTimer = window.setTimeout(() => {
      if (!receivedFrame) {
        setStatus(
          "Estamos activando el servicio; la primera consulta del día puede tardar hasta un minuto.",
        );
      }
    }, COLD_START_NOTICE_MS);
    const discardCurrentRequest = (message: string) =>
      discardStreamingMessage(
        message,
        normalizedQuestion,
        localQuestionId,
        turn.userMessageId,
      );
    setMessages((current) => [
      ...current,
      {
        content: normalizedQuestion,
        id: localQuestionId,
        inReplyToMessageId: null,
        role: "user",
        sources: [],
      },
    ]);
    setIsStreaming(true);
    setQuestion("");
    setError(null);
    setStatus("Buscando sustento en los documentos aplicables…");

    try {
      let completionStatus = "Respuesta lista.";
      const response = await fetch("/api/chat/stream", {
        body: JSON.stringify({
          ...(targetConversationId
            ? { conversationId: targetConversationId }
            : {}),
          ...(!targetConversationId && targetModuleId
            ? { moduleId: targetModuleId }
            : {}),
          question: normalizedQuestion,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        signal: abortController.signal,
      });

      if (!response.ok || !response.body) {
        discardCurrentRequest(requestError(response));
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
          receivedFrame = true;
          let payload: unknown;
          try {
            payload = JSON.parse(frame.data);
          } catch {
            discardCurrentRequest(
              "La respuesta recibida no tiene un formato válido.",
            );
            return;
          }

          if (frame.event === "conversation") {
            const result =
              chatStreamPayloadSchemas.conversation.safeParse(payload);
            if (!result.success) {
              discardCurrentRequest(
                "La conversación recibida no tiene un formato válido.",
              );
              return;
            }
            turnRef.current.userMessageId = result.data.userMessageId;
            turnRef.current.conversationId = result.data.conversationId;
            // La API abrió otra conversación (cambio de tema): se marca en
            // pantalla para que el usuario sepa dónde quedó cada parte.
            const startsNewTopic = Boolean(
              !options.fromClarification &&
              result.data.startedNewConversation &&
              hadVisibleMessages &&
              (announcedNewTopic ||
                (conversationId &&
                  conversationId !== result.data.conversationId)),
            );
            setConversationId(result.data.conversationId);
            if (startsNewTopic && result.data.moduleId !== undefined) {
              setSelectedModuleId(result.data.moduleId ?? undefined);
            }
            setMessages((current) => {
              const localQuestionIndex = current.findLastIndex(
                (message) =>
                  message.role === "user" &&
                  message.id.startsWith("local-question-"),
              );
              if (localQuestionIndex < 0) return current;

              return current.map((message, index) =>
                index === localQuestionIndex
                  ? {
                      ...message,
                      conversationId: result.data.conversationId,
                      id: result.data.userMessageId,
                      startsNewTopic,
                    }
                  : message,
              );
            });
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
              discardCurrentRequest(
                "Las referencias recibidas no tienen un formato válido.",
              );
              return;
            }
            turnRef.current.sources = result.data.sources;
            setStatus("Redactando una respuesta con el sustento encontrado…");
            continue;
          }

          if (frame.event === "token") {
            const result = chatStreamPayloadSchemas.token.safeParse(payload);
            if (!result.success) {
              discardCurrentRequest(
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
                  conversationId: turn.conversationId,
                  id: "streaming",
                  inReplyToMessageId: turn.userMessageId,
                  role: "assistant",
                  sources: turn.sources,
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
              discardCurrentRequest(
                "La aclaración recibida no tiene un formato válido.",
              );
              return;
            }
            setMessages((current) => [
              ...current,
              {
                content: result.data.message,
                conversationId: turn.conversationId,
                id: nextLocalId("clarification"),
                inReplyToMessageId: turn.userMessageId,
                modules: result.data.modules,
                role: "clarification",
                sources: turn.sources,
              },
            ]);
            completionStatus = "Se necesita una aclaración para continuar.";
            setStatus(completionStatus);
            continue;
          }

          if (frame.event === "conversational") {
            const result =
              chatStreamPayloadSchemas.conversational.safeParse(payload);
            if (!result.success) {
              discardCurrentRequest(
                "La respuesta recibida no tiene un formato válido.",
              );
              return;
            }
            if (result.data.startsNewTopic) {
              setConversationId(undefined);
              pendingNewTopicRef.current = true;
              window.history.replaceState(
                null,
                "",
                selectedModuleId
                  ? `/chat?module=${encodeURIComponent(selectedModuleId)}`
                  : "/chat",
              );
            }
            setMessages((current) => [
              ...current,
              {
                content: result.data.message,
                id: nextLocalId("conversational"),
                inReplyToMessageId: null,
                role: "assistant",
                sources: [],
              },
            ]);
            completionStatus = "Listo.";
            setStatus(completionStatus);
            completed = true;
            continue;
          }

          if (frame.event === "no_evidence") {
            const result =
              chatStreamPayloadSchemas.no_evidence.safeParse(payload);
            if (!result.success) {
              discardCurrentRequest(
                "El resultado recibido no tiene un formato válido.",
              );
              return;
            }
            setMessages((current) => [
              ...current.filter((message) => message.id !== "streaming"),
              {
                content: result.data.message,
                conversationId: turn.conversationId,
                id: nextLocalId("no-evidence"),
                inReplyToMessageId: turn.userMessageId,
                role: "no_evidence",
                sources: [],
              },
            ]);
            completionStatus =
              "No se encontró sustento suficiente en los documentos disponibles.";
            setStatus(completionStatus);
            continue;
          }

          if (frame.event === "error") {
            const result = chatStreamPayloadSchemas.error.safeParse(payload);
            discardCurrentRequest(
              result.success && result.data.code === "CHAT_STREAM_FAILED"
                ? "No se pudo completar la respuesta. No se guardó contenido parcial."
                : "La consulta no se pudo completar.",
            );
            return;
          }

          if (frame.event === "done") {
            const result = chatStreamPayloadSchemas.done.safeParse(payload);
            if (!result.success) {
              discardCurrentRequest(
                "El cierre de la respuesta no tiene un formato válido.",
              );
              return;
            }
            replacePendingResponseMessage((message) => ({
              ...message,
              id: result.data.messageId,
              inReplyToMessageId: result.data.inReplyToMessageId,
            }));
            setStatus(completionStatus);
            completed = true;
          }
        }

        if (done && !completed) {
          discardCurrentRequest(
            "Se interrumpió la conexión. No se guardó contenido parcial.",
          );
          return;
        }
      }
    } catch {
      discardCurrentRequest(
        "Se interrumpió la conexión. No se guardó contenido parcial.",
      );
    } finally {
      window.clearTimeout(coldStartTimer);
      setIsStreaming(false);
    }
  }

  return (
    <TeacherShell
      activeSection="chat"
      moduleNavigationDisabled={isStreaming}
      modules={modules}
      onModuleSelect={changeModuleContext}
      onNewChat={startNewChat}
      role={role}
      selectedModuleId={activeParentId}
    >
      <section aria-labelledby="chat-title" className="avend-chat-page">
        <div
          className="avend-chat-workspace-transition"
          key={selectedModuleId ?? activeParentId ?? "general"}
        >
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
              {activeParent && submodules.length > 0 ? (
                <p>
                  Selecciona el tema relacionado si lo deseas. También puedes
                  escribir directamente tu consulta.
                </p>
              ) : null}
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
                  <span aria-hidden="true" className="avend-chat-module-icon">
                    <svg fill="none" viewBox="0 0 24 24">
                      <path d="M7 3.75h7L18 7.7v12.55H7z" />
                      <path d="M14 3.75V8h4M10 12h5M10 15.5h5" />
                    </svg>
                  </span>
                  <span className="avend-chat-module-name">
                    {submodule.name}
                  </span>
                </button>
              ))}
            </section>
          ) : null}

          {selectedSubmodule ? (
            <div className="avend-chat-context" role="status">
              <span>
                <strong>Tema:</strong> {selectedSubmodule.name}
              </span>
              <button
                aria-label={`Quitar el tema ${selectedSubmodule.name}`}
                disabled={isStreaming}
                onClick={clearSubmodule}
                type="button"
              >
                <span>Quitar</span>
                <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                  <path d="m7 7 10 10M17 7 7 17" />
                </svg>
              </button>
            </div>
          ) : null}
        </div>

        <section aria-busy={isStreaming} className="avend-chat-conversation">
          {messages.length === 0 ? (
            <p className="avend-chat-empty-state">
              Escribe una consulta para recibir una respuesta respaldada por
              documentos vigentes o, cuando lo solicites expresamente, por sus
              antecedentes históricos identificados con claridad.
            </p>
          ) : (
            messages.map((message, messageIndex) => (
              <article
                className={`avend-chat-message avend-chat-message--${message.role}`}
                key={message.id}
              >
                {message.startsNewTopic ? (
                  <p className="avend-chat-topic-divider" role="note">
                    Nuevo tema: esta consulta se guardó como una conversación
                    nueva en tu Historial.
                  </p>
                ) : null}
                <p className="avend-chat-message-label">
                  {message.role === "user" ? "Tu consulta" : "AVEND ASESOR"}
                </p>
                <div className="avend-chat-message-content">
                  {renderRichContent(
                    message.content,
                    (message.role === "assistant" ||
                      message.role === "clarification") &&
                      message.id !== "streaming"
                      ? { messageId: message.id, sources: message.sources }
                      : undefined,
                  )}
                </div>
                {message.unanswered ? (
                  <p className="avend-chat-unanswered-note" role="note">
                    Esta consulta no se completó por un problema técnico. Puedes
                    volver a enviarla.
                  </p>
                ) : null}
                {relatedRouteLabel(message) ? (
                  <p className="avend-chat-related-route">
                    <strong>Relacionado con:</strong>{" "}
                    {relatedRouteLabel(message)}
                  </p>
                ) : null}
                {message.modules?.length ? (
                  <div className="avend-chat-clarification-options">
                    {message.modules.map((module) => (
                      <button
                        disabled={isStreaming}
                        key={module.id}
                        onClick={() => answerClarification(message, module)}
                        type="button"
                      >
                        Consultar {module.name}
                      </button>
                    ))}
                  </div>
                ) : null}
                {message.sources.length && message.id !== "streaming" ? (
                  <ChatSources
                    citedRanks={
                      message.role === "assistant" ||
                      message.role === "clarification"
                        ? citedSourceRanks(message.content)
                        : undefined
                    }
                    messageId={message.id}
                    sources={message.sources}
                  />
                ) : null}
                {(message.conversationId ?? conversationId) &&
                canPrepareOrientation(
                  message,
                  message.conversationId ?? conversationId,
                  messages
                    .slice(0, messageIndex)
                    .some(
                      (candidate) =>
                        candidate.role === "user" &&
                        candidate.id === message.inReplyToMessageId,
                    ),
                ) ? (
                  <div className="mt-4 flex flex-col items-start gap-2">
                    <Link
                      className="avend-button avend-button--secondary"
                      href={`/chat/${encodeURIComponent(message.conversationId ?? conversationId ?? "")}/orientacion/${encodeURIComponent(message.id)}`}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      Preparar ficha de orientación
                    </Link>
                    <p className="m-0 text-base text-avend-text-muted">
                      Se abrirá una vista previa editable solo en sus datos de
                      presentación.
                    </p>
                  </div>
                ) : null}
              </article>
            ))
          )}
        </section>

        {error ? (
          <div className="avend-chat-error" role="alert">
            <strong>No pudimos completar la consulta.</strong>
            <p>{error}</p>
            <p>Tu texto se conserva para que puedas intentarlo nuevamente.</p>
          </div>
        ) : null}

        <form className="avend-chat-composer" onSubmit={handleSubmit}>
          <label htmlFor="chat-question">Escribe tu consulta</label>
          <div className="avend-chat-input-shell">
            <span aria-hidden="true" className="avend-chat-input-icon">
              <svg fill="none" viewBox="0 0 24 24">
                <circle cx="10.75" cy="10.75" r="6.75" />
                <path d="m16 16 4 4" />
              </svg>
            </span>
            <textarea
              disabled={isStreaming}
              id="chat-question"
              maxLength={8_000}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Escribe tu consulta aquí…"
              ref={questionInputRef}
              required
              rows={2}
              value={question}
            />
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
                <svg
                  aria-hidden="true"
                  className="avend-chat-send-icon"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <path d="m4 4 17 8-17 8 3-8-3-8Z" />
                  <path d="M7 12h14" />
                </svg>
                {isStreaming ? "Consultando…" : "Enviar consulta"}
              </button>
            </div>
          </div>
          <p
            aria-atomic="true"
            aria-live="polite"
            className="avend-chat-status"
          >
            {status ??
              "La respuesta se sustentará en los documentos disponibles."}
          </p>
        </form>
        <ConsultationFeedback
          answerMessageId={latestReportableAnswerId}
          conversationId={conversationId}
          disabled={isStreaming}
        />
      </section>
    </TeacherShell>
  );
}
