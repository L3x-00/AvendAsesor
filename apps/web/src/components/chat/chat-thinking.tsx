"use client";

import { useEffect, useState } from "react";
import { LatticeLoader } from "@/components/ui/lattice-loader";

/**
 * Lo que el asistente está haciendo mientras aún no llega texto. Las fases son
 * orientativas (el servidor no las informa): dan la sensación de avance real
 * sin prometer tiempos. Tras 20 s se tranquiliza a la persona: un arranque en
 * frío del servidor puede demorar la primera respuesta.
 */
const PHASES: { after: number; label: string }[] = [
  { after: 0, label: "Leyendo tu consulta" },
  { after: 2_500, label: "Buscando en los documentos" },
  { after: 7_000, label: "Preparando la respuesta" },
  { after: 20_000, label: "Sigue trabajando, un momento más" },
];

export function ChatThinking() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = PHASES.slice(1).map(({ after }, index) =>
      window.setTimeout(() => setPhase(index + 1), after),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  return (
    // El avance ya se anuncia en la línea de estado del compositor; aquí es
    // solo visual para no duplicar el anuncio del lector de pantalla.
    <article
      aria-hidden="true"
      className="avend-chat-message avend-chat-message--assistant avend-chat-thinking"
    >
      <p className="avend-chat-message-label">AVEND ASESOR</p>
      <LatticeLoader
        cellSize={7}
        className="avend-chat-thinking-loader"
        label={PHASES[phase].label}
        pattern="orbit"
      />
    </article>
  );
}

/** Marca discreta al pie de una respuesta que todavía se está escribiendo. */
export function ChatWriting() {
  return (
    <span aria-hidden="true" className="avend-chat-writing">
      <LatticeLoader
        cellSize={5}
        fontSize={15}
        label="Redactando"
        pattern="dots"
        showTimer={false}
      />
    </span>
  );
}
