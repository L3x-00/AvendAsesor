"use client";

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
}: ChatWelcomeProps) {
  const firstName = firstNameOf(fullName);

  return (
    <div className="avend-chat-welcome">
      <h2>{firstName ? `Hola, ${firstName}. ¿En qué te ayudo hoy?` : "¿En qué te ayudo hoy?"}</h2>
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
