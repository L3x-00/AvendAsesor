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
  ChatUpdate,
} from "@/lib/chat-api/types";
import { chatStreamPayloadSchemas } from "@/lib/chat-api/types";
import { TeacherShell } from "@/components/teacher/teacher-shell";
import { VoicePill } from "@/components/ui/voice-pill";
import {
  AssistantAvatar,
  CopyAnswerButton,
  SuggestedQuestions,
} from "./chat-message-parts";
import { ChatThinking, ChatWriting } from "./chat-thinking";
import {
  linkifyOfficialEntities,
  startsSuggestions,
  ThoughtDuration,
  withoutLegacyLeadIn,
} from "./official-links";
import { ChatWelcome } from "./chat-welcome";
import { ConsultationFeedback } from "./consultation-feedback";
import { ModuleOverviewCard } from "./module-overview";
import {
  CITATION_TOKEN,
  ChatSources,
  citationRanks,
  citedSourceRanks,
  sourceAnchorId,
  sourceCitationLabel,
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
  /** Preguntas recomendadas (respuesta de catálogo): se ofrecen como botones. */
  suggestions?: string[];
  /** Consulta guardada que no recibió respuesta (fallo técnico o corte). */
  unanswered?: boolean;
  /** Segundos que tardó el asistente en responder («Pensado por …»). */
  thoughtSeconds?: number;
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
  /**
   * La consulta de esta conversación quedó sin sustento y la administración
   * ya cargó la documentación: se invita a volver a preguntar.
   */
  resolvedUpdate?: ChatUpdate;
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

/** Marca de inicio de un turno (fuera del render: lo llama el envío). */
function turnStartedAt(): number {
  return Date.now();
}

/** Segundos enteros transcurridos, con un mínimo de 1. */
function secondsSince(startedAt: number): number {
  return Math.max(1, Math.round((Date.now() - startedAt) / 1000));
}

/**
 * «Pensado por …» de una respuesta guardada: tiempo entre la pregunta y la
 * respuesta. Se omite si las fechas no son coherentes.
 */
function thoughtSecondsFor(
  message: ChatConversationDetail["messages"][number],
  createdAtById: Map<string, string>,
): number | undefined {
  if (message.role === "user" || !message.inReplyToMessageId) return undefined;
  const askedAt = createdAtById.get(message.inReplyToMessageId);
  if (!askedAt) return undefined;
  const seconds = (Date.parse(message.createdAt) - Date.parse(askedAt)) / 1000;
  return Number.isFinite(seconds) && seconds > 0 && seconds < 600
    ? seconds
    : undefined;
}

function initialMessages(
  conversation: ChatConversationDetail | undefined,
): RenderedMessage[] {
  const messages = conversation?.messages ?? [];
  const createdAtById = new Map(
    messages.map((message) => [message.id, message.createdAt]),
  );
  const answeredIds = new Set(
    messages.map((message) => message.inReplyToMessageId).filter(Boolean),
  );
  const now = Date.now();
  return messages.map((message, index) => ({
    // Las orientaciones guardadas antes del 2026-10-01 abrían con una etiqueta
    // que restaba confianza; se oculta al mostrarlas.
    content:
      message.role === "no_evidence"
        ? withoutLegacyLeadIn(message.content)
        : message.content,
    conversationId: conversation?.conversation.id,
    id: message.id,
    inReplyToMessageId: message.inReplyToMessageId,
    role: message.role,
    sources: message.sources,
    thoughtSeconds: thoughtSecondsFor(message, createdAtById),
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
 * punto 8): el usuario ve de dónde sale cada afirmación sin buscarla. Se
 * omiten los índices inexistentes de respuestas antiguas.
 */
function linkCitations(
  text: string,
  citations: CitationContext | undefined,
  keyPrefix: string,
): ReactNode[] {
  if (!citations?.sources.length) return [text];
  const link = (rank: number, key: string) => {
    const source = citations.sources.find((item) => item.rank === rank);
    if (!source) return null;
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
        {sourceCitationLabel(source)}
      </a>
    );
  };
  // También corrige las citas agrupadas de conversaciones ya guardadas.
  return text.split(CITATION_TOKEN).map((part, index) => {
    const ranks = index % 2 === 1 ? citationRanks(part) : [];
    if (!ranks.length) return part;
    const known = [...new Set(ranks)].filter((rank) =>
      citations.sources.some((item) => item.rank === rank),
    );
    if (!known.length) return "";
    const key = `${keyPrefix}-${index}`;
    if (known.length === 1) return link(known[0], key);
    return (
      <Fragment key={key}>
        {known.map((rank, position) => (
          <Fragment key={`${key}-${position}`}>
            {position ? " " : ""}
            {link(rank, `${key}-${position}-link`)}
          </Fragment>
        ))}
      </Fragment>
    );
  });
}

/** Resalta frases clave con **negrita** sin inyectar HTML (guía §6). El resto
 * del cuerpo se mantiene en texto normal (negro); el azul se reserva para
 * acentos, enlaces y estados. */
function renderInline(
  text: string,
  citations?: CitationContext,
  linkOfficialSites = false,
): ReactNode[] {
  return text.split("**").map((segment, index) => {
    const cited = linkCitations(segment, citations, `c${index}`);
    // En las sugerencias, MINEDU, UGEL, SUNEDU… enlazan a su portal oficial.
    const parts = linkOfficialSites
      ? cited.flatMap((part, partIndex) =>
          typeof part === "string"
            ? linkifyOfficialEntities(part, `o${index}-${partIndex}`)
            : [part],
        )
      : cited;
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
  officialLinks = false,
): ReactNode[] {
  const blocks: ReactNode[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];
  let listOrdered = false;
  let inSuggestions = false;

  function flushParagraph() {
    if (paragraphLines.length === 0) return;
    const paragraph = paragraphLines.join(" ");
    blocks.push(
      <p className="avend-chat-paragraph" key={`paragraph-${blocks.length}`}>
        {renderInline(paragraph, citations, inSuggestions)}
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
          <li key={`${index}-${item}`}>
            {renderInline(item, citations, inSuggestions)}
          </li>
        ))}
      </List>,
    );
    listItems = [];
  }

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (officialLinks && !inSuggestions && startsSuggestions(line)) {
      flushParagraph();
      flushList();
      inSuggestions = true;
    }
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
  onerror: ((event?: { error?: string }) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  /** Opcionales: animan la onda del botón cuando el navegador oye sonido. */
  onsoundend?: (() => void) | null;
  onsoundstart?: (() => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

/** Idiomas de dictado en orden de preferencia. */
const DICTATION_LANGUAGES = ["es-PE", "es-ES"];

/**
 * Mensaje según la causa real (código de error del navegador). Antes todo
 * fallo decía «revisa el permiso», aunque el permiso estuviera concedido y la
 * causa fuera silencio, falta de red o un navegador sin servicio de voz.
 */
function dictationErrorMessage(code: string): string {
  switch (code) {
    case "not-allowed":
      return "El navegador bloqueó el micrófono para esta página. Permítelo desde el candado junto a la dirección web y vuelve a intentarlo.";
    case "service-not-allowed":
      return "Este navegador no ofrece dictado por voz en esta página. Prueba con Google Chrome o Microsoft Edge, o escribe tu consulta.";
    case "audio-capture":
      return "No se detectó un micrófono. Revisa que esté conectado y seleccionado en tu equipo.";
    case "network":
      return "El servicio de voz del navegador no respondió. Revisa tu conexión y vuelve a intentarlo, o escribe tu consulta.";
    case "no-speech":
      return "No escuché nada. Toca el micrófono y habla cerca de él.";
    case "language-not-supported":
      return "Este navegador no reconoce el dictado en español. Prueba con Google Chrome o Microsoft Edge, o escribe tu consulta.";
    default:
      return "No se pudo usar el micrófono. Escribe tu consulta o revisa el permiso del navegador.";
  }
}

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
  resolvedUpdate,
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
  const [updateDismissed, setUpdateDismissed] = useState(false);
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
    if (!isStreaming && question.trim())
      composerFormRef.current?.requestSubmit();
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
    if (
      !box ||
      typeof CSS === "undefined" ||
      CSS.supports?.("field-sizing", "content")
    ) {
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
    startDictation(DICTATION_LANGUAGES[0]);
  }

  function startDictation(lang: string) {
    const Recognition = getSpeechRecognition();
    if (!Recognition) return;

    const recognition = new Recognition();
    recognition.lang = lang;
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
    let retryLanguage: string | null = null;
    // Cada sesión solo responde mientras sea la activa: al detenerla o al
    // empezar otra, sus eventos tardíos no reinician ni cancelan nada.
    recognition.onerror = (event) => {
      if (recognitionRef.current !== recognition) return;
      const code = event?.error ?? "";
      // "aborted" llega al detenerlo la propia persona: termina como siempre.
      if (code === "aborted") return;
      recognitionFailed = true;
      // Algunos navegadores no traen español de Perú: se reintenta con el
      // español general antes de avisar.
      const nextLanguage =
        DICTATION_LANGUAGES[DICTATION_LANGUAGES.indexOf(lang) + 1];
      if (code === "language-not-supported" && nextLanguage) {
        retryLanguage = nextLanguage;
        return;
      }
      recognitionRef.current = null;
      setIsDictating(false);
      setIsHearingSound(false);
      setStatus(dictationErrorMessage(code));
    };
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      if (retryLanguage) {
        startDictation(retryLanguage);
        return;
      }
      recognitionRef.current = null;
      setIsDictating(false);
      setIsHearingSound(false);
      if (!recognitionFailed) {
        setStatus("Dictado finalizado. Revisa el texto antes de enviarlo.");
      }
    };

    recognitionRef.current = recognition;
    setIsDictating(true);
    setStatus("Escuchando el dictado… habla cerca del micrófono.");
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
    // Ya volvió a preguntar: el aviso de información nueva cumplió su función.
    setUpdateDismissed(true);

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
    // «Pensado por …»: desde el envío hasta la respuesta completa.
    const startedAt = turnStartedAt();
    const thoughtSeconds = () => secondsSince(startedAt);
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
            discardCurrentRequest(FRIENDLY_ERRORS.malformed);
            return;
          }

          if (frame.event === "conversation") {
            const result =
              chatStreamPayloadSchemas.conversation.safeParse(payload);
            if (!result.success) {
              discardCurrentRequest(FRIENDLY_ERRORS.malformed);
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
              discardCurrentRequest(FRIENDLY_ERRORS.malformed);
              return;
            }
            turnRef.current.sources = result.data.sources;
            setStatus("Redactando una respuesta con el sustento encontrado…");
            continue;
          }

          if (frame.event === "token") {
            const result = chatStreamPayloadSchemas.token.safeParse(payload);
            if (!result.success) {
              discardCurrentRequest(FRIENDLY_ERRORS.malformed);
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
              discardCurrentRequest(FRIENDLY_ERRORS.malformed);
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
              discardCurrentRequest(FRIENDLY_ERRORS.malformed);
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
            const conversationalSeconds = thoughtSeconds();
            setMessages((current) => [
              ...current,
              {
                content: result.data.message,
                id: nextLocalId("conversational"),
                inReplyToMessageId: null,
                role: "assistant",
                sources: [],
                suggestions: result.data.suggestions,
                thoughtSeconds: conversationalSeconds,
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
              discardCurrentRequest(FRIENDLY_ERRORS.malformed);
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
            completionStatus = "Respuesta lista.";
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
              discardCurrentRequest(FRIENDLY_ERRORS.malformed);
              return;
            }
            // «Pensado por …» mide hasta la respuesta completa, igual que al
            // reabrir la conversación desde el Historial.
            const answeredSeconds = thoughtSeconds();
            replacePendingResponseMessage((message) => ({
              ...message,
              id: result.data.messageId,
              inReplyToMessageId: result.data.inReplyToMessageId,
              thoughtSeconds: answeredSeconds,
            }));
            setStatus(completionStatus);
            completed = true;
          }
        }

        if (done && !completed) {
          discardCurrentRequest(FRIENDLY_ERRORS.connection);
          return;
        }
      }
    } catch {
      discardCurrentRequest(FRIENDLY_ERRORS.connection);
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
              <p className="avend-chat-submodules-label">
                Selecciona el tema relacionado si lo deseas (opcional). También
                puedes escribir directamente tu consulta.
              </p>
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

          {messages.length === 0 && (selectedModuleId ?? activeParentId) ? (
            <ModuleOverviewCard
              disabled={isStreaming}
              key={selectedModuleId ?? activeParentId}
              moduleId={(selectedModuleId ?? activeParentId) as string}
              onAsk={(text) => {
                setQuestion(text);
                setStatus(
                  "Pregunta lista en el cuadro: ajústala a tu caso y envíala.",
                );
                questionInputRef.current?.focus();
              }}
            />
          ) : null}
        </div>

        <section aria-busy={isStreaming} className="avend-chat-conversation">
          {resolvedUpdate && !updateDismissed && messages.length > 0 ? (
            <div className="avend-chat-update-note" role="note">
              <p>
                <strong>Hay información nueva.</strong> Desde tu consulta se
                incorporó documentación sobre este tema. Vuelve a preguntar
                para recibir una respuesta con sustento.
              </p>
              {resolvedUpdate.question ? (
                <button
                  className="avend-button avend-button--secondary"
                  disabled={isStreaming}
                  onClick={() => {
                    setQuestion(resolvedUpdate.question ?? "");
                    setStatus(
                      "Consulta lista en el cuadro: revísala y envíala.",
                    );
                    questionInputRef.current?.focus();
                  }}
                  type="button"
                >
                  Volver a preguntar
                </button>
              ) : null}
            </div>
          ) : null}
          {messages.length === 0 ? (
            <ChatWelcome
              disabled={isStreaming}
              fullName={fullName}
              onSuggestion={(text) => {
                setQuestion(text);
                setStatus(
                  "Ejemplo listo en el cuadro: ajústalo a tu caso y envíalo.",
                );
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
                  <>
                    <p className="avend-chat-message-label">
                      <AssistantAvatar />
                      AVEND ASESOR
                    </p>
                    {message.thoughtSeconds ? (
                      <ThoughtDuration seconds={message.thoughtSeconds} />
                    ) : null}
                  </>
                )}
                <div className="avend-chat-message-content">
                  {renderRichContent(
                    message.content,
                    (message.role === "assistant" ||
                      message.role === "clarification") &&
                      message.id !== "streaming"
                      ? { messageId: message.id, sources: message.sources }
                      : undefined,
                    message.role !== "user",
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
                {message.suggestions?.length ? (
                  <SuggestedQuestions
                    disabled={isStreaming}
                    onPick={(text) => {
                      setQuestion(text);
                      setStatus(
                        "Pregunta lista en el cuadro: ajústala si quieres y envíala.",
                      );
                      window.requestAnimationFrame(() => {
                        const box = questionInputRef.current;
                        if (!box) return;
                        box.focus();
                        box.setSelectionRange(
                          box.value.length,
                          box.value.length,
                        );
                      });
                    }}
                    questions={message.suggestions}
                  />
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
