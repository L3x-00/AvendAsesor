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
import type { KeyboardEvent, ReactNode } from "react";
import type {
  ChatConversationDetail,
  ChatHistoryMessage,
  ChatModule,
  ChatSource,
  ClarificationModule,
} from "@/lib/chat-api/types";
import { chatStreamPayloadSchemas } from "@/lib/chat-api/types";
import { TeacherShell } from "@/components/teacher/teacher-shell";
import { VoicePill } from "@/components/ui/voice-pill";
import { AssistantAvatar, CopyAnswerButton } from "./chat-message-parts";
import { ChatThinking, ChatWriting } from "./chat-thinking";
import { ChatWelcome } from "./chat-welcome";
import { ConsultationFeedback } from "./consultation-feedback";
import {
  CITATION_TOKEN,
  ChatSources,
  citationRanks,
  citedSourceRanks,
  sourceAnchorId,
} from "./chat-sources";

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
  /** Nombre del perfil, para saludar en la bienvenida y en la barra lateral. */
  fullName?: string | null;
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

/**
 * Mensajes de error en lenguaje llano: dicen qué pasó y qué hacer, sin
 * términos técnicos. La consulta siempre vuelve al cuadro para reenviarla.
 */
export const FRIENDLY_ERRORS = {
  connection:
    "Se cortó la conexión mientras preparábamos la respuesta. Revisa tu internet y vuelve a enviarla; no guardamos una respuesta a medias.",
  forbidden:
    "Tu cuenta no tiene acceso a las consultas en este momento. Si crees que es un error, avisa a la persona responsable de la plataforma.",
  generic:
    "No pudimos procesar tu consulta esta vez. Espera unos segundos y vuelve a enviarla.",
  malformed:
    "Algo no salió bien al recibir la respuesta. Vuelve a enviar tu consulta; si se repite, inténtalo en unos minutos.",
  rateLimited:
    "Enviaste varias consultas seguidas. Espera un minuto y vuelve a enviarla.",
  sessionExpired:
    "Tu sesión se cerró por seguridad. Vuelve a iniciar sesión para continuar.",
  streamFailed:
    "La respuesta se interrumpió antes de terminar y no guardamos una versión a medias. Vuelve a enviar tu consulta.",
  unavailable:
    "El asistente no está disponible en este momento. Inténtalo de nuevo en unos minutos.",
} as const;

function requestError(response: Response): string {
  if (response.status === 401) return FRIENDLY_ERRORS.sessionExpired;
  if (response.status === 403) return FRIENDLY_ERRORS.forbidden;
  if (response.status === 429) return FRIENDLY_ERRORS.rateLimited;
  if (response.status === 503) return FRIENDLY_ERRORS.unavailable;
  return FRIENDLY_ERRORS.generic;
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
 * Las referencias viven plegadas: antes de saltar a la fila de una cita se
 * abren los <details> que la contienen (el ancla sola no los abre en todos
 * los navegadores).
 */
function openEnclosingDetails(targetId: string) {
  let details = document.getElementById(targetId)?.closest("details");
  while (details) {
    details.open = true;
    details = details.parentElement?.closest("details") ?? null;
  }
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
  const link = (rank: number, key: string, label: ReactNode) => {
    const source = citations.sources.find((item) => item.rank === rank);
    if (!source) return label;
    return (
      <a
        aria-label={`Ver fuente ${rank}: ${source.documentTitle}`}
        className="avend-chat-citation"
        href={`#${sourceAnchorId(citations.messageId, rank)}`}
        key={key}
        onClick={() =>
          openEnclosingDetails(sourceAnchorId(citations.messageId, rank))
        }
      >
        {label}
      </a>
    );
  };
  // Tolera la cita doble ([[4]]) y la agrupada ([1, 2], [1-3]) del modelo.
  return text.split(CITATION_TOKEN).map((part, index) => {
    const ranks = index % 2 === 1 ? citationRanks(part) : [];
    const known = ranks.filter((rank) =>
      citations.sources.some((item) => item.rank === rank),
    );
    if (!known.length) return part;
    const key = `${keyPrefix}-${index}`;
    if (ranks.length === 1) return link(ranks[0], key, `[${ranks[0]}]`);
    return (
      <Fragment key={key}>
        [
        {ranks.map((rank, position) => (
          <Fragment key={`${key}-${position}`}>
            {position ? ", " : ""}
            {link(rank, `${key}-${position}-link`, rank)}
          </Fragment>
        ))}
        ]
      </Fragment>
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
  /** Opcionales: animan la onda del botón cuando el navegador oye sonido. */
  onsoundend?: (() => void) | null;
  onsoundstart?: (() => void) | null;
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
  fullName,
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
  const composerFormRef = useRef<HTMLFormElement>(null);
  const conversationEndRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isDictating, setIsDictating] = useState(false);
  const [isHearingSound, setIsHearingSound] = useState(false);
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
  // La invitación a reportar se muestra tras unas consultas (no en la primera).
  const userMessageCount = useMemo(
    () => messages.filter((message) => message.role === "user").length,
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

  /**
   * Como en los asistentes de IA: en computadora, Enter envía y Shift+Enter
   * hace un salto de línea. En pantallas táctiles Enter sigue siendo salto de
   * línea (se envía con el botón), y nunca se envía mientras se compone un
   * carácter con acento en teclados que lo requieren.
   */
  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // keyCode 229: en Safari el Enter que confirma una tilde o un carácter
    // compuesto llega con isComposing ya en false; no debe enviar.
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing ||
      event.keyCode === 229
    ) {
      return;
    }
    const finePointer =
      typeof window.matchMedia !== "function" ||
      window.matchMedia("(pointer: fine)").matches;
    if (!finePointer) return;
    event.preventDefault();
    if (!isStreaming && question.trim()) composerFormRef.current?.requestSubmit();
  }

  function startNewChat() {
    changeModuleContext(undefined, true);
  }

  // El cuadro se desactiva mientras se responde y el foco cae al <body>. Al
  // terminar vuelve al cuadro, para seguir preguntando sin recorrer la página
  // con el tabulador (solo si nadie movió el foco a otro lugar).
  const wasStreamingRef = useRef(false);
  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming) {
      const active = document.activeElement;
      if (!active || active === document.body) {
        questionInputRef.current?.focus({ preventScroll: true });
      }
    }
    wasStreamingRef.current = isStreaming;
  }, [isStreaming]);

  // Donde el navegador no admite `field-sizing: content` (p. ej. Firefox), el
  // cuadro crece con el texto por JS hasta el máximo del CSS.
  useEffect(() => {
    const box = questionInputRef.current;
    if (!box || typeof CSS === "undefined" || CSS.supports?.("field-sizing", "content")) {
      return;
    }
    box.style.height = "auto";
    box.style.height = `${box.scrollHeight}px`;
  }, [question]);

  // Al enviar, al empezar una respuesta o al retomar una conversación, se lleva
  // la vista al último mensaje. No sigue el texto mientras se escribe: así la
  // persona puede leer la respuesta desde el principio sin tirones.
  const awaitingReply = isStreaming && messages.at(-1)?.role === "user";
  useEffect(() => {
    if (messages.length === 0) return;
    const end = conversationEndRef.current;
    if (!end || typeof end.scrollIntoView !== "function") return;
    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    end.scrollIntoView({
      behavior: hasScrolledRef.current && !reduceMotion ? "smooth" : "auto",
      block: "nearest",
    });
    hasScrolledRef.current = true;
  }, [messages.length, awaitingReply]);

  useEffect(() => {
    return () => {
      const recognition = recognitionRef.current;
      if (recognition) {
        recognition.onend = null;
        recognition.onerror = null;
        recognition.onresult = null;
        recognition.onsoundstart = null;
        recognition.onsoundend = null;
        recognition.stop();
      }
      recognitionRef.current = null;
    };
  }, []);

  function stopDictation() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsDictating(false);
    setIsHearingSound(false);
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
    recognition.onsoundstart = () => setIsHearingSound(true);
    recognition.onsoundend = () => setIsHearingSound(false);
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
      setIsHearingSound(false);
      setStatus(
        "No se pudo usar el micrófono. Escribe tu consulta o revisa el permiso del navegador.",
      );
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setIsDictating(false);
      setIsHearingSound(false);
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
              FRIENDLY_ERRORS.malformed,
            );
            return;
          }

          if (frame.event === "conversation") {
            const result =
              chatStreamPayloadSchemas.conversation.safeParse(payload);
            if (!result.success) {
              discardCurrentRequest(
                FRIENDLY_ERRORS.malformed,
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
                FRIENDLY_ERRORS.malformed,
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
                FRIENDLY_ERRORS.malformed,
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
                FRIENDLY_ERRORS.malformed,
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
                FRIENDLY_ERRORS.malformed,
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
                FRIENDLY_ERRORS.malformed,
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
                ? FRIENDLY_ERRORS.streamFailed
                : FRIENDLY_ERRORS.generic,
            );
            return;
          }

          if (frame.event === "done") {
            const result = chatStreamPayloadSchemas.done.safeParse(payload);
            if (!result.success) {
              discardCurrentRequest(
                FRIENDLY_ERRORS.malformed,
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
            FRIENDLY_ERRORS.connection,
          );
          return;
        }
      }
    } catch {
      discardCurrentRequest(
        FRIENDLY_ERRORS.connection,
      );
    } finally {
      window.clearTimeout(coldStartTimer);
      setIsStreaming(false);
    }
  }

  return (
    <TeacherShell
      activeSection="chat"
      fullName={fullName}
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
            <ChatWelcome
              disabled={isStreaming}
              fullName={fullName}
              onSuggestion={(text) => {
                setQuestion(text);
                setStatus("Ejemplo listo en el cuadro: ajústalo a tu caso y envíalo.");
                questionInputRef.current?.focus();
              }}
            />
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
                {message.role === "user" ? (
                  <p className="avend-chat-message-label avend-visually-hidden">
                    Tu consulta
                  </p>
                ) : (
                  <p className="avend-chat-message-label">
                    <AssistantAvatar />
                    AVEND ASESOR
                  </p>
                )}
                <div className="avend-chat-message-content">
                  {renderRichContent(
                    message.content,
                    (message.role === "assistant" ||
                      message.role === "clarification") &&
                      message.id !== "streaming"
                      ? { messageId: message.id, sources: message.sources }
                      : undefined,
                  )}
                  {message.id === "streaming" && isStreaming ? (
                    <ChatWriting />
                  ) : null}
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
                {message.role === "assistant" &&
                message.id !== "streaming" &&
                message.content.trim() ? (
                  <div className="avend-chat-message-actions">
                    <CopyAnswerButton content={message.content} />
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
          {isStreaming && messages.at(-1)?.role === "user" ? (
            <ChatThinking />
          ) : null}
        </section>

        <ConsultationFeedback
          answerMessageId={latestReportableAnswerId}
          conversationId={conversationId}
          disabled={isStreaming}
          userMessageCount={userMessageCount}
        />

        {error ? (
          <div className="avend-chat-error" role="alert">
            <span aria-hidden="true" className="avend-chat-error-icon">
              <svg fill="none" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="8.5" />
                <path d="M12 7.5v5M12 15.8v.01" />
              </svg>
            </span>
            <div className="avend-chat-error-body">
              <strong>No pudimos completar la consulta</strong>
              <p>{error}</p>
              {error === FRIENDLY_ERRORS.sessionExpired ? (
                <a
                  className="avend-button avend-button--primary"
                  href="/auth/sign-in?sesion=caducada"
                >
                  Iniciar sesión
                </a>
              ) : (
                <>
                  <p>Tu consulta sigue escrita en el cuadro de abajo.</p>
                  {/* Reenviar de inmediato no sirve si falta permiso o si se
                      alcanzó el límite: ahí solo cabe esperar o avisar. */}
                  {question.trim() &&
                  !isStreaming &&
                  error !== FRIENDLY_ERRORS.forbidden &&
                  error !== FRIENDLY_ERRORS.rateLimited ? (
                    <button
                      className="avend-button avend-button--secondary"
                      onClick={() => composerFormRef.current?.requestSubmit()}
                      type="button"
                    >
                      Volver a enviar
                    </button>
                  ) : null}
                </>
              )}
            </div>
          </div>
        ) : null}

        <form
          className="avend-chat-composer"
          onSubmit={handleSubmit}
          ref={composerFormRef}
        >
          <label className="avend-visually-hidden" htmlFor="chat-question">
            Escribe tu consulta
          </label>
          <div className="avend-chat-input-shell">
            <textarea
              disabled={isStreaming}
              id="chat-question"
              maxLength={8_000}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder="Escribe tu consulta a AVEND ASESOR…"
              ref={questionInputRef}
              required
              rows={1}
              value={question}
            />
            <div className="avend-chat-composer-buttons">
              {micSupported ? (
                <div
                  className="avend-chat-voice"
                  data-listening={isDictating ? "" : undefined}
                >
                  <VoicePill
                    // Nombre fijo: el estado lo anuncia `aria-pressed`.
                    ariaLabel="Dictar la consulta por voz"
                    disabled={isStreaming}
                    listening={isDictating}
                    onToggle={toggleDictation}
                    soundActive={isHearingSound}
                  />
                  {/* Rótulo visible junto al icono (público 30+). El botón ya
                      tiene nombre accesible, así que aquí es solo visual. */}
                  <span
                    aria-hidden="true"
                    className="avend-chat-voice-label"
                    onClick={isStreaming ? undefined : toggleDictation}
                  >
                    {isDictating ? "Detener" : "Voz"}
                  </span>
                </div>
              ) : null}
              {/* Botón circular solo con ícono, como en los asistentes de IA;
                  el nombre accesible dice qué hace (y "Consultando…" mientras
                  responde). */}
              <button
                aria-label={isStreaming ? "Consultando…" : "Enviar consulta"}
                className="avend-chat-send"
                disabled={isStreaming || !question.trim()}
                title={isStreaming ? "Consultando…" : "Enviar consulta"}
                type="submit"
              >
                {isStreaming ? (
                  <span aria-hidden="true" className="avend-button-spinner" />
                ) : (
                  <svg
                    aria-hidden="true"
                    className="avend-chat-send-icon"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          <p
            aria-atomic="true"
            aria-live="polite"
            className="avend-chat-status"
          >
            {status ??
              "Las respuestas se sustentan en los documentos disponibles."}
          </p>
          <p aria-hidden="true" className="avend-chat-keyboard-hint">
            <kbd>Enter</kbd> para enviar · <kbd>Shift</kbd> + <kbd>Enter</kbd>{" "}
            para una línea nueva
          </p>
        </form>
        {/* Destino del desplazamiento automático: DESPUÉS del error y del
            cuadro de consulta, para que ambos queden a la vista. */}
        <div aria-hidden="true" ref={conversationEndRef} />
      </section>
    </TeacherShell>
  );
}
