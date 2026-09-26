"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  deleteConversationAction,
  initialHistoryActionState,
  type HistoryActionState,
} from "@/app/(teacher)/history/actions";
import { useToast } from "@/components/ui/toast";
import type { ChatConversation } from "@/lib/chat-api/types";

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

const GROUP_LABELS: Record<HistoryGroup, string> = {
  earlier: "Anteriores",
  today: "Hoy",
  week: "Últimos 7 días",
  yesterday: "Ayer",
};

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

/**
 * Quitar una consulta pide confirmación en el mismo lugar (sin ventanas
 * emergentes): el primer toque muestra la pregunta y las dos salidas.
 */
function ConversationDeleteForm({
  conversationId,
  title,
}: {
  conversationId: string;
  title: string;
}) {
  const { showToast } = useToast();
  const [state, formAction, isPending] = useActionState(
    async (previous: HistoryActionState, formData: FormData) => {
      const result = await deleteConversationAction(previous, formData);
      // Al quitarla, esta tarjeta desaparece junto con la respuesta: el aviso
      // se lanza aquí (el toast vive en la raíz), no desde un efecto de un
      // componente que ya no estará montado.
      if (result.status === "success" && result.message) {
        showToast(result.message);
      }
      return result;
    },
    initialHistoryActionState,
  );
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
    <form action={formAction} className="avend-history-delete-form">
      <input name="conversationId" type="hidden" value={conversationId} />
      {confirming ? (
        <div className="avend-history-confirm" role="group" aria-label={`Quitar «${title}»`}>
          <p>¿Quitar esta consulta de tu historial? Ya no podrás retomarla.</p>
          <div className="avend-history-confirm-actions">
            <button
              aria-busy={isPending}
              className="avend-button avend-button--danger"
              disabled={isPending}
              type="submit"
            >
              {isPending ? "Quitando…" : "Sí, quitar"}
            </button>
            <button
              className="avend-button avend-button--secondary"
              disabled={isPending}
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
      {state.status === "error" && state.message ? (
        <p
          aria-live="polite"
          className="avend-feedback avend-feedback--error"
          role="alert"
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export function ChatHistoryList({
  conversations,
  nextCursor,
  now: nowMs,
}: {
  conversations: ChatConversation[];
  nextCursor: string | null;
  /**
   * Instante de referencia fijado por el servidor: así "Hoy"/"Ayer" coincide
   * entre el HTML del servidor y la hidratación, incluso cerca de medianoche.
   */
  now?: number;
}) {
  if (conversations.length === 0) {
    return (
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
    );
  }

  const now = nowMs === undefined ? new Date() : new Date(nowMs);
  const groups = new Map<HistoryGroup, ChatConversation[]>();
  for (const conversation of conversations) {
    const group = historyGroupOf(conversation.updatedAt, now);
    groups.set(group, [...(groups.get(group) ?? []), conversation]);
  }

  return (
    <div className="avend-history-results">
      {[...groups].map(([group, items]) => (
        <section aria-labelledby={`history-group-${group}`} key={group}>
          <h2 className="avend-history-group-title" id={`history-group-${group}`}>
            {GROUP_LABELS[group]}
          </h2>
          <ul className="avend-history-list">
            {items.map((conversation) => {
              const title = readableConversationTitle(conversation.title);
              return (
                <li className="avend-history-item" key={conversation.id}>
                  <div>
                    <h3 title={conversation.title ?? undefined}>{title}</h3>
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
                    <ConversationDeleteForm
                      conversationId={conversation.id}
                      title={title}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {nextCursor ? (
        <Link
          className="avend-button avend-button--secondary"
          href={`/history?${new URLSearchParams({ cursor: nextCursor }).toString()}`}
        >
          Ver consultas anteriores
        </Link>
      ) : null}
    </div>
  );
}
