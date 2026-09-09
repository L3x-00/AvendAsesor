"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ARCHIVE_REASON_OPTIONS,
  DOCUMENT_SITUATION_OPTIONS,
  DOCUMENT_TYPE_OPTIONS,
  ISSUING_ENTITY_OPTIONS,
  MINEDU_DEPENDENCIES,
  UGEL_DEPENDENCIES,
  documentYears,
  type ArchiveReasonCode,
} from "@/lib/admin-api/document-taxonomy";
import type {
  DocumentSituation,
  DocumentSuggestions,
} from "@/lib/admin-api/types";

export interface DocumentMetadataInitialValues {
  additionalDetail?: string | null;
  documentType?: string | null;
  documentTypeOther?: string | null;
  issuanceYear?: number | null;
  issuingEntity?: string | null;
  issuingEntityOther?: string | null;
  keywords?: string | null;
  situation?: DocumentSituation;
  specificDependency?: string | null;
}

interface ReplacementCandidate {
  id: string;
  title: string;
}

interface DocumentMetadataFieldsProps {
  includeSituation?: boolean;
  initial?: DocumentMetadataInitialValues;
  replacementCandidates?: ReplacementCandidate[];
  required?: boolean;
  suggestions?: DocumentSuggestions;
}

const emptySuggestions: DocumentSuggestions = {
  additionalDetails: [],
  specificDependencies: [],
};

function initialType(initial?: DocumentMetadataInitialValues): string {
  const value = initial?.documentType ?? "";
  return DOCUMENT_TYPE_OPTIONS.some((option) => option.value === value)
    ? value
    : value
      ? "OTRO"
      : "";
}

function initialEntity(initial?: DocumentMetadataInitialValues): string {
  const value = initial?.issuingEntity ?? "";
  return ISSUING_ENTITY_OPTIONS.some((option) => option.value === value)
    ? value
    : value
      ? "OTRA_INSTITUCION"
      : "";
}

function initialYearMode(initial?: DocumentMetadataInitialValues): string {
  const year = initial?.issuanceYear;
  if (!year) return "";
  return year < 2014 ? "before-2014" : String(year);
}

export function DocumentMetadataFields({
  includeSituation = false,
  initial,
  replacementCandidates = [],
  required = false,
  suggestions = emptySuggestions,
}: DocumentMetadataFieldsProps) {
  const prefix = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [documentType, setDocumentType] = useState(() => initialType(initial));
  const [entity, setEntity] = useState(() => initialEntity(initial));
  const [specificDependency, setSpecificDependency] = useState(
    initial?.specificDependency ?? "",
  );
  const [additionalDetail, setAdditionalDetail] = useState(
    initial?.additionalDetail ?? "",
  );
  const [yearMode, setYearMode] = useState(() => initialYearMode(initial));
  const [situation, setSituation] = useState<DocumentSituation>(
    initial?.situation ?? "current",
  );
  const [archiveReason, setArchiveReason] =
    useState<ArchiveReasonCode>("NOT_APPLICABLE");
  const years = useMemo(() => documentYears(), []);
  const dependencySuggestions = useMemo(() => {
    const canonical =
      entity === "MINEDU"
        ? [...MINEDU_DEPENDENCIES]
        : entity === "UGEL"
          ? [...UGEL_DEPENDENCIES]
          : [];
    return [...new Set([...canonical, ...suggestions.specificDependencies])];
  }, [entity, suggestions.specificDependencies]);

  function notifySuggestedValue(name: string) {
    queueMicrotask(() => {
      containerRef.current?.querySelector<HTMLInputElement>(`input[name="${name}"]`)
        ?.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  function resetControlledFields(event: Event) {
    if (event.defaultPrevented) return;
    setDocumentType(initialType(initial));
    setEntity(initialEntity(initial));
    setSpecificDependency(initial?.specificDependency ?? "");
    setAdditionalDetail(initial?.additionalDetail ?? "");
    setYearMode(initialYearMode(initial));
    setSituation(initial?.situation ?? "current");
    setArchiveReason("NOT_APPLICABLE");
  }

  useEffect(() => {
    const form = containerRef.current?.closest("form");
    if (!form) return;
    form.addEventListener("reset", resetControlledFields);
    return () => form.removeEventListener("reset", resetControlledFields);
  });

  return (
    <div
      className="contents"
      data-testid="document-metadata-fields"
      ref={containerRef}
    >
      <label className="block" htmlFor={`${prefix}-type`}>
        <span className="text-base font-semibold">Tipo documental</span>
        <select
          className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
          id={`${prefix}-type`}
          name="documentType"
          onChange={(event) => setDocumentType(event.target.value)}
          required={required}
          value={documentType}
        >
          <option disabled value="">
            Selecciona un tipo
          </option>
          {DOCUMENT_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {documentType === "OTRO" ? (
        <label className="block" htmlFor={`${prefix}-type-other`}>
          <span className="text-base font-semibold">Especificar tipo</span>
          <input
            className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
            defaultValue={
              initial?.documentTypeOther ??
              (initialType(initial) === "OTRO"
                ? (initial?.documentType ?? "")
                : "")
            }
            id={`${prefix}-type-other`}
            maxLength={120}
            minLength={2}
            name="documentTypeOther"
            required
          />
        </label>
      ) : null}

      <label className="block" htmlFor={`${prefix}-year-mode`}>
        <span className="text-base font-semibold">Año del documento</span>
        <select
          className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
          id={`${prefix}-year-mode`}
          name="issuanceYearMode"
          onChange={(event) => setYearMode(event.target.value)}
          required={required}
          value={yearMode}
        >
          <option disabled={required} value="">
            Sin año registrado
          </option>
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
          <option value="before-2014">Anterior a 2014</option>
        </select>
      </label>
      {yearMode === "before-2014" ? (
        <label className="block" htmlFor={`${prefix}-exact-year`}>
          <span className="text-base font-semibold">Año exacto</span>
          <input
            className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
            defaultValue={
              initial?.issuanceYear && initial.issuanceYear < 2014
                ? initial.issuanceYear
                : ""
            }
            id={`${prefix}-exact-year`}
            max="2013"
            min="1800"
            name="issuanceYear"
            required
            type="number"
          />
        </label>
      ) : yearMode ? (
        <input name="issuanceYear" type="hidden" value={yearMode} />
      ) : null}

      <label className="block" htmlFor={`${prefix}-entity`}>
        <span className="text-base font-semibold">Entidad emisora</span>
        <select
          className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
          id={`${prefix}-entity`}
          name="issuingEntity"
          onChange={(event) => {
            setEntity(event.target.value);
            setSpecificDependency("");
          }}
          required={required}
          value={entity}
        >
          <option disabled value="">
            Selecciona una entidad
          </option>
          {ISSUING_ENTITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {entity === "OTRA_INSTITUCION" ? (
        <label className="block" htmlFor={`${prefix}-entity-other`}>
          <span className="text-base font-semibold">
            Nombre de la institución
          </span>
          <input
            className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
            defaultValue={
              initial?.issuingEntityOther ??
              (initialEntity(initial) === "OTRA_INSTITUCION"
                ? (initial?.issuingEntity ?? "")
                : "")
            }
            id={`${prefix}-entity-other`}
            maxLength={255}
            minLength={2}
            name="issuingEntityOther"
            required
          />
        </label>
      ) : null}

      {entity ? (
        <div className="block">
          <label
            className="text-base font-semibold"
            htmlFor={`${prefix}-dependency`}
          >
            {entity === "DRE_GRE"
              ? "DRE/GRE específica"
              : "Dependencia específica"}
          </label>
          <input
            className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
            id={`${prefix}-dependency`}
            list={`${prefix}-dependency-suggestions`}
            maxLength={255}
            name="specificDependency"
            onChange={(event) => setSpecificDependency(event.target.value)}
            placeholder={
              entity === "UGEL"
                ? "Selecciona o escribe la UGEL"
                : entity === "DRE_GRE"
                  ? "Ej. DRE Lima Metropolitana"
                  : "Selecciona o escribe la dependencia"
            }
            required={required}
            value={specificDependency}
          />
          <datalist id={`${prefix}-dependency-suggestions`}>
            {dependencySuggestions.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
          {dependencySuggestions.length > 0 ? (
            <div
              aria-label="Sugerencias de dependencia"
              className="mt-2 flex flex-wrap gap-2"
              role="group"
            >
              {dependencySuggestions.slice(0, 6).map((value) => (
                <button
                  className="min-h-11 rounded-full border border-avend-border bg-avend-surface-muted px-3 text-sm font-semibold text-avend-navy"
                  key={value}
                  onClick={() => {
                    setSpecificDependency(value);
                    notifySuggestedValue("specificDependency");
                  }}
                  type="button"
                >
                  {value}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="block">
        <label
          className="text-base font-semibold"
          htmlFor={`${prefix}-additional-detail`}
        >
          Detalle adicional / Área / Oficina (opcional)
        </label>
        <input
          className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
          id={`${prefix}-additional-detail`}
          list={`${prefix}-additional-detail-suggestions`}
          maxLength={255}
          name="additionalDetail"
          onChange={(event) => setAdditionalDetail(event.target.value)}
          value={additionalDetail}
        />
        <datalist id={`${prefix}-additional-detail-suggestions`}>
          {suggestions.additionalDetails.map((value) => (
            <option key={value} value={value} />
          ))}
        </datalist>
        {suggestions.additionalDetails.length > 0 ? (
          <div
            aria-label="Sugerencias de detalle adicional"
            className="mt-2 flex flex-wrap gap-2"
          >
            {suggestions.additionalDetails.slice(0, 6).map((value) => (
              <button
                className="min-h-11 rounded-full border border-avend-border bg-avend-surface-muted px-3 text-sm font-semibold text-avend-navy"
                key={value}
                onClick={() => {
                  setAdditionalDetail(value);
                  notifySuggestedValue("additionalDetail");
                }}
                type="button"
              >
                {value}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* La biblioteca ya indexaba metadata.keywords, pero ningún formulario
          permitía capturarlas: la búsqueda por palabras clave que la interfaz
          promete era inalcanzable salvo escribiendo JSON a mano. */}
      <div className="block sm:col-span-2">
        <label
          className="text-base font-semibold"
          htmlFor={`${prefix}-keywords`}
        >
          Palabras clave (opcional)
        </label>
        <input
          className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
          defaultValue={initial?.keywords ?? ""}
          id={`${prefix}-keywords`}
          maxLength={500}
          name="keywords"
          placeholder="Ej. licencia, ascenso, nombramiento"
        />
        <span className="mt-1 block text-sm text-avend-text-muted">
          Sepáralas con comas. Sirven para encontrar el documento desde el
          buscador del Historial.
        </span>
      </div>

      {includeSituation ? (
        <>
          <label className="block" htmlFor={`${prefix}-situation`}>
            <span className="text-base font-semibold">Situación</span>
            <select
              className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
              id={`${prefix}-situation`}
              name="situation"
              onChange={(event) =>
                setSituation(event.target.value as DocumentSituation)
              }
              value={situation}
            >
              {DOCUMENT_SITUATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {situation === "replaced" ? (
            <ReplacementFields
              prefix={prefix}
              replacementCandidates={replacementCandidates}
            />
          ) : null}
          {situation === "archived" ? (
            <ArchiveFields
              archiveReason={archiveReason}
              onArchiveReasonChange={setArchiveReason}
              prefix={prefix}
              replacementCandidates={replacementCandidates}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function ReplacementFields({
  prefix,
  replacementCandidates,
}: {
  prefix: string;
  replacementCandidates: ReplacementCandidate[];
}) {
  return (
    <div className="contents">
      <label className="block" htmlFor={`${prefix}-replacement-document`}>
        <span className="text-base font-semibold">
          Documento que lo reemplaza
        </span>
        <select
          className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
          defaultValue=""
          id={`${prefix}-replacement-document`}
          name="replacementDocumentId"
        >
          <option value="">Aún no está cargado</option>
          {replacementCandidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.title}
            </option>
          ))}
        </select>
      </label>
      <label className="block" htmlFor={`${prefix}-replacement-year`}>
        <span className="text-base font-semibold">
          Fecha o año del reemplazo
        </span>
        <input
          className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
          id={`${prefix}-replacement-year`}
          max={documentYears()[0]}
          min="1800"
          name="replacementYear"
          required
          type="number"
        />
      </label>
      <label className="block" htmlFor={`${prefix}-replacement-reason`}>
        <span className="text-base font-semibold">Motivo del cambio</span>
        <textarea
          className="mt-1 min-h-20 w-full rounded-md border border-avend-border px-3 py-2 text-base"
          id={`${prefix}-replacement-reason`}
          maxLength={500}
          minLength={2}
          name="reason"
          required
        />
      </label>
      <label className="block" htmlFor={`${prefix}-replacement-observation`}>
        <span className="text-base font-semibold">
          Observación adicional (opcional)
        </span>
        <textarea
          className="mt-1 min-h-20 w-full rounded-md border border-avend-border px-3 py-2 text-base"
          id={`${prefix}-replacement-observation`}
          maxLength={1000}
          name="observation"
        />
      </label>
    </div>
  );
}

function ArchiveFields({
  archiveReason,
  onArchiveReasonChange,
  prefix,
  replacementCandidates,
}: {
  archiveReason: ArchiveReasonCode;
  onArchiveReasonChange: (reason: ArchiveReasonCode) => void;
  prefix: string;
  replacementCandidates: ReplacementCandidate[];
}) {
  return (
    <div className="contents">
      <label className="block" htmlFor={`${prefix}-archive-reason`}>
        <span className="text-base font-semibold">Motivo de archivo</span>
        <select
          className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
          id={`${prefix}-archive-reason`}
          name="archiveReasonCode"
          onChange={(event) =>
            onArchiveReasonChange(event.target.value as ArchiveReasonCode)
          }
          value={archiveReason}
        >
          {ARCHIVE_REASON_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {archiveReason === "OTHER" ? (
        <label className="block" htmlFor={`${prefix}-archive-reason-detail`}>
          <span className="text-base font-semibold">Especificar motivo</span>
          <textarea
            className="mt-1 min-h-20 w-full rounded-md border border-avend-border px-3 py-2 text-base"
            id={`${prefix}-archive-reason-detail`}
            maxLength={500}
            minLength={2}
            name="archiveReasonDetail"
            required
          />
        </label>
      ) : null}
      {archiveReason === "REPLACED_BY_NEWER" ? (
        <ReplacementFields
          prefix={`${prefix}-archive`}
          replacementCandidates={replacementCandidates}
        />
      ) : null}
      {archiveReason !== "REPLACED_BY_NEWER" ? (
        <label className="block" htmlFor={`${prefix}-archive-observation`}>
          <span className="text-base font-semibold">
            Observación adicional (opcional)
          </span>
          <textarea
            className="mt-1 min-h-20 w-full rounded-md border border-avend-border px-3 py-2 text-base"
            id={`${prefix}-archive-observation`}
            maxLength={1000}
            name="observation"
          />
        </label>
      ) : null}
    </div>
  );
}
