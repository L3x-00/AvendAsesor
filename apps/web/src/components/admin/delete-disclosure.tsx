"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import styles from "./delete-disclosure.module.css";

interface DeleteDisclosureProps {
  /** Formulario de la acción (motivo + botón rojo de confirmación). */
  children: ReactNode;
  /** Qué pasará al confirmar, en lenguaje llano. */
  description: ReactNode;
  /** Pregunta de confirmación que encabeza el panel abierto. */
  title: string;
  /** Texto del botón rojo inicial ("Eliminar documento", "Quitar asociación"). */
  triggerLabel: string;
  size?: "compact" | "default";
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path d="M5 7h14M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </svg>
  );
}

/**
 * Acción destructiva en dos pasos, igual en toda la plataforma:
 * 1. Cerrada es solo un botón rojo. No ocupa espacio ni satura la vista.
 * 2. Al tocarlo se despliega, en el mismo lugar, qué va a pasar, el motivo
 *    requerido y la confirmación, con "Cancelar" como salida.
 *
 * Reemplaza al `window.confirm` nativo: la confirmación queda a la vista, con
 * el mismo estilo de la plataforma, y es accesible con teclado.
 */
export function DeleteDisclosure({
  children,
  description,
  size = "default",
  title,
  triggerLabel,
}: DeleteDisclosureProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) {
      // Foco al primer campo visible (el motivo) o, si no hay, al botón de
      // confirmar. Los formularios empiezan con <input type="hidden">, que no
      // puede recibir foco: se excluyen.
      panelRef.current
        ?.querySelector<HTMLElement>(
          "input:not([type='hidden']), select, textarea, button[type='submit']",
        )
        ?.focus();
    } else if (wasOpen.current) {
      // Al cancelar, el foco vuelve al botón que abrió la confirmación.
      triggerRef.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  function close() {
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        aria-expanded={false}
        className={`${styles.trigger} ${size === "compact" ? styles.compact : ""}`}
        onClick={() => setOpen(true)}
        ref={triggerRef}
        type="button"
      >
        <TrashIcon />
        <span>{triggerLabel}</span>
      </button>
    );
  }

  return (
    <div
      aria-labelledby={titleId}
      className={styles.panel}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          close();
        }
      }}
      ref={panelRef}
      role="group"
    >
      <p className={styles.title} id={titleId}>
        {title}
      </p>
      <div className={styles.description}>{description}</div>
      <div className={styles.form}>{children}</div>
      <button className={styles.cancel} onClick={close} type="button">
        Cancelar
      </button>
    </div>
  );
}
