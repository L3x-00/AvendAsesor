"use client";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import styles from "./admin-modal.module.css";

/** El portal solo existe en el navegador; en el servidor no se pinta nada. */
const emptySubscribe = () => () => {};
function useClientMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

interface AdminModalProps {
  children: ReactNode;
  /** Texto pequeño sobre el título (p. ej. el nombre de la persona). */
  eyebrow?: string;
  /** Etiqueta del botón inferior de cierre. */
  closeLabel?: string;
  /**
   * Mantiene el formulario montado aunque el diálogo esté cerrado, para no
   * perder borradores ni un envío en curso (barra de altas de Usuarios).
   */
  keepMounted?: boolean;
  onClose: () => void;
  open: boolean;
  /** Id del panel; la barra lo usa en `aria-controls` de su botón. */
  panelId?: string;
  /** Id del control que lo abrió: recibe el foco al cerrar. */
  returnFocusTo?: string;
  title: string;
}

/**
 * Diálogo del panel administrativo. Se pinta en `document.body` mediante un
 * portal: ningún contenedor de la página (overflow, transform, z-index) puede
 * recortarlo. Atrapa el foco, se cierra con Escape o con un clic fuera y
 * bloquea el desplazamiento de fondo mientras está abierto.
 */
export function AdminModal({
  children,
  closeLabel = "Cerrar formulario",
  eyebrow,
  keepMounted = false,
  onClose,
  open,
  panelId,
  returnFocusTo,
  title,
}: AdminModalProps) {
  const baseId = useId();
  const id = panelId ?? `${baseId}-panel`;
  const titleId = `${baseId}-title`;
  const mounted = useClientMounted();

  // Al abrir, el foco va al panel y se recuerda dónde estaba; al cerrar vuelve
  // al control que lo abrió. El foco nunca queda detrás del modal.
  useEffect(() => {
    if (!open) return;
    const previous = (returnFocusTo
      ? document.getElementById(returnFocusTo)
      : (document.activeElement as HTMLElement | null)) as HTMLElement | null;
    document.getElementById(id)?.focus({ preventScroll: true });
    return () => {
      if (returnFocusTo) {
        document.getElementById(returnFocusTo)?.focus({ preventScroll: true });
      } else if (previous?.isConnected) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [id, open, returnFocusTo]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = [
      ...event.currentTarget.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ];
    if (focusable.length === 0) {
      event.preventDefault();
      event.currentTarget.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const activeElement = document.activeElement;
    if (activeElement === event.currentTarget) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!mounted) return null;
  if (!open && !keepMounted) return null;

  return createPortal(
    <div
      className={styles.modalBackdrop}
      hidden={!open}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className={styles.actionPanel}
        id={id}
        onKeyDown={handleKeyDown}
        role="dialog"
        tabIndex={-1}
      >
        <div className={styles.actionPanelHeader}>
          <div>
            {eyebrow ? (
              <p className={styles.actionPanelEyebrow}>{eyebrow}</p>
            ) : null}
            <h2 className={styles.actionPanelTitle} id={titleId}>
              {title}
            </h2>
          </div>
          <button
            aria-label="Cerrar"
            className={styles.actionPanelCloseIcon}
            onClick={onClose}
            type="button"
          >
            <svg
              aria-hidden="true"
              className={styles.actionIcon}
              fill="none"
              viewBox="0 0 24 24"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className={styles.actionPanelBody}>{children}</div>
        <div className={styles.actionPanelFooter}>
          <button
            className={styles.actionPanelClose}
            onClick={onClose}
            type="button"
          >
            {closeLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
