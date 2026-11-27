"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";
import { AdminModal } from "./admin-modal";
import styles from "./document-detail-actions.module.css";

/** El botón superior y el de «Editar datos» abren el mismo diálogo. */
export const OPEN_DOCUMENT_EDIT_EVENT = "avend:open-document-edit";
export const CLOSE_DOCUMENT_EDIT_EVENT = "avend:close-document-edit";

interface DocumentEditSectionProps {
  children: ReactNode;
  id?: string;
  /** El botón se coloca aparte cuando el encabezado lo dibuja la página. */
  showTrigger?: boolean;
}

function PencilIcon() {
  return (
    <span aria-hidden="true" className={styles.tabIcon}>
      <svg viewBox="0 0 24 24">
        <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" />
        <path d="m13.5 6.5 4 4" />
      </svg>
    </span>
  );
}

export function DocumentEditDataButton() {
  return (
    <button
      aria-controls="document-edit-dialog"
      aria-haspopup="dialog"
      className={styles.editDataButton}
      onClick={() => window.dispatchEvent(new Event(OPEN_DOCUMENT_EDIT_EVENT))}
      type="button"
    >
      <PencilIcon />
      Editar datos
    </button>
  );
}

/**
 * El formulario de edición vive en un diálogo: la ficha del documento se lee
 * completa sin un bloque largo de campos intermedios. Conserva el ancla
 * `#edit-document` para los enlaces que apuntaban al formulario en línea.
 */
export function DocumentEditSection({
  children,
  id = "edit-document",
  showTrigger = true,
}: DocumentEditSectionProps) {
  const [open, setOpen] = useState(
    () =>
      typeof window !== "undefined" && window.location.hash === `#${id}`,
  );
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const openFromButton = () => setOpen(true);
    const closeFromForm = () => setOpen(false);
    window.addEventListener(OPEN_DOCUMENT_EDIT_EVENT, openFromButton);
    window.addEventListener(CLOSE_DOCUMENT_EDIT_EVENT, closeFromForm);
    return () => {
      window.removeEventListener(OPEN_DOCUMENT_EDIT_EVENT, openFromButton);
      window.removeEventListener(CLOSE_DOCUMENT_EDIT_EVENT, closeFromForm);
    };
  }, [id]);

  return (
    <>
      {showTrigger ? (
        <button
          aria-controls="document-edit-dialog"
          aria-expanded={open}
          aria-haspopup="dialog"
          className={styles.editDataButton}
          id={id}
          onClick={() => setOpen(true)}
          type="button"
        >
          <PencilIcon />
          Editar datos
        </button>
      ) : (
        <span className="sr-only" id={id} />
      )}
      <AdminModal
        closeLabel="Cerrar"
        onClose={close}
        open={open}
        panelId="document-edit-dialog"
        title="Editar datos del documento"
      >
        {children}
      </AdminModal>
    </>
  );
}
