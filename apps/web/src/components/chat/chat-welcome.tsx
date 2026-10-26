"use client";

import { useEffect, useState } from "react";

/**
 * Bienvenida del chat vacío: saluda por el nombre, explica en una frase qué
 * se puede preguntar y ofrece inicios de consulta para completar.
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
  topicName,
}: ChatWelcomeProps) {
  const firstName = firstNameOf(fullName);
  const normalizedTopicName = topicName?.trim() ?? "";
  const isGeneralWelcome = normalizedTopicName.length === 0;
  const welcomeMessage = useWelcomeMessage(isGeneralWelcome);
  const heading = isGeneralWelcome
    ? welcomeMessage
    : `Consulta sobre ${normalizedTopicName}.`;

  return (
    <div
      className={`avend-chat-welcome ${
        isGeneralWelcome
          ? "avend-chat-welcome--general"
          : "avend-chat-welcome--topic"
      }`}
    >
      <h2 aria-live="off">
        {isGeneralWelcome && firstName ? `Hola, ${firstName}. ` : null}
        <span
          className={
            isGeneralWelcome ? "avend-chat-welcome-message" : undefined
          }
          key={heading}
        >
          {heading}
        </span>
      </h2>
      {isGeneralWelcome ? (
        <p className="avend-chat-welcome-text">
          Escribe una consulta sobre procesos, requisitos, plazos, derechos o
          trámites del ámbito educativo. Cada respuesta te muestra de qué
          documento vigente sale la información; si necesitas una norma
          anterior, pídelo expresamente.
        </p>
      ) : null}
      <p className="avend-chat-welcome-label" id="chat-suggestions-label">
        Empieza con una de estas frases y complétala con tu caso:
      </p>
      <ul
        aria-labelledby="chat-suggestions-label"
        className="avend-chat-suggestions"
      >
        {CHAT_STARTERS.map((starter, index) => (
          <li key={starter} style={{ animationDelay: `${160 + index * 70}ms` }}>
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
