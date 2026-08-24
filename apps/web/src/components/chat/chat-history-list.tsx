"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  deleteConversationAction,
  initialHistoryActionState,
} from "@/app/history/actions";
import type { ChatConversation } from "@/lib/chat-api/types";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
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
              <h2>{conversation.title ?? "Consulta sin título"}</h2>
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
