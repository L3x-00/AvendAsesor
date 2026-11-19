"use client";

import { useEffect, useState } from "react";
import { moduleStartersFor } from "./chat-module-starters";

/**
 * Bienvenida del chat vacío. En el chat general saluda por el nombre, explica
 * en una frase qué se puede preguntar y ofrece inicios de consulta. En el chat
 * de un tema presenta el tema a la izquierda y sus preguntas recomendadas a la
 * derecha, en la misma tarjeta ilustrada.
 */
export const CHAT_STARTERS = [
  "¿Qué requisitos necesito para ",
  "¿Qué plazo tengo para ",
  "¿Qué funciones tiene ",
  "¿Qué pasa si ",
] as const;

export const GENERAL_WELCOME_MESSAGES = [
  "¿En qué te ayudo hoy?",
  "Soy tu asesor para resolver dudas académicas.",
  "Te orientaré en procesos, plazos y trámites educativos.",
  "Juntos revisaremos la información vigente que necesitas.",
] as const;

const WELCOME_MESSAGE_INTERVAL_MS = 3_000;

/** Primer nombre legible; si no hay nombre, el saludo queda genérico. */
export function firstNameOf(fullName: string | null | undefined): string | null {
  const first = fullName?.trim().split(/\s+/u)[0];
  if (!first) return null;
  return first.charAt(0).toLocaleUpperCase("es") + first.slice(1).toLocaleLowerCase("es");
}

interface ChatWelcomeProps {
  disabled?: boolean;
  fullName?: string | null;
  onSuggestion: (text: string) => void;
  topicCode?: string | null;
  topicName?: string | null;
}

function useWelcomeMessage(shouldRotate: boolean) {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const reducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (!shouldRotate || reducedMotion) return;

    const intervalId = window.setInterval(() => {
      setMessageIndex((current) =>
        (current + 1) % GENERAL_WELCOME_MESSAGES.length,
      );
    }, WELCOME_MESSAGE_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [shouldRotate]);

  return GENERAL_WELCOME_MESSAGES[messageIndex] ?? GENERAL_WELCOME_MESSAGES[0];
}

/** Mantiene el foco en el cuadro después de insertar un inicio de consulta. */
function placeCaretAtEnd() {
  window.requestAnimationFrame(() => {
    const box = document.getElementById("chat-question");
    if (!(box instanceof HTMLTextAreaElement)) return;
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
  });
}

export function ChatWelcome({
  disabled,
  fullName,
  onSuggestion,
  topicCode,
  topicName,
}: ChatWelcomeProps) {
  const firstName = firstNameOf(fullName);
  const normalizedTopicName = topicName?.trim() ?? "";
  const isGeneralWelcome = normalizedTopicName.length === 0;
  const welcomeMessage = useWelcomeMessage(isGeneralWelcome);

  if (isGeneralWelcome) {
    const heading = welcomeMessage;

    return (
      <div className="avend-chat-welcome avend-chat-welcome--general">
        <h2 aria-live="off">
          {firstName ? `Hola, ${firstName}. ` : null}
          <span className="avend-chat-welcome-message" key={heading}>
            {heading}
          </span>
        </h2>
        <p className="avend-chat-welcome-text">
          Escribe una consulta sobre procesos, requisitos, plazos, derechos o
          trámites del ámbito educativo. Cada respuesta te muestra de qué
          documento vigente sale la información; si necesitas una norma
          anterior, pídelo expresamente.
        </p>
        <p className="avend-chat-welcome-label" id="chat-suggestions-label">
          Empieza con una de estas frases y complétala con tu caso:
        </p>
        <ul
          aria-labelledby="chat-suggestions-label"
          className="avend-chat-suggestions"
        >
          {CHAT_STARTERS.map((starter, index) => (
            <li
              key={starter}
              style={{ animationDelay: `${160 + index * 70}ms` }}
            >
              <button
                disabled={disabled}
                onClick={() => {
                  onSuggestion(starter);
                  placeCaretAtEnd();
                }}
                type="button"
              >
                <span>{`${starter.trimEnd()}…?`}</span>
                <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                  <path d="M5 12h14m0 0-5-5m5 5-5 5" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const starters = moduleStartersFor({
    code: topicCode,
    name: normalizedTopicName,
  });

  return (
    <div className="avend-chat-welcome avend-chat-welcome--topic">
      <div className="avend-chat-topic-intro">
        <span aria-hidden="true" className="avend-chat-topic-art" />
        <h2>
          {firstName ? `Hola, ${firstName}. ` : null}
          Soy tu asesor para resolver dudas sobre{" "}
          <strong>{normalizedTopicName}</strong>.
        </h2>
        <p className="avend-chat-welcome-text">
          Escribe una consulta sobre requisitos, plazos, derechos o trámites
          del ámbito educativo.
        </p>
      </div>
      <div className="avend-chat-topic-questions">
        <p className="avend-chat-welcome-label" id="chat-suggestions-label">
          Preguntas que puedes realizar:
        </p>
        <ul
          aria-labelledby="chat-suggestions-label"
          className="avend-chat-suggestions"
        >
          {starters.map((starter, index) => (
            <li
              key={starter}
              style={{ animationDelay: `${160 + index * 70}ms` }}
            >
              <button
                disabled={disabled}
                onClick={() => {
                  onSuggestion(starter);
                  placeCaretAtEnd();
                }}
                type="button"
              >
                <span>{starter}</span>
                <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                  <path d="M5 12h14m0 0-5-5m5 5-5 5" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
