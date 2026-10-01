"use client";

import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./success-dialog.module.css";

/** Tiempo suficiente para leer una frase corta; se pausa con el puntero encima. */
export const SUCCESS_DIALOG_AUTO_CLOSE_MS = 4000;

interface SuccessDialogProps {
  /** Texto del botón que cierra la ventana. */
  acceptLabel?: string;
  /** Milisegundos hasta el cierre automático; `null` lo desactiva. */
  autoCloseMs?: number | null;
  description?: string;
  onClose: () => void;
  /**
   * Elemento que recibe el foco al cerrar. Si no se indica (o ya no existe),
   * el foco vuelve a donde estaba al abrir la ventana.
   */
  returnFocusId?: string;
  title: string;
}

/**
 * Ventana emergente de confirmación («acción realizada correctamente»).
 *
 * Es un diálogo modal accesible: `role="dialog"` con `aria-modal`, el foco
 * entra en «Aceptar», Tab no sale de la ventana, Escape o un clic fuera la
 * cierran y, al cerrarse, el foco vuelve a un lugar con sentido. Se cierra
 * sola a los pocos segundos (salvo con el puntero encima) y, con
 * `prefers-reduced-motion`, aparece sin animación.
 */
export function SuccessDialog({
  acceptLabel = "Aceptar",
  autoCloseMs = SUCCESS_DIALOG_AUTO_CLOSE_MS,
  description,
  onClose,
  returnFocusId,
  title,
}: SuccessDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const acceptRef = useRef<HTMLButtonElement>(null);
  const [paused, setPaused] = useState(false);

  const close = useEffectEvent(() => onClose());
  const restoreFocus = useEffectEvent((opener: HTMLElement | null) => {
    const preferred = returnFocusId
      ? document.getElementById(returnFocusId)
      : null;
    const target = preferred ?? (opener?.isConnected ? opener : null);
    target?.focus();
  });

  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    acceptRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      // «Aceptar» es el único control: Tab y Mayús+Tab se quedan en él.
      if (event.key === "Tab") {
        event.preventDefault();
        acceptRef.current?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      restoreFocus(opener);
    };
  }, []);

  useEffect(() => {
    if (paused || !autoCloseMs) return;
    const timer = globalThis.setTimeout(() => close(), autoCloseMs);
    return () => globalThis.clearTimeout(timer);
  }, [autoCloseMs, paused]);

  return createPortal(
    <div
      className={styles.overlay}
      data-testid="success-dialog-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className={styles.dialog}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        role="dialog"
      >
        <svg aria-hidden="true" className={styles.check} viewBox="0 0 60 60">
          <circle cx="30" cy="30" r="26" />
          <path d="M18 31l8 8 16-18" />
        </svg>
        <h2 className={styles.title} id={titleId}>
          {title}
        </h2>
        {description ? (
          <p className={styles.description} id={descriptionId}>
            {description}
          </p>
        ) : null}
        <button
          className={`avend-button avend-button--primary ${styles.accept}`}
          onClick={onClose}
          ref={acceptRef}
          type="button"
        >
          {acceptLabel}
        </button>
      </div>
    </div>,
    document.body,
  );
}
