"use client";

import { useId, useState } from "react";
import { setDocumentSituationAction } from "@/app/admin/actions";
import {
  ARCHIVE_REASON_OPTIONS,
  type ArchiveReasonCode,
} from "@/lib/admin-api/document-taxonomy";
import type { DocumentSituation } from "@/lib/admin-api/types";
import { AdminActionForm } from "./admin-action-form";

interface DocumentSituationActionsProps {
  documentId: string;
  replacementCandidates: { id: string; title: string }[];
  situation: DocumentSituation;
}

export function DocumentSituationActions({
  documentId,
  replacementCandidates,
  situation,
}: DocumentSituationActionsProps) {
  const prefix = useId();
  const [reasonCode, setReasonCode] =
    useState<ArchiveReasonCode>("NOT_APPLICABLE");
  const [replacementDate, setReplacementDate] = useState("");
  const [replacementYear, setReplacementYear] = useState("");
  const availableReasons = ARCHIVE_REASON_OPTIONS.filter((reason) =>
    situation === "archived"
      ? reason.value === "REPLACED_BY_NEWER"
      : situation === "replaced"
        ? reason.value !== "REPLACED_BY_NEWER"
        : true,
  );
  const selectedReason = availableReasons.some(
    (reason) => reason.value === reasonCode,
  )
    ? reasonCode
    : availableReasons[0].value;
  const isReplacement = selectedReason === "REPLACED_BY_NEWER";

  return (
    <section className="rounded-xl border border-avend-border bg-avend-surface p-5">
      <h2 className="text-xl font-bold">Gestión documental</h2>
      <p className="mt-1 text-base leading-7 text-avend-text-muted">
        Cambia la vigencia o archiva el documento. El motivo y la observación
        quedarán registrados en su historial.
      </p>

      {situation !== "current" ? (
        <AdminActionForm
          action={setDocumentSituationAction}
          className="mt-4 space-y-3"
          confirmMessage="¿Confirmas que este documento vuelve a estar vigente?"
          submitLabel="Marcar como vigente"
        >
          <input name="documentId" type="hidden" value={documentId} />
          <input name="situation" type="hidden" value="current" />
        </AdminActionForm>
      ) : null}

      <details className="mt-4 rounded-lg border border-avend-border p-4">
        <summary className="cursor-pointer text-base font-bold">
          {situation === "current"
            ? "Archivar / Desactivar"
            : situation === "replaced"
              ? "Archivar documento"
              : "Registrar reemplazo"}
        </summary>
        <AdminActionForm
          action={setDocumentSituationAction}
          className="mt-4 grid gap-3 sm:grid-cols-2"
          confirmMessage={
            isReplacement
              ? "¿Confirmas registrar el reemplazo de este documento con el motivo indicado?"
              : "¿Confirmas archivar o desactivar este documento con el motivo indicado?"
          }
          submitLabel={
            isReplacement ? "Registrar reemplazo" : "Archivar documento"
          }
        >
          <input name="documentId" type="hidden" value={documentId} />
          <input name="situation" type="hidden" value="archived" />
          <label className="block sm:col-span-2" htmlFor={`${prefix}-reason`}>
            <span className="text-base font-semibold">Motivo</span>
            <select
              className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
              id={`${prefix}-reason`}
              name="archiveReasonCode"
              onChange={(event) => {
                const nextReason = event.target.value as ArchiveReasonCode;
                setReasonCode(nextReason);
                if (nextReason !== "REPLACED_BY_NEWER") {
                  setReplacementDate("");
                  setReplacementYear("");
                }
              }}
              value={selectedReason}
            >
              {availableReasons.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {selectedReason === "OTHER" ? (
            <label className="block sm:col-span-2" htmlFor={`${prefix}-other`}>
              <span className="text-base font-semibold">
                Especificar motivo
              </span>
              <textarea
                className="mt-1 min-h-20 w-full rounded-md border border-avend-border px-3 py-2 text-base"
                id={`${prefix}-other`}
                maxLength={500}
                minLength={2}
                name="archiveReasonDetail"
                required
              />
            </label>
          ) : null}

          {isReplacement ? (
            <>
              <label
                className="block sm:col-span-2"
                htmlFor={`${prefix}-replacement`}
              >
                <span className="text-base font-semibold">
                  Documento que lo reemplaza (opcional)
                </span>
                <select
                  className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
                  defaultValue=""
                  id={`${prefix}-replacement`}
                  name="replacementDocumentId"
                >
                  <option value="">Aún no está registrado</option>
                  {replacementCandidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block" htmlFor={`${prefix}-replacement-date`}>
                <span className="text-base font-semibold">
                  Fecha del reemplazo
                </span>
                <input
                  aria-label="Fecha del reemplazo"
                  className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
                  id={`${prefix}-replacement-date`}
                  name="replacementDate"
                  onChange={(event) => setReplacementDate(event.target.value)}
                  required={!replacementYear}
                  type="date"
                  value={replacementDate}
                />
              </label>
              <label className="block" htmlFor={`${prefix}-replacement-year`}>
                <span className="text-base font-semibold">
                  Año del reemplazo
                </span>
                <input
                  aria-describedby={`${prefix}-replacement-year-help`}
                  aria-label="Año del reemplazo"
                  className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
                  id={`${prefix}-replacement-year`}
                  max={new Date().getFullYear()}
                  min="1800"
                  name="replacementYear"
                  onChange={(event) => setReplacementYear(event.target.value)}
                  required={!replacementDate}
                  type="number"
                  value={replacementYear}
                />
                <span
                  className="mt-1 block text-sm text-avend-text-muted"
                  id={`${prefix}-replacement-year-help`}
                >
                  Indica la fecha, el año o ambos.
                </span>
              </label>
              <label
                className="block sm:col-span-2"
                htmlFor={`${prefix}-change-reason`}
              >
                <span className="text-base font-semibold">
                  Motivo del cambio
                </span>
                <textarea
                  className="mt-1 min-h-20 w-full rounded-md border border-avend-border px-3 py-2 text-base"
                  id={`${prefix}-change-reason`}
                  maxLength={500}
                  minLength={2}
                  name="reason"
                  required
                />
              </label>
            </>
          ) : null}

          <label
            className="block sm:col-span-2"
            htmlFor={`${prefix}-observation`}
          >
            <span className="text-base font-semibold">
              Observación adicional (opcional)
            </span>
            <textarea
              className="mt-1 min-h-20 w-full rounded-md border border-avend-border px-3 py-2 text-base"
              id={`${prefix}-observation`}
              maxLength={1000}
              minLength={2}
              name="observation"
            />
          </label>
        </AdminActionForm>
      </details>
    </section>
  );
}
