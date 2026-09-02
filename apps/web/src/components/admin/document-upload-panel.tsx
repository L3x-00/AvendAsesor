import { DocumentPdfUploadForm } from "./document-pdf-upload-form";

interface DocumentUploadPanelProps {
  apiBaseUrl: string;
  moduleId: string;
  moduleName: string;
}

export function DocumentUploadPanel({
  apiBaseUrl,
  moduleId,
  moduleName,
}: DocumentUploadPanelProps) {
  const prefix = `module-document-${moduleId}`;

  return (
    <section
      aria-labelledby={`${prefix}-title`}
      className="avend-elevated rounded-xl border border-avend-border bg-avend-surface p-5"
    >
      <h2 className="text-xl font-bold" id={`${prefix}-title`}>
        Agregar documento
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
        <label className="block" htmlFor={`${prefix}-type`}>
          <span className="text-base font-semibold">Tipo documental</span>
          <input
            aria-describedby={`${prefix}-type-help`}
            className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
            id={`${prefix}-type`}
            maxLength={64}
            minLength={2}
            name="documentType"
            pattern="[A-Za-z][A-Za-z0-9_]{1,63}"
            placeholder="RESOLUCION_MINISTERIAL"
            required
            title="Use letras, números y guion bajo, sin espacios ni acentos."
          />
          <span
            className="mt-1 block text-sm text-avend-text-muted"
            id={`${prefix}-type-help`}
          >
            Código sin espacios, por ejemplo LEY o DECRETO_SUPREMO.
          </span>
        </label>
        <label className="block" htmlFor={`${prefix}-year`}>
          <span className="text-base font-semibold">Año (opcional)</span>
          <input
            className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
            id={`${prefix}-year`}
            max="2200"
            min="1800"
            name="issuanceYear"
            type="number"
          />
        </label>
        <label className="block" htmlFor={`${prefix}-entity`}>
          <span className="text-base font-semibold">
            Entidad emisora (opcional)
          </span>
          <input
            className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
            id={`${prefix}-entity`}
            maxLength={255}
            minLength={2}
            name="issuingEntity"
          />
        </label>
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
            Metadatos y palabras clave JSON (opcional)
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
            Para mejorar la búsqueda, usa la clave keywords con una lista de
            palabras. Debe ser un objeto JSON válido.
          </span>
        </label>
      </DocumentPdfUploadForm>
    </section>
  );
}
