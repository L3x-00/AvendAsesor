"use client";

import { type ReactNode, useId, useState } from "react";
import { AdminModal } from "./admin-modal";

interface DocumentHistoryDialogProps {
  children: ReactNode;
  documentTitle: string;
}

/**
 * Abre la trazabilidad del documento sin mantener tres paneles extensos en la
 * ficha. `children` viene del servidor, de modo que el historial conserva sus
 * enlaces y datos sin trasladar lógica administrativa al navegador.
 */
export function DocumentHistoryDialog({
  children,
  documentTitle,
}: DocumentHistoryDialogProps) {
  const [open, setOpen] = useState(false);
  const id = useId().replace(/:/g, "");
  const triggerId = `document-history-trigger-${id}`;
  const panelId = `document-history-panel-${id}`;

  return (
    <>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="avend-button"
        id={triggerId}
        onClick={() => setOpen(true)}
        type="button"
      >
        Ver historial
      </button>
      <AdminModal
        closeLabel="Cerrar historial"
        eyebrow={documentTitle}
        keepMounted
        onClose={() => setOpen(false)}
        open={open}
        panelId={panelId}
        returnFocusTo={triggerId}
        title="Historial del documento"
      >
        {children}
      </AdminModal>
    </>
  );
}
