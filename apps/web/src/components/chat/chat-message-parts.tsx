"use client";

import { useEffect, useRef, useState } from "react";
import { CITATION_TOKEN } from "./chat-sources";

/** Marca circular del asistente junto a su nombre, como en los chats de IA. */
export function AssistantAvatar() {
  return (
    <span aria-hidden="true" className="avend-chat-avatar">
      <svg fill="none" viewBox="0 0 24 24">
        <path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5l-1.9-5.7-5.6-1.9L10.1 9 12 3.5Z" />
      </svg>
    </span>
  );
}

/**
 * Texto para copiar, igual al que se lee en pantalla: sin las marcas de cita
 * [n] (fuera del chat no enlazan a nada) ni el formato Markdown que el chat ya
 * interpreta (**negrita**, # títulos), para pegarlo limpio en Word o un correo.
 */
export function plainAnswerText(content: string): string {
  return content
    .split(CITATION_TOKEN)
    .filter((_, index) => index % 2 === 0)
    .join("")
    .replace(/^#{1,6}[ \t]+/gmu, "")
    .replace(/\*\*(.+?)\*\*/gu, "$1")
    .replace(/__(.+?)__/gu, "$1")
    .replace(/[ \t]+([.,;:])/gu, "$1")
    .replace(/[ \t]{2,}/gu, " ")
    .trim();
}

/**
 * Preguntas recomendadas bajo la respuesta de catálogo («¿de qué tienes
 * información?»). Tocar una la deja lista en el cuadro para ajustarla y
 * enviarla: nunca se envía sola.
 */
export function SuggestedQuestions({
  disabled,
  onPick,
  questions,
}: {
  disabled?: boolean;
  onPick: (question: string) => void;
  questions: string[];
}) {
  return (
    <section aria-label="Preguntas recomendadas" className="avend-chat-suggested">
      <p className="avend-chat-suggested-title">Preguntas recomendadas</p>
      <ul>
        {questions.map((question, index) => (
          <li key={question} style={{ animationDelay: `${index * 60}ms` }}>
            <button disabled={disabled} onClick={() => onPick(question)} type="button">
              <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                <path d="M5 18.5 3.5 21l3.1-1.1A8.5 8.5 0 1 0 5 18.5Z" />
              </svg>
              <span>{question}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

type CopyState = "copied" | "failed" | "idle";

/** "Copiar respuesta": confirma en el mismo botón y vuelve a su estado. */
export function CopyAnswerButton({ content }: { content: string }) {
  const [state, setState] = useState<CopyState>("idle");
  const resetTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    },
    [],
  );

  async function copy() {
    let next: CopyState = "copied";
    try {
      await navigator.clipboard.writeText(plainAnswerText(content));
    } catch {
      next = "failed";
    }
    setState(next);
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setState("idle"), 2_000);
  }

  const label =
    state === "copied"
      ? "Respuesta copiada"
      : state === "failed"
        ? "No se pudo copiar"
        : "Copiar respuesta";

  return (
    <button
      aria-live="polite"
      className="avend-chat-action"
      data-state={state}
      onClick={copy}
      type="button"
    >
      {state === "copied" ? (
        <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        </svg>
      ) : (
        <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
          <rect height="12" rx="2" width="11" x="9" y="9" />
          <path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" />
        </svg>
      )}
      <span>{label}</span>
    </button>
  );
}
