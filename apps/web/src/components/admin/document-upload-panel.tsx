import type { DocumentSuggestions } from "@/lib/admin-api/types";
import { DocumentMetadataFields } from "./document-metadata-fields";
import { DocumentPdfUploadForm } from "./document-pdf-upload-form";

interface DocumentUploadPanelProps {
  apiBaseUrl: string;
  moduleId: string;
  moduleName: string;
  replacementCandidates: { id: string; title: string }[];
  suggestions: DocumentSuggestions;
}

export function DocumentUploadPanel({
  apiBaseUrl,
  moduleId,
  moduleName,
  replacementCandidates,
  suggestions,
}: DocumentUploadPanelProps) {
  const prefix = `module-document-${moduleId}`;

  return (
    <section
      aria-labelledby={`${prefix}-title`}
      className="avend-elevated rounded-xl border border-avend-border bg-avend-surface p-5"
    >
      <h2 className="text-xl font-bold" id={`${prefix}-title`}>
        + Agregar documento
      </h2>
      <p className="mt-1 text-base leading-7 text-avend-text-muted">
        El PDF quedará asociado a <strong>{moduleName}</strong>. El formulario
        conserva sus datos ante un error y admite hasta 20 MiB y 300 páginas.
      </p>
      <DocumentPdfUploadForm
        apiBaseUrl={apiBaseUrl}
        className="mt-5 grid gap-4 lg:grid-cols-2"
        endpoint="/admin/documents"
        submitLabel="Cargar documento PDF"
        successMessage="Documento PDF creado y asociado."
      >
        <input name="moduleId" type="hidden" value={moduleId} />
        <label className="block lg:col-span-2" htmlFor={`${prefix}-file`}>
          <span className="text-base font-semibold">Archivo PDF</span>
          <input
            accept="application/pdf,.pdf"
            className="mt-1 block min-h-11 w-full text-base"
            id={`${prefix}-file`}
            name="file"
            required
            type="file"
          />
        </label>
        <label className="block lg:col-span-2" htmlFor={`${prefix}-name`}>
          <span className="text-base font-semibold">Título</span>
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
          includeSituation
          replacementCandidates={replacementCandidates}
          required
          suggestions={suggestions}
        />
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
        <label className="block lg:col-span-2" htmlFor={`${prefix}-metadata`}>
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
      </DocumentPdfUploadForm>
    </section>
  );
}
