"use client";

import { useId, useState } from "react";
import {
  deleteDocumentAction,
  setDocumentTechnicalStatusAction,
} from "@/app/admin/actions";
import { AdminActionForm } from "@/components/admin/admin-action-form";
import { AdminModal } from "@/components/admin/admin-modal";
import type { DocumentLibraryItem } from "@/lib/admin-api/types";
import type { FieldRules } from "@/lib/ui/field-validation";
import styles from "./document-library-view.module.css";

/**
 * Acciones de administración de cada fila del Historial de documentos:
 * eliminar (tacho rojo) y pasar de «Pendiente de aprobación» a «Listo»
 * (estado técnico).
 *
 * Cada botón abre su propio diálogo, así la fila no crece ni obliga a
 * desplazarse, y la confirmación reutiliza el mismo formulario y la misma
 * Server Action que la ficha del documento. En la tabla solo se ve el símbolo
 * (el nombre aparece como etiqueta flotante al pasar el mouse o con el foco);
 * en las tarjetas el nombre se ve siempre.
 */

type RowAction = "delete" | "technical";

const ACTION_TITLES: Record<RowAction, string> = {
  delete: "¿Eliminar este documento?",
  technical: "Marcar como Listo",
};

const DELETE_RULES: FieldRules = {
  reason: [
    { kind: "required", label: "El motivo" },
    { kind: "minLength", label: "El motivo", min: 2 },
  ],
};

function TrashIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path d="M5 7h14M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.5 2.5L16 9.5" />
    </svg>
  );
}

/** Mismo flujo que la ficha: eliminación lógica con motivo obligatorio. */
function DeleteDocumentForm({
  document,
  onSuccess,
}: {
  document: DocumentLibraryItem;
  onSuccess: () => void;
}) {
  const fieldId = useId();

  return (
    <AdminActionForm
      action={deleteDocumentAction}
      className="space-y-3"
      onSuccess={onSuccess}
      rules={DELETE_RULES}
      submitLabel="Sí, eliminar documento"
      tone="danger"
    >
      <input name="documentId" type="hidden" value={document.id} />
      <p className="text-base leading-7">
        La eliminación es lógica: el documento sale de la gestión habitual, pero
        se conservan el PDF, sus versiones y el historial.
      </p>
      <label className="block" htmlFor={`${fieldId}-reason`}>
        <span className="text-base font-semibold text-red-900">Motivo</span>
        <input
          className="mt-1 min-h-11 w-full rounded-md border border-red-400 px-3 text-base"
          id={`${fieldId}-reason`}
          minLength={2}
          name="reason"
          required
        />
      </label>
    </AdminActionForm>
  );
}

/** Pendiente de aprobación → Listo, el mismo cambio de la ficha. */
function MarkReadyForm({
  document,
  onSuccess,
}: {
  document: DocumentLibraryItem;
  onSuccess: () => void;
}) {
  return (
    <AdminActionForm
      action={setDocumentTechnicalStatusAction}
      className="space-y-3"
      onSuccess={onSuccess}
      submitLabel="Sí, marcar como Listo"
    >
      <input name="documentId" type="hidden" value={document.id} />
      <input name="technicalStatus" type="hidden" value="ready" />
      <p className="text-base leading-7">
        El documento quedará aprobado como <strong>Listo</strong> y disponible
        para las consultas de los docentes. Solo es posible cuando su versión ya
        terminó de indexarse.
      </p>
    </AdminActionForm>
  );
}

export function DocumentRowActions({
  document,
}: {
  document: DocumentLibraryItem;
}) {
  const baseId = useId();
  const [openAction, setOpenAction] = useState<RowAction | null>(null);
  const close = () => setOpenAction(null);
  const triggerId = (action: RowAction) => `${baseId}-${action}`;

  return (
    <>
      {document.technicalStatus === "pending_approval" ? (
        <button
          aria-label={`Marcar como Listo: ${document.title}`}
          className={styles.action}
          id={triggerId("technical")}
          onClick={() => setOpenAction("technical")}
          title="Marcar como Listo (estado técnico)"
          type="button"
        >
          <CheckCircleIcon />
          <span aria-hidden="true" className={styles.actionLabel}>
            Marcar como Listo
          </span>
        </button>
      ) : null}
      <button
        aria-label={`Eliminar: ${document.title}`}
        className={`${styles.action} ${styles.actionDanger}`}
        id={triggerId("delete")}
        onClick={() => setOpenAction("delete")}
        title="Eliminar documento"
        type="button"
      >
        <TrashIcon />
        <span aria-hidden="true" className={styles.actionLabel}>
          Eliminar
        </span>
      </button>

      <AdminModal
        closeLabel="Cerrar"
        eyebrow={document.title}
        onClose={close}
        open={openAction !== null}
        returnFocusTo={openAction === null ? undefined : triggerId(openAction)}
        title={ACTION_TITLES[openAction ?? "delete"]}
      >
        {openAction === "delete" ? (
          <DeleteDocumentForm document={document} onSuccess={close} />
        ) : null}
        {openAction === "technical" ? (
          <MarkReadyForm document={document} onSuccess={close} />
        ) : null}
      </AdminModal>
    </>
  );
}
