"use client";

import { useMemo, useState } from "react";
import { linkUploadedDocumentToCaseAction } from "@/app/admin/operations/consultation-actions";
import {
  DOCUMENT_TYPE_OPTIONS,
  ISSUING_ENTITY_OPTIONS,
  documentYears,
} from "@/lib/admin-api/document-taxonomy";
import { DocumentPdfUploadForm } from "./document-pdf-upload-form";
import type { ConsultationRouteModule } from "./consultation-route-fields";

/**
 * Carga el documento que falta sin salir del caso: se asocia al módulo del tema
 * (casilla oculta) y se vincula al caso apenas termina la subida.
 */
export function CaseDocumentUpload({
  apiBaseUrl,
  caseId,
  initialModuleId,
  initialSubmoduleId,
  roots,
  submodules,
}: {
  apiBaseUrl: string;
  caseId: string;
  initialModuleId: string | null;
  initialSubmoduleId: string | null;
  roots: ConsultationRouteModule[];
  submodules: ConsultationRouteModule[];
}) {
  const currentYear = documentYears()[0];
  const [rootId, setRootId] = useState(
    initialModuleId ??
      submodules.find((item) => item.id === initialSubmoduleId)
        ?.parentModuleId ??
      "",
  );
  const [submoduleId, setSubmoduleId] = useState(initialSubmoduleId ?? "");
  const availableSubmodules = useMemo(
    () => submodules.filter((item) => item.parentModuleId === rootId),
    [rootId, submodules],
  );
  const destinationId = availableSubmodules.length ? submoduleId : rootId;
  const destinationName =
    submodules.find((item) => item.id === destinationId)?.name ??
    roots.find((item) => item.id === destinationId)?.name;

  return (
    <details className="mt-4 rounded-lg border border-avend-border p-4">
      <summary className="cursor-pointer text-base font-bold">
        Cargar documento para este caso
      </summary>
      <p className="mt-2 text-base text-avend-text-muted">
        Elige el módulo y, si corresponde, el submódulo donde quedará el
        documento. Al terminar se vinculará al caso.
      </p>
      <DocumentPdfUploadForm
        apiBaseUrl={apiBaseUrl}
        className="mt-3 space-y-3"
        endpoint="/admin/documents"
        onUploaded={({ id }) => linkUploadedDocumentToCaseAction(caseId, id)}
        submitLabel="Cargar y vincular al caso"
        successMessage="Documento cargado y vinculado al caso."
      >
        <input
          name="moduleIds"
          type="hidden"
          value={destinationId ? JSON.stringify([destinationId]) : "[]"}
        />
        <label className="block" htmlFor="case-doc-module">
          <span className="text-base font-semibold avend-field-label--required">Módulo</span>
          <select
            className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
            id="case-doc-module"
            onChange={(event) => {
              setRootId(event.target.value);
              setSubmoduleId("");
            }}
            required
            value={rootId}
          >
            <option value="">Selecciona un módulo</option>
            {roots.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </label>
        {availableSubmodules.length ? (
          <label className="block" htmlFor="case-doc-submodule">
            <span className="text-base font-semibold avend-field-label--required">Submódulo</span>
            <select
              className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
              id="case-doc-submodule"
              onChange={(event) => setSubmoduleId(event.target.value)}
              required
              value={submoduleId}
            >
              <option value="">Selecciona un submódulo</option>
              {availableSubmodules.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
        ) : null}
        {destinationName ? (
          <p role="status">Se guardará en: {destinationName}</p>
        ) : null}
        <label className="block" htmlFor="case-doc-title">
          <span className="text-base font-semibold avend-field-label--required">
            Título del documento
          </span>
          <input
            className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
            id="case-doc-title"
            maxLength={500}
            name="title"
            placeholder="Ej.: RM 123-2026-MINEDU – Lineamientos de licencias"
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
        <label className="block" htmlFor="case-doc-dependency">
          <span className="text-base font-semibold avend-field-label--required">
            Dependencia específica
          </span>
          <input
            className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
            id="case-doc-dependency"
            maxLength={255}
            minLength={2}
            name="specificDependency"
            placeholder="Por ejemplo, UGEL 01 o DIGEDD"
            required
          />
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
