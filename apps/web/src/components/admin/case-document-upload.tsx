"use client";

import { linkUploadedDocumentToCaseAction } from "@/app/admin/operations/consultation-actions";
import {
  DOCUMENT_TYPE_OPTIONS,
  ISSUING_ENTITY_OPTIONS,
  documentYears,
} from "@/lib/admin-api/document-taxonomy";
import { DocumentPdfUploadForm } from "./document-pdf-upload-form";

/**
 * Carga el documento que falta sin salir del caso: se asocia al módulo del tema
 * (casilla oculta) y se vincula al caso apenas termina la subida.
 */
export function CaseDocumentUpload({
  apiBaseUrl,
  caseId,
  moduleId,
  moduleLabel,
  suggestedTitle,
}: {
  apiBaseUrl: string;
  caseId: string;
  moduleId: string;
  moduleLabel: string;
  suggestedTitle: string;
}) {
  const currentYear = documentYears()[0];

  return (
    <details className="mt-4 rounded-lg border border-avend-border p-4">
      <summary className="cursor-pointer text-base font-bold">
        Cargar documento para este caso
      </summary>
      <p className="mt-2 text-base text-avend-text-muted">
        El documento se asociará a «{moduleLabel}» y quedará vinculado al caso.
        Al terminar podrás cerrar la consulta con una nota.
      </p>
      <DocumentPdfUploadForm
        apiBaseUrl={apiBaseUrl}
        className="mt-3 space-y-3"
        endpoint="/admin/documents"
        onUploaded={({ id }) => linkUploadedDocumentToCaseAction(caseId, id)}
        submitLabel="Cargar y vincular al caso"
        successMessage="Documento cargado y vinculado al caso."
      >
        <input name="moduleId" type="hidden" value={moduleId} />
        <label className="block" htmlFor="case-doc-title">
          <span className="text-base font-semibold avend-field-label--required">
            Título del documento
          </span>
          <input
            className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
            defaultValue={suggestedTitle}
            id="case-doc-title"
            maxLength={500}
            name="title"
            required
          />
        </label>
        <label className="block" htmlFor="case-doc-type">
          <span className="text-base font-semibold avend-field-label--required">
            Tipo de documento
          </span>
          <select
            className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
            id="case-doc-type"
            name="documentType"
            required
          >
            {DOCUMENT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block" htmlFor="case-doc-entity">
          <span className="text-base font-semibold avend-field-label--required">
            Entidad emisora
          </span>
          <select
            className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
            id="case-doc-entity"
            name="issuingEntity"
            required
          >
            {ISSUING_ENTITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block" htmlFor="case-doc-year">
          <span className="text-base font-semibold avend-field-label--required">
            Año del documento
          </span>
          <input
            className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
            defaultValue={currentYear}
            id="case-doc-year"
            max={2100}
            min={1900}
            name="issuanceYear"
            required
            type="number"
          />
        </label>
        <label className="block" htmlFor="case-doc-number">
          <span className="text-base font-semibold">
            Número de resolución (opcional)
          </span>
          <input
            className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
            id="case-doc-number"
            maxLength={255}
            name="resolutionNumber"
            placeholder="Por ejemplo, RM-123-2026-MINEDU"
          />
        </label>
        <label className="block" htmlFor="case-doc-file">
          <span className="text-base font-semibold avend-field-label--required">
            Archivo (PDF, Word o Markdown)
          </span>
          <input
            accept=".pdf,.docx,.doc,.md,application/pdf"
            className="mt-1 block min-h-11 w-full text-base"
            id="case-doc-file"
            name="file"
            required
            type="file"
          />
        </label>
      </DocumentPdfUploadForm>
    </details>
  );
}
