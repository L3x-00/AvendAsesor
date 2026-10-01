"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { FieldError } from "@/components/ui/form-field";
import {
  DOCUMENT_TYPE_OPTIONS,
  NORMATIVE_DOCUMENT_TYPE_VALUES,
} from "@/lib/admin-api/document-taxonomy";
import {
  annexNumberFromTitle,
  CONTENT_SECTION_CODES,
  CONTENT_SECTION_METADATA_KEY,
  CONTENT_SECTION_TITLES,
  titleFromFileName,
  type ContentSectionCode,
  type ContextualUploadDefaults,
} from "@/lib/admin-api/module-content";
import type { DocumentSuggestions } from "@/lib/admin-api/types";
import { DocumentMetadataFields } from "./document-metadata-fields";
import {
  DocumentPdfUploadForm,
  type CreatedDocument,
} from "./document-pdf-upload-form";
import styles from "./contextual-upload-dialog.module.css";

/** Tipos que se ofrecen en Normativa: los legales y «Otra norma». */
export const NORMATIVE_UPLOAD_OPTIONS: ReadonlyArray<{
  label: string;
  value: string;
}> = [
  ...DOCUMENT_TYPE_OPTIONS.filter((option) =>
    NORMATIVE_DOCUMENT_TYPE_VALUES.has(option.value),
  ),
  { label: "Otra norma", value: "OTRO" },
];

const SUBMIT_LABELS: Record<ContentSectionCode, string> = {
  ANEXO: "Subir anexo",
  CRONOGRAMA: "Subir cronograma",
  NORMATIVA: "Subir norma",
  PREGUNTAS_FRECUENTES: "Subir preguntas frecuentes",
};

const TITLE_PLACEHOLDERS: Record<ContentSectionCode, string> = {
  ANEXO: "Ej.: Anexo 3 – Contrato de servicio docente",
  CRONOGRAMA: "Ej.: Cronograma de contratación docente 2026",
  NORMATIVA: "Ej.: RM N.° 123-2026-MINEDU",
  PREGUNTAS_FRECUENTES: "Ej.: Preguntas frecuentes del proceso",
};

export interface ContextualUploadResult {
  created: CreatedDocument | undefined;
  section: ContentSectionCode;
}

interface ContextualUploadDialogProps {
  apiBaseUrl: string;
  defaults: ContextualUploadDefaults;
  moduleId: string;
  moduleName: string;
  onClose: () => void;
  onUploaded: (result: ContextualUploadResult) => void;
  section: ContentSectionCode;
  suggestions: DocumentSuggestions;
}

/**
 * Convierte los campos propios de la carga contextual en `metadata`: el número
 * de anexo (numérico) y, para una «Otra norma», la sección de origen, así el
 * documento se queda en Normativa aunque su tipo sea OTRO.
 */
export function applyContextualMetadata(
  formData: FormData,
  section: ContentSectionCode,
): void {
  const rawAnnex = formData.get("annexNumber");
  formData.delete("annexNumber");
  const metadata: Record<string, unknown> = {};

  if (section === "ANEXO" && typeof rawAnnex === "string") {
    const annex = Number(rawAnnex.trim());
    if (rawAnnex.trim() && Number.isInteger(annex) && annex > 0) {
      metadata.annexNumber = annex;
    }
  }
  if (section === "NORMATIVA" && formData.get("documentType") === "OTRO") {
    metadata[CONTENT_SECTION_METADATA_KEY] = "NORMATIVA";
  }

  if (Object.keys(metadata).length > 0) {
    formData.set("metadata", JSON.stringify(metadata));
  } else {
    formData.delete("metadata");
  }
}

/**
 * Ventana accesible con el formulario resumido de «+ Subir …». Atrapa el foco,
 * empieza en «Archivo», se cierra con Escape, con «Cerrar» o al pulsar fuera,
 * y devuelve el foco al botón que la abrió. Mientras se envía no se puede
 * cerrar: si se desmontara, la carga seguiría sin aviso ni resaltado.
 */
export function ContextualUploadDialog({
  apiBaseUrl,
  defaults,
  moduleId,
  moduleName,
  onClose,
  onUploaded,
  section: initialSection,
  suggestions,
}: ContextualUploadDialogProps) {
  const [section, setSection] = useState(initialSection);
  const [pending, setPending] = useState(false);
  const titleId = useId();
  const sectionTitle = CONTENT_SECTION_TITLES[section];

  return (
    <DialogShell
      canClose={!pending}
      onClose={onClose}
      title={`Subir a ${sectionTitle}`}
      titleId={titleId}
    >
      <ContextualUploadForm
        apiBaseUrl={apiBaseUrl}
        defaults={defaults}
        moduleId={moduleId}
        moduleName={moduleName}
        onClose={onClose}
        onPendingChange={setPending}
        onSectionChange={setSection}
        onUploaded={onUploaded}
        section={section}
        suggestions={suggestions}
      />
    </DialogShell>
  );
}

function ContextualUploadForm({
  apiBaseUrl,
  defaults,
  moduleId,
  moduleName,
  onClose,
  onPendingChange,
  onSectionChange,
  onUploaded,
  section,
  suggestions,
}: {
  apiBaseUrl: string;
  defaults: ContextualUploadDefaults;
  moduleId: string;
  moduleName: string;
  onClose: () => void;
  onPendingChange: (pending: boolean) => void;
  onSectionChange: (section: ContentSectionCode) => void;
  onUploaded: (result: ContextualUploadResult) => void;
  section: ContentSectionCode;
  suggestions: DocumentSuggestions;
}) {
  const prefix = `contextual-upload-${moduleId}`;
  const [title, setTitle] = useState("");
  const [annexNumber, setAnnexNumber] = useState("");
  const [isChoosingSection, setChoosingSection] = useState(false);
  // Solo se reemplaza un título o número que propuso el sistema: lo que la
  // persona escribió a mano no se pisa al elegir otro archivo.
  const proposedTitle = useRef("");
  const proposedAnnex = useRef("");
  const sectionSelectRef = useRef<HTMLSelectElement>(null);

  // El botón «Cambiar sección» desaparece al pulsarlo: el foco pasa al selector.
  useEffect(() => {
    if (isChoosingSection) sectionSelectRef.current?.focus();
  }, [isChoosingSection]);
  const sectionTitle = CONTENT_SECTION_TITLES[section];
  const isNormative = section === "NORMATIVA";

  function proposeAnnexFrom(text: string) {
    if (annexNumber && annexNumber !== proposedAnnex.current) return;
    const found = annexNumberFromTitle(text);
    const next = found ? String(found) : "";
    proposedAnnex.current = next;
    setAnnexNumber(next);
  }

  function handleFileChange(file: File | undefined) {
    if (!file) return;
    const suggestion = titleFromFileName(file.name);
    if (!suggestion) return;
    if (!title || title === proposedTitle.current) {
      proposedTitle.current = suggestion;
      setTitle(suggestion);
      if (section === "ANEXO") proposeAnnexFrom(suggestion);
    }
  }

  return (
    <>
      <p className="text-base leading-7 text-avend-text-muted">
        Se guardará en <strong className="text-avend-text">{sectionTitle}</strong>{" "}
        de <strong className="text-avend-text">{moduleName}</strong>. Admite PDF,
        Word (.docx o .doc) y Markdown (.md) de hasta 50 MiB; los PDF, hasta 300
        páginas.
      </p>
      {isChoosingSection ? (
        <div className="mt-3 block">
          <label className="block" htmlFor={`${prefix}-section`}>
            <span className="text-base font-semibold">Sección</span>
            <select
              aria-describedby={`${prefix}-section-help`}
              className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
              id={`${prefix}-section`}
              onChange={(event) =>
                onSectionChange(event.target.value as ContentSectionCode)
              }
              ref={sectionSelectRef}
              value={section}
            >
              {CONTENT_SECTION_CODES.map((code) => (
                <option key={code} value={code}>
                  {CONTENT_SECTION_TITLES[code]}
                </option>
              ))}
            </select>
          </label>
          <span
            className="mt-1 block text-base text-avend-text-muted"
            id={`${prefix}-section-help`}
          >
            El archivo y el título que ya escribiste se conservan.
          </span>
        </div>
      ) : (
        <button
          className="avend-button avend-button--secondary mt-3"
          onClick={() => setChoosingSection(true)}
          type="button"
        >
          Cambiar sección
        </button>
      )}

      <DocumentPdfUploadForm
        apiBaseUrl={apiBaseUrl}
        className="mt-4 grid gap-4"
        endpoint="/admin/documents"
        onCompleted={(created) => onUploaded({ created, section })}
        onPendingChange={onPendingChange}
        prepareFormData={(formData) => applyContextualMetadata(formData, section)}
        showSuccessDialog={false}
        submitLabel={SUBMIT_LABELS[section]}
        successMessage={`Documento cargado en ${sectionTitle}.`}
      >
        <input name="moduleId" type="hidden" value={moduleId} />
        <label className="block" htmlFor={`${prefix}-file`}>
          <span className="text-base font-semibold avend-field-label--required">
            Archivo (PDF, Word o Markdown)
          </span>
          <input
            accept=".pdf,.docx,.doc,.md,application/pdf"
            className="mt-1 block min-h-11 w-full text-base"
            data-autofocus="true"
            id={`${prefix}-file`}
            name="file"
            onChange={(event) => handleFileChange(event.target.files?.[0])}
            required
            type="file"
          />
        </label>
        <FieldError name="file" />
        {/* Las ayudas van fuera de la etiqueta: dentro se sumarían al nombre
            accesible del campo. */}
        <div className="block">
          <label className="block" htmlFor={`${prefix}-title`}>
            <span className="text-base font-semibold avend-field-label--required">
              Título
            </span>
            <input
              aria-describedby={`${prefix}-title-help`}
              className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
              id={`${prefix}-title`}
              maxLength={500}
              minLength={2}
              name="title"
              onChange={(event) => {
                setTitle(event.target.value);
                if (section === "ANEXO") proposeAnnexFrom(event.target.value);
              }}
              placeholder={TITLE_PLACEHOLDERS[section]}
              required
              value={title}
            />
          </label>
          <span
            className="mt-1 block text-base text-avend-text-muted"
            id={`${prefix}-title-help`}
          >
            Se propone a partir del nombre del archivo; puedes corregirlo.
          </span>
        </div>
        {section === "ANEXO" ? (
          <div className="block">
            <label className="block" htmlFor={`${prefix}-annex`}>
              <span className="text-base font-semibold">
                Número de anexo (recomendado)
              </span>
              <input
                aria-describedby={`${prefix}-annex-help`}
                className="mt-1 min-h-11 w-full max-w-[12rem] rounded-md border border-avend-border px-3 text-base"
                id={`${prefix}-annex`}
                inputMode="numeric"
                max={999}
                min={1}
                name="annexNumber"
                onChange={(event) => setAnnexNumber(event.target.value)}
                step={1}
                type="number"
                value={annexNumber}
              />
            </label>
            <span
              className="mt-1 block text-base text-avend-text-muted"
              id={`${prefix}-annex-help`}
            >
              Ordena la lista de Anexos. Si el título dice «Anexo 3», se
              completa solo.
            </span>
          </div>
        ) : null}
        <DocumentMetadataFields
          compact
          documentTypeOptions={isNormative ? NORMATIVE_UPLOAD_OPTIONS : undefined}
          initial={{
            documentType: isNormative ? undefined : section,
            issuanceYear: defaults.issuanceYear,
            issuingEntity: defaults.issuingEntity,
            issuingEntityOther: defaults.issuingEntityOther,
            specificDependency: defaults.specificDependency,
          }}
          key={section}
          lockDocumentType={!isNormative}
          otherTypeLabel="Nombre del tipo de norma"
          otherTypePlaceholder="Ej.: Decreto de Urgencia"
          required
          suggestions={suggestions}
          summarizePrefilled
        />
        <details className="rounded-md border border-avend-border px-3 py-1">
          <summary className={styles.summaryToggle}>Datos opcionales</summary>
          <div className="mt-2 grid gap-4 pb-3">
            <div className="block">
              <label className="block" htmlFor={`${prefix}-keywords`}>
                <span className="text-base font-semibold">
                  Palabras clave (opcional)
                </span>
                <input
                  aria-describedby={`${prefix}-keywords-help`}
                  className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
                  id={`${prefix}-keywords`}
                  maxLength={500}
                  minLength={2}
                  name="keywords"
                  placeholder="Ej. licencia, ascenso, nombramiento"
                />
              </label>
              <span
                className="mt-1 block text-base text-avend-text-muted"
                id={`${prefix}-keywords-help`}
              >
                Sepáralas con comas. Ayudan a encontrar el documento.
              </span>
            </div>
            <label className="block" htmlFor={`${prefix}-number`}>
              <span className="text-base font-semibold">
                Número del documento (opcional)
              </span>
              <input
                className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
                id={`${prefix}-number`}
                maxLength={120}
                name="resolutionNumber"
                placeholder="Ej.: 123-2026-MINEDU"
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
          </div>
        </details>
        <p className="text-base text-avend-text-muted">
          ¿Debes registrarlo como reemplazado o archivado?{" "}
          <Link
            className="font-semibold text-avend-accent-strong underline"
            href={`/admin/modules/${moduleId}?cargar=1#cargar-documento`}
            onClick={onClose}
          >
            Usa el formulario completo
          </Link>
          .
        </p>
      </DocumentPdfUploadForm>
    </>
  );
}

function DialogShell({
  canClose,
  children,
  onClose,
  title,
  titleId,
}: {
  canClose: boolean;
  children: ReactNode;
  onClose: () => void;
  title: string;
  titleId: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // El efecto de apertura no se repite cuando cambia `canClose` (volvería a
  // enfocar y a capturar el control de origen): el teclado lee una referencia.
  const canCloseRef = useRef(canClose);

  useEffect(() => {
    canCloseRef.current = canClose;
  }, [canClose]);

  const requestClose = useCallback(() => {
    if (canCloseRef.current) onClose();
  }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const firstField = dialog?.querySelector<HTMLElement>("[data-autofocus]");
    (firstField ?? dialog)?.focus();
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== "Tab") return;
      const current = dialogRef.current;
      if (!current) return;
      const focusable = Array.from(
        current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, [requestClose]);

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className={styles.dialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className={styles.header}>
          <h2 className={styles.title} id={titleId}>
            {title}
          </h2>
          <button
            className={styles.close}
            disabled={!canClose}
            onClick={requestClose}
            type="button"
          >
            <span aria-hidden="true">×</span>
            Cerrar
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
