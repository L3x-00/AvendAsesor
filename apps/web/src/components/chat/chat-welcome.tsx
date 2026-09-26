"use client";

/**
 * Bienvenida del chat vacío: saluda por el nombre, explica en una frase qué
 * se puede preguntar y ofrece consultas de ejemplo. Un ejemplo SOLO rellena
 * el cuadro de texto (nunca envía): la persona lo revisa y lo adapta.
 */
export const CHAT_SUGGESTIONS = [
  "¿Qué requisitos necesito para solicitar una reasignación?",
  "¿Cuántos días de licencia por enfermedad me corresponden?",
  "¿Qué pasa si tengo una inasistencia injustificada?",
  "¿Cuáles son las funciones de un auxiliar de educación?",
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

export function ChatWelcome({ disabled, fullName, onSuggestion }: ChatWelcomeProps) {
  const firstName = firstNameOf(fullName);

  return (
    <div className="avend-chat-welcome">
      <span aria-hidden="true" className="avend-chat-welcome-mark">
        <svg fill="none" viewBox="0 0 24 24">
          <path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5l-1.9-5.7-5.6-1.9L10.1 9 12 3.5Z" />
          <path d="M18.5 3v3M17 4.5h3" />
        </svg>
      </span>
      <h2>{firstName ? `Hola, ${firstName}. ¿En qué te ayudo hoy?` : "¿En qué te ayudo hoy?"}</h2>
      <p className="avend-chat-welcome-text">
        Escribe una consulta sobre procesos, requisitos, plazos, derechos o
        trámites del ámbito educativo. Cada respuesta te muestra de qué
        documento vigente sale la información; si necesitas una norma
        anterior, pídelo expresamente.
      </p>
      <p className="avend-chat-welcome-label" id="chat-suggestions-label">
        Puedes empezar con un ejemplo y adaptarlo a tu caso:
      </p>
      <ul aria-labelledby="chat-suggestions-label" className="avend-chat-suggestions">
        {CHAT_SUGGESTIONS.map((suggestion, index) => (
          <li key={suggestion} style={{ animationDelay: `${160 + index * 70}ms` }}>
            <button
              disabled={disabled}
              onClick={() => onSuggestion(suggestion)}
              type="button"
            >
              <span>{suggestion}</span>
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
