"use client";

/** Bienvenida compacta del chat vacío. */

/** Primer nombre legible; si no hay nombre, el saludo queda genérico. */
export function firstNameOf(fullName: string | null | undefined): string | null {
  const first = fullName?.trim().split(/\s+/u)[0];
  if (!first) return null;
  return first.charAt(0).toLocaleUpperCase("es") + first.slice(1).toLocaleLowerCase("es");
}

interface ChatWelcomeProps {
  fullName?: string | null;
}

export function ChatWelcome({ fullName }: ChatWelcomeProps) {
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
    </div>
  );
}
