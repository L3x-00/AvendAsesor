"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  deleteConversationAction,
  initialHistoryActionState,
} from "@/app/(teacher)/history/actions";
import type { ChatConversation } from "@/lib/chat-api/types";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

const LEADING_COURTESY =
  /^(?:(?:hola+|buen[oa]s(?: d[ií]as| tardes| noches)?|buen d[ií]a|saludos|estimad[oa]s?|disculpe(?: la molestia)?|por favor|qu[eé] tal)[\s,.;:!¡¿?-]*)+/iu;
const MAX_TITLE_CHARS = 90;

/**
 * Título legible de una conversación: sin el saludo con que empezó la primera
 * consulta (todas empezaban igual y el tema quedaba al final) y acotado.
 */
export function readableConversationTitle(title: string | null): string {
  const topic = (title ?? "").replace(LEADING_COURTESY, "").trim();
  if (!topic) return title?.trim() || "Consulta sin título";
  const capitalized = topic.charAt(0).toLocaleUpperCase("es") + topic.slice(1);
  return capitalized.length > MAX_TITLE_CHARS
    ? `${capitalized.slice(0, MAX_TITLE_CHARS).trimEnd()}…`
    : capitalized;
}

function ConversationDeleteForm({
  conversationId,
}: {
  conversationId: string;
}) {
  const [state, formAction] = useActionState(
    deleteConversationAction,
    initialHistoryActionState,
  );

  return (
    <form action={formAction} className="avend-history-delete-form">
      <input name="conversationId" type="hidden" value={conversationId} />
      <button className="avend-button avend-button--secondary" type="submit">
        Quitar del historial
      </button>
      {state.message ? (
        <p
          aria-live="polite"
          className={`avend-feedback ${state.status === "success" ? "avend-feedback--success" : "avend-feedback--error"}`}
          role={state.status === "error" ? "alert" : "status"}
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
}: {
  conversations: ChatConversation[];
  nextCursor: string | null;
}) {
  if (conversations.length === 0) {
    return (
      <p className="avend-content-empty">
        Aún no tienes consultas guardadas. Cuando realices una consulta, podrás
        retomarla aquí.
      </p>
    );
  }

  return (
    <div className="avend-history-results">
      <ul className="avend-history-list">
        {conversations.map((conversation) => (
          <li className="avend-history-item" key={conversation.id}>
            <div>
              <h2 title={conversation.title ?? undefined}>
                {readableConversationTitle(conversation.title)}
              </h2>
              <p>Última actualización: {formatDate(conversation.updatedAt)}</p>
            </div>
            <div className="avend-history-actions">
              <Link
                className="avend-button avend-button--primary"
                href={`/chat/${conversation.id}`}
              >
                Retomar consulta
              </Link>
              <ConversationDeleteForm conversationId={conversation.id} />
            </div>
          </li>
        ))}
      </ul>
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
