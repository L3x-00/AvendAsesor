"use client";

import Link from "next/link";
import {
  unstable_isUnrecognizedActionError,
  useRouter,
} from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { flushSync } from "react-dom";
import {
  deleteConversationAction,
  type DeleteConversationResult,
} from "@/app/(teacher)/history/actions";
import { SuccessDialog } from "@/components/ui/success-dialog";
import type { ChatConversation } from "@/lib/chat-api/types";
import styles from "./chat-history-list.module.css";

/**
 * Las fechas se muestran SIEMPRE en hora de Perú. Sin zona fija, el servidor
 * (UTC) y el navegador formateaban distinto: la hora aparecía corrida cinco
 * horas y React reportaba un desajuste al hidratar.
 */
const TIME_ZONE = "America/Lima";

const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: TIME_ZONE,
  year: "numeric",
});
const timeFormatter = new Intl.DateTimeFormat("es-PE", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: TIME_ZONE,
});
const dateFormatter = new Intl.DateTimeFormat("es-PE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: TIME_ZONE,
});

const DAY_MS = 24 * 60 * 60 * 1000;

type HistoryGroup = "earlier" | "today" | "week" | "yesterday";

/** Días calendario (en Lima) entre dos instantes. */
function calendarDaysBetween(value: Date, now: Date): number {
  return Math.round(
    (Date.parse(dayKeyFormatter.format(now)) -
      Date.parse(dayKeyFormatter.format(value))) /
      DAY_MS,
  );
}

export function historyGroupOf(value: string, now: Date): HistoryGroup {
  const days = calendarDaysBetween(new Date(value), now);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return "week";
  return "earlier";
}

export function formatHistoryDate(value: string, now: Date): string {
  const date = new Date(value);
  const group = historyGroupOf(value, now);
  if (group === "today") return `Hoy, ${timeFormatter.format(date)}`;
  if (group === "yesterday") return `Ayer, ${timeFormatter.format(date)}`;
  return dateFormatter.format(date);
}

const LEADING_COURTESY =
  /^¡?(?:(?:(?:hola+|buen[oa]s (?:d[ií]as|tardes|noches)|buen d[ií]a|saludos|estimad[oa]s?|disculpe(?: la molestia)?|por favor|qu[eé] tal)(?=[\s,.;:!?¡¿]|$)|¿qu[eé] tal\?|buenas(?=[,.;:!?¡¿]|\s+¿|$))[\s,.;:!¡-]*)+/iu;
const MAX_TITLE_CHARS = 90;

/**
 * Título legible de una conversación: sin el saludo con que empezó la primera
 * consulta (todas empezaban igual y el tema quedaba al final) y acotado.
 */
export function readableConversationTitle(title: string | null): string {
  const topic = (title ?? "").replace(LEADING_COURTESY, "").trim();
  if (!topic) return title?.trim() || "Consulta sin título";
  // Mayúscula en la primera letra, aunque la pregunta empiece con «¿» o «¡».
  const capitalized = topic.replace(
    /^([¿¡]?)(\p{L})/u,
    (_, mark: string, letter: string) =>
      `${mark}${letter.toLocaleUpperCase("es")}`,
  );
  return capitalized.length > MAX_TITLE_CHARS
    ? `${capitalized.slice(0, MAX_TITLE_CHARS).trimEnd()}…`
    : capitalized;
}

const HISTORY_PATH = "/history";
/** El `h1` de la página (con `tabIndex=-1`): destino del foco de respaldo. */
const HISTORY_TITLE_ID = "history-title";
/** Tras retirar una tarjeta, la lista ignora clics un instante (doble clic). */
const SETTLE_MS = 450;

export const REMOVED_TITLE = "Historial quitado correctamente";
export const REMOVAL_UNCONFIRMED_MESSAGE =
  "No pudimos confirmar si la consulta se quitó. Revisamos tu historial: si desaparece de la lista, ya se quitó; si sigue aquí, inténtalo de nuevo.";
export const REMOVAL_OUTDATED_MESSAGE =
  "La plataforma se actualizó mientras tenías esta página abierta. Recarga la página para poder quitar esta consulta.";

function historyItemId(conversationId: string): string {
  return `history-item-${conversationId}`;
}

interface RemovalError {
  message: string;
  /** La página quedó desactualizada frente a una nueva versión publicada. */
  needsReload: boolean;
}

interface RemovalNotice {
  alreadyRemoved: boolean;
  conversationId: string;
  /** Se quitó desde «Ver consultas anteriores» y se vuelve al inicio. */
  returnedToStart: boolean;
  title: string;
}

interface LoadedPage {
  conversations: ChatConversation[];
  nextCursor: string | null;
  updates: Array<{ conversationId: string; resolvedAt: string }>;
}

function removalDescription(notice: RemovalNotice): string {
  const what = notice.alreadyRemoved
    ? `«${notice.title}» ya se había quitado antes, quizá desde otro dispositivo.`
    : `«${notice.title}» ya no aparece en tu historial.`;
  return notice.returnedToStart
    ? `${what} Te mostramos el inicio de tu historial.`
    : what;
}

/**
 * Quitar una consulta pide confirmación en el mismo lugar: el primer toque
 * muestra la pregunta y las dos salidas. La retirada la hace la lista.
 */
function ConversationRemoveControl({
  error,
  onConfirm,
  title,
}: {
  error: RemovalError | undefined;
  onConfirm: () => void;
  title: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // El foco va a la salida segura: dos Enter seguidos no deben borrar.
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

  function cancel() {
    setConfirming(false);
    queueMicrotask(() => openerRef.current?.focus());
  }

  return (
    <div className="avend-history-delete-form">
      {confirming ? (
        <div
          aria-label={`Quitar «${title}»`}
          className="avend-history-confirm"
          role="group"
        >
          <p>¿Quitar esta consulta de tu historial? Ya no podrás retomarla.</p>
          <div className="avend-history-confirm-actions">
            <button
              className="avend-button avend-button--danger"
              onClick={onConfirm}
              type="button"
            >
              Sí, quitar
            </button>
            <button
              className="avend-button avend-button--secondary"
              onClick={cancel}
              ref={cancelRef}
              type="button"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          className="avend-history-remove"
          onClick={() => setConfirming(true)}
          ref={openerRef}
          type="button"
        >
          <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
            <path d="M5 7h14M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
          </svg>
          Quitar del historial
        </button>
      )}
      {error ? (
        <p className="avend-feedback avend-feedback--error" role="alert">
          {error.message}
        </p>
      ) : null}
      {error?.needsReload ? (
        <button
          className="avend-button avend-button--secondary"
          onClick={() => window.location.reload()}
          type="button"
        >
          Recargar la página
        </button>
      ) : null}
    </div>
  );
}

export function ChatHistoryList({
  conversations,
  loadFailed = false,
  nextCursor,
  now: nowMs,
  updates = [],
}: {
  conversations: ChatConversation[];
  /**
   * El servidor no pudo pedir la lista (falla momentánea del API). En lugar
   * del límite de error se muestra un aviso en línea con «Actualizar» y, si
   * ya se había mostrado una lista, se conserva.
   */
  loadFailed?: boolean;
  nextCursor: string | null;
  /**
   * Conversaciones con una consulta que quedó sin sustento y que la
   * administración ya resolvió: el docente puede volver a preguntar.
   */
  updates?: Array<{ conversationId: string; resolvedAt: string }>;
  /**
   * Instante de referencia fijado por el servidor: así "Hoy"/"Ayer" coincide
   * entre el HTML del servidor y la hidratación, incluso cerca de medianoche.
   */
  now?: number;
}) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const activeRef = useRef(false);
  const [removedIds, setRemovedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [errors, setErrors] = useState<Readonly<Record<string, RemovalError>>>(
    {},
  );
  const [notice, setNotice] = useState<RemovalNotice | null>(null);
  const [settling, setSettling] = useState(false);
  // Última lista que llegó bien. Si una recarga posterior falla (por ejemplo
  // la que sigue a un borrado), se sigue mostrando en vez de vaciar la vista.
  const [lastLoaded, setLastLoaded] = useState<LoadedPage | null>(
    loadFailed ? null : { conversations, nextCursor, updates },
  );
  if (!loadFailed && lastLoaded?.conversations !== conversations) {
    setLastLoaded({ conversations, nextCursor, updates });
  }

  useEffect(() => {
    // Falso al salir de Historial (desmontada u oculta por el router): una
    // respuesta tardía no debe navegar ni abrir avisos en otra sección.
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  const closeNotice = useCallback(() => setNotice(null), []);

  const shown: LoadedPage | null = loadFailed
    ? lastLoaded
    : { conversations, nextCursor, updates };
  const visible = (shown?.conversations ?? []).filter(
    (conversation) => !removedIds.has(conversation.id),
  );

  // El historial se agrupa por tema: módulo raíz (con su submódulo a la vista)
  // y «Consultas generales» para los chats libres. Como llegan ordenadas por
  // actividad, los grupos aparecen con el tema usado más recientemente primero.
  const groups = new Map<string, { items: ChatConversation[]; label: string }>();
  for (const conversation of visible) {
    const key =
      conversation.selectedModuleParentId ??
      conversation.selectedModuleId ??
      "general";
    const label =
      conversation.selectedModuleParentName ??
      conversation.selectedModuleName ??
      (key === "general" ? "Consultas generales" : "Tema seleccionado");
    const group = groups.get(key);
    if (group) {
      group.items.push(conversation);
    } else {
      groups.set(key, { items: [conversation], label });
    }
  }
  // Orden en pantalla (por grupos), para saber qué tarjeta queda al lado.
  const displayOrder = [...groups.values()].flatMap((group) =>
    group.items.map((item) => item.id),
  );

  function isActiveOnHistory(): boolean {
    return activeRef.current && window.location.pathname === HISTORY_PATH;
  }

  async function removeConversation(conversationId: string, title: string) {
    const position = displayOrder.indexOf(conversationId);
    const neighbour =
      displayOrder[position + 1] ?? displayOrder[position - 1] ?? null;

    // Retirada inmediata: la tarjeta sale de la lista antes de que responda
    // el servidor. El foco pasa a la tarjeta vecina (o al título) para que
    // quien usa teclado o lector de pantalla no pierda su lugar.
    flushSync(() => {
      setRemovedIds((current) => new Set(current).add(conversationId));
      setErrors((current) => {
        if (!(conversationId in current)) return current;
        const next = { ...current };
        delete next[conversationId];
        return next;
      });
      setSettling(true);
    });
    globalThis.setTimeout(() => setSettling(false), SETTLE_MS);
    document
      .getElementById(
        neighbour ? historyItemId(neighbour) : HISTORY_TITLE_ID,
      )
      ?.focus();

    let result: DeleteConversationResult;
    try {
      result = await deleteConversationAction(conversationId);
    } catch (error) {
      // El transporte de la Server Action puede fallar en el cliente (red
      // cortada, respuesta que no es del servidor, acción de una versión
      // anterior). Sin esta captura el error subía al límite de la sección.
      result = {
        message: unstable_isUnrecognizedActionError(error)
          ? REMOVAL_OUTDATED_MESSAGE
          : REMOVAL_UNCONFIRMED_MESSAGE,
        status: "error",
      };
    }

    if (result.status === "error") {
      const needsReload = result.message === REMOVAL_OUTDATED_MESSAGE;
      // La conversación vuelve a la lista, con el motivo a la vista.
      flushSync(() => {
        setRemovedIds((current) => {
          const next = new Set(current);
          next.delete(conversationId);
          return next;
        });
        setErrors((current) => ({
          ...current,
          [conversationId]: { message: result.message, needsReload },
        }));
      });
      if (!isActiveOnHistory()) return;
      document.getElementById(historyItemId(conversationId))?.focus();
      // Reconciliar con lo que de verdad quedó en el servidor: si el borrado
      // sí llegó a aplicarse, la recarga la retira.
      if (!needsReload) router.refresh();
      return;
    }

    if (!isActiveOnHistory()) return;
    const onEarlierPage = new URLSearchParams(window.location.search).has(
      "cursor",
    );
    setNotice({
      alreadyRemoved: result.status === "already-removed",
      conversationId,
      returnedToStart: onEarlierPage,
      title,
    });
    // Una sola operación del router. Desde «Ver consultas anteriores» se
    // vuelve a /history limpio por decisión del PO (no porque el cursor quede
    // inválido: la paginación tolera que su fila ya no exista); la navegación
    // ya trae datos frescos. En /history basta con recargar la ruta.
    if (onEarlierPage) {
      router.replace(HISTORY_PATH);
    } else {
      router.refresh();
    }
  }

  const dialog = notice ? (
    <SuccessDialog
      description={removalDescription(notice)}
      key={notice.conversationId}
      onClose={closeNotice}
      returnFocusId={notice.returnedToStart ? HISTORY_TITLE_ID : undefined}
      title={REMOVED_TITLE}
    />
  ) : null;

  const refreshButton = (
    <button
      aria-busy={isRefreshing}
      className="avend-button avend-button--secondary"
      disabled={isRefreshing}
      onClick={() => startRefresh(() => router.refresh())}
      type="button"
    >
      {isRefreshing ? "Actualizando…" : "Actualizar"}
    </button>
  );

  if (!shown) {
    return (
      <>
        <div className={styles.loadNotice} role="status">
          <p>
            No pudimos mostrar tu historial en este momento. Tus consultas
            siguen guardadas; vuelve a intentarlo en unos segundos.
          </p>
          {refreshButton}
        </div>
        {dialog}
      </>
    );
  }

  if (visible.length === 0 && !shown.nextCursor) {
    return (
      <>
        {loadFailed ? null : (
          <div className="avend-history-empty">
            <span aria-hidden="true" className="avend-history-empty-icon">
              <svg fill="none" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="8.5" />
                <path d="M12 7v5l3.5 2" />
              </svg>
            </span>
            <h2>Aún no tienes consultas guardadas</h2>
            <p>
              Cuando realices una consulta, aparecerá aquí para que puedas
              retomarla cuando quieras.
            </p>
            <Link className="avend-button avend-button--primary" href="/chat">
              Hacer una consulta
            </Link>
          </div>
        )}
        {loadFailed ? (
          <div className={styles.loadNotice} role="status">
            <p>
              No pudimos actualizar la lista en este momento. Vuelve a
              intentarlo en unos segundos.
            </p>
            {refreshButton}
          </div>
        ) : null}
        {dialog}
      </>
    );
  }

  const now = nowMs === undefined ? new Date() : new Date(nowMs);
  // Solo mientras la persona no haya vuelto a preguntar en esa conversación.
  const updated = new Set(
    shown.updates
      .filter((update) => {
        const conversation = visible.find(
          (item) => item.id === update.conversationId,
        );
        return (
          conversation !== undefined &&
          Date.parse(conversation.updatedAt) <= Date.parse(update.resolvedAt)
        );
      })
      .map((update) => update.conversationId),
  );
  const updatedVisible = visible.filter((conversation) =>
    updated.has(conversation.id),
  ).length;

  return (
    <>
      <div
        className={
          settling
            ? `avend-history-results ${styles.settling}`
            : "avend-history-results"
        }
      >
        {loadFailed ? (
          <div className={styles.loadNotice} role="status">
            <p>
              No pudimos actualizar la lista en este momento. Lo que ves puede
              no estar al día.
            </p>
            {refreshButton}
          </div>
        ) : null}
        {updatedVisible > 0 ? (
          <p className="avend-history-update-notice" role="status">
            <strong>Hay novedades.</strong>{" "}
            {updatedVisible === 1
              ? "Se incorporó documentación sobre una consulta que antes no tenía respuesta. Ábrela y vuelve a preguntar."
              : `Se incorporó documentación sobre ${updatedVisible} consultas que antes no tenían respuesta. Ábrelas y vuelve a preguntar.`}
          </p>
        ) : null}
        {[...groups].map(([key, group]) => (
          <section aria-labelledby={`history-topic-${key}`} key={key}>
            <h2
              className="avend-history-group-title"
              id={`history-topic-${key}`}
            >
              {group.label}
            </h2>
            <ul className="avend-history-list">
              {group.items.map((conversation) => {
                const title = readableConversationTitle(
                  conversation.lastQuestion ?? conversation.title,
                );
                return (
                  <li
                    className="avend-history-item"
                    id={historyItemId(conversation.id)}
                    key={conversation.id}
                    tabIndex={-1}
                  >
                    <div>
                      <h3 title={conversation.title ?? undefined}>{title}</h3>
                      {conversation.selectedModuleParentId &&
                      conversation.selectedModuleName ? (
                        <p>
                          <span className="avend-visually-hidden">
                            Submódulo:{" "}
                          </span>
                          Submódulo: {conversation.selectedModuleName}
                        </p>
                      ) : null}
                      {updated.has(conversation.id) ? (
                        <span className="avend-history-update-badge">
                          Nueva información disponible
                        </span>
                      ) : null}
                      <p>
                        <span className="avend-visually-hidden">
                          Última actualización:{" "}
                        </span>
                        {formatHistoryDate(conversation.updatedAt, now)}
                      </p>
                    </div>
                    <div className="avend-history-actions">
                      <Link
                        className="avend-button avend-button--primary"
                        href={`/chat/${conversation.id}`}
                      >
                        Retomar consulta
                      </Link>
                      <ConversationRemoveControl
                        error={errors[conversation.id]}
                        onConfirm={() =>
                          void removeConversation(conversation.id, title)
                        }
                        title={title}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {shown.nextCursor ? (
          <Link
            className="avend-button avend-button--secondary"
            href={`/history?${new URLSearchParams({ cursor: shown.nextCursor }).toString()}`}
          >
            Ver consultas anteriores
          </Link>
        ) : null}
      </div>
      {dialog}
    </>
  );
}
