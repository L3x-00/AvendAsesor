"use client";

import { useState } from "react";
import type { DocumentSuggestions } from "@/lib/admin-api/types";
import { DocumentMetadataFields } from "./document-metadata-fields";
import { FieldError } from "@/components/ui/form-field";
import { DocumentPdfUploadForm } from "./document-pdf-upload-form";
import {
  DOCUMENT_TYPE_OPTIONS,
  NORMATIVE_DOCUMENT_TYPE_VALUES,
  documentTypeLabel,
} from "@/lib/admin-api/document-taxonomy";

const CONTEXT_LABELS: Record<string, string> = {
  ANEXO: "Anexos",
  CRONOGRAMA: "Cronograma",
  NORMATIVA: "Normativa",
  PREGUNTAS_FRECUENTES: "Preguntas frecuentes",
};
const NORMATIVE_DOCUMENT_TYPE_OPTIONS = DOCUMENT_TYPE_OPTIONS.filter((option) =>
  NORMATIVE_DOCUMENT_TYPE_VALUES.has(option.value),
);

interface DocumentUploadPanelProps {
  /** Abre el formulario al llegar desde «Cargar documento en este tema». */
  defaultOpen?: boolean;
  /** Tipo documental preseleccionado (p. ej., al subir un anexo). */
  defaultDocumentType?: string;
  apiBaseUrl: string;
  moduleId: string;
  moduleName: string;
  replacementCandidates: { id: string; title: string }[];
  suggestions: DocumentSuggestions;
}

export function DocumentUploadPanel({
  apiBaseUrl,
  defaultDocumentType,
  moduleId,
  defaultOpen = false,
  moduleName,
  replacementCandidates,
  suggestions,
}: DocumentUploadPanelProps) {
  const prefix = `module-document-${moduleId}`;
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const contentId = `${prefix}-content`;
  const isContextual = Boolean(defaultDocumentType);
  const isNormative = defaultDocumentType === "NORMATIVA";
  const contextualLabel = defaultDocumentType
    ? (CONTEXT_LABELS[defaultDocumentType] ??
      documentTypeLabel(defaultDocumentType))
    : undefined;

  return (
    <section
      className="avend-elevated rounded-xl border border-avend-border bg-avend-surface"
      id="cargar-documento"
    >
      <div className="p-5">
        <button
          aria-controls={contentId}
          aria-expanded={isOpen}
          className="avend-button avend-button--primary w-full lg:w-auto"
          onClick={() => setIsOpen((prev) => !prev)}
          type="button"
        >
          <span>
            {contextualLabel
              ? `+ Subir en ${contextualLabel}`
              : "+ Agregar documento"}
          </span>
          <svg
            aria-hidden="true"
            className={`ml-2 h-4 w-4 transition-transform duration-300 ease-in-out ${
              isOpen ? "rotate-180" : "rotate-0"
            }`}
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <p className="mt-3 text-base leading-7 text-avend-text-muted">
          El documento quedará asociado a <strong>{moduleName}</strong>
          {contextualLabel ? (
            <> dentro de <strong>{contextualLabel}</strong></>
          ) : null}
          . Admite PDF, Word (.docx o .doc) y Markdown (.md) de hasta 50 MiB.
        </p>
      </div>

      <div
        className={`grid transition-all duration-300 ease-in-out ${
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
        id={contentId}
      >
        <div className="overflow-hidden">
          <div className="px-5 pb-5">
            <DocumentPdfUploadForm
              apiBaseUrl={apiBaseUrl}
              className="mt-5 grid gap-4 lg:grid-cols-2"
              endpoint="/admin/documents"
              submitLabel="Cargar documento"
              successMessage="Documento creado y asociado."
            >
              <input name="moduleId" type="hidden" value={moduleId} />
              <label className="block lg:col-span-2" htmlFor={`${prefix}-file`}>
                <span className="text-base font-semibold avend-field-label--required">
                  Archivo (PDF, Word o Markdown)
                </span>
                <input
                  accept=".pdf,.docx,.doc,.md,application/pdf"
                  className="mt-1 block min-h-11 w-full text-base"
                  id={`${prefix}-file`}
                  name="file"
                  required
                  type="file"
                />
              </label>
              <FieldError name="file" />
              <label className="block lg:col-span-2" htmlFor={`${prefix}-name`}>
                <span className="text-base font-semibold avend-field-label--required">
                  Título
                </span>
                <input
                  className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
                  id={`${prefix}-name`}
                  maxLength={500}
                  minLength={2}
                  name="title"
                  required
                />
              </label>
              <DocumentMetadataFields
                key={defaultDocumentType ?? "without-preselected-document-type"}
                compact={isContextual}
                documentTypeOptions={
                  isNormative ? NORMATIVE_DOCUMENT_TYPE_OPTIONS : undefined
                }
                includeSituation={!isContextual}
                initial={
                  defaultDocumentType && !isNormative
                    ? { documentType: defaultDocumentType }
                    : undefined
                }
                lockDocumentType={isContextual && !isNormative}
                replacementCandidates={replacementCandidates}
                required
                suggestions={suggestions}
              />
              {isContextual ? (
                <details className="lg:col-span-2 rounded-md border border-avend-border p-3">
                  <summary className="cursor-pointer text-base font-semibold text-avend-accent-strong">
                    Datos opcionales
                  </summary>
                  <div className="mt-3 grid gap-4 lg:grid-cols-2">
                    <OptionalDocumentFields prefix={prefix} />
                  </div>
                </details>
              ) : (
                <OptionalDocumentFields prefix={prefix} />
              )}
            </DocumentPdfUploadForm>
          </div>
        </div>
      </div>
    </section>
  );
}

function OptionalDocumentFields({ prefix }: { prefix: string }) {
  return (
    <>
      <label className="block" htmlFor={`${prefix}-number`}>
        <span className="text-base font-semibold">
          Número del documento (opcional)
        </span>
        <input
          className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
          id={`${prefix}-number`}
          maxLength={120}
          name="resolutionNumber"
        />
      </label>
      <label className="block" htmlFor={`${prefix}-article`}>
        <span className="text-base font-semibold">
          Referencia de artículo (opcional)
        </span>
        <input
          className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
          id={`${prefix}-article`}
          maxLength={120}
          name="articleReference"
        />
      </label>
      <label
        className="block lg:col-span-2"
        htmlFor={`${prefix}-metadata`}
      >
        <span className="text-base font-semibold">
          Palabras clave JSON (opcional)
        </span>
        <textarea
          aria-describedby={`${prefix}-metadata-help`}
          className="mt-1 min-h-24 w-full rounded-md border border-avend-border px-3 py-2 font-mono text-base"
          id={`${prefix}-metadata`}
          name="metadata"
          placeholder='{"keywords":["licencia","salud"]}'
        />
        <span
          className="mt-1 block text-sm text-avend-text-muted"
          id={`${prefix}-metadata-help`}
        >
          Usa la clave keywords con una lista de palabras. Debe ser un objeto
          JSON válido.
        </span>
      </label>
    </>
  );
}
