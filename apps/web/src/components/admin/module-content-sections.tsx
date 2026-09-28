import Link from "next/link";
import { documentTypeLabel } from "@/lib/admin-api/document-taxonomy";
import type { DocumentLibraryItem } from "@/lib/admin-api/types";

const NORMATIVE_TYPES = new Set([
  "DECRETO_LEGISLATIVO",
  "DECRETO_SUPREMO",
  "DIRECTIVA",
  "LEY",
  "NORMA_TECNICA",
  "REGLAMENTO",
  "RESOLUCION_DIRECTORAL",
  "RESOLUCION_MINISTERIAL",
  "RESOLUCION_VICEMINISTERIAL",
]);

interface ContentSection {
  code: string;
  hint: string;
  matches: (document: DocumentLibraryItem) => boolean;
  title: string;
}

const SECTIONS: ContentSection[] = [
  {
    code: "NORMATIVA",
    hint: "Leyes, resoluciones, decretos y directivas.",
    matches: (document) => NORMATIVE_TYPES.has(document.documentType),
    title: "Normativa",
  },
  {
    code: "CRONOGRAMA",
    hint: "Fechas y etapas de los procesos.",
    matches: (document) => document.documentType === "CRONOGRAMA",
    title: "Cronograma",
  },
  {
    code: "ANEXO",
    hint: "Formatos y anexos numerados.",
    matches: (document) => document.documentType === "ANEXO",
    title: "Anexos",
  },
  {
    code: "PREGUNTAS_FRECUENTES",
    hint: "Respuestas a las dudas más repetidas.",
    matches: (document) => document.documentType === "PREGUNTAS_FRECUENTES",
    title: "Preguntas frecuentes",
  },
];

/**
 * Número de anexo: se lee de `metadata.annexNumber` y, si no existe, del
 * propio título («Anexo N° 5», «Anexo 5»). Así el listado siempre sale en
 * orden numérico aunque el administrador no rellene ningún campo extra.
 */
export function annexNumber(document: {
  metadata: Record<string, unknown>;
  title: string;
}): number | null {
  const value = document.metadata.annexNumber;
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && /^\d{1,6}$/u.test(value.trim())) {
    return Number(value.trim());
  }
  const match = /anexo\s*(?:n[°º.]?\s*)?(\d{1,6})/iu.exec(document.title);
  return match ? Number(match[1]) : null;
}

function situationText(document: DocumentLibraryItem): string {
  if (document.situation === "current") return "Vigente";
  if (document.situation === "replaced") return "Reemplazado / sin vigencia";
  return "Archivado";
}

function sortedItems(
  code: string,
  items: DocumentLibraryItem[],
): DocumentLibraryItem[] {
  if (code === "ANEXO") {
    return [...items].sort(
      (left, right) =>
        (annexNumber(left) ?? Number.POSITIVE_INFINITY) -
          (annexNumber(right) ?? Number.POSITIVE_INFINITY) ||
        (right.issuanceYear ?? 0) - (left.issuanceYear ?? 0) ||
        left.title.localeCompare(right.title, "es"),
    );
  }
  return [...items].sort(
    (left, right) =>
      (right.issuanceYear ?? 0) - (left.issuanceYear ?? 0) ||
      left.title.localeCompare(right.title, "es"),
  );
}

function DocumentQuickActions({ document }: { document: DocumentLibraryItem }) {
  return (
    <p className="mt-2 flex flex-wrap gap-4 text-sm">
      <Link
        className="font-semibold underline"
        href={`/admin/documents/${document.id}`}
      >
        Ver y editar
      </Link>
      <Link
        className="font-semibold underline"
        href={`/admin/documents/${document.id}#new-version`}
      >
        Nueva versión
      </Link>
      <Link
        className="font-semibold underline"
        href={`/admin/documents/${document.id}#document-lifecycle`}
      >
        Archivar o desactivar
      </Link>
    </p>
  );
}

function DocumentLine({
  code,
  document,
}: {
  code: string;
  document: DocumentLibraryItem;
}) {
  const number = code === "ANEXO" ? annexNumber(document) : null;
  return (
    <li className="rounded-md bg-avend-surface-muted p-3">
      <p className="text-base font-semibold">
        {number ? `Anexo ${number}: ` : ""}
        {document.title}
      </p>
      <p className="text-sm text-avend-text-muted">
        {documentTypeLabel(document.documentType)}
        {document.issuanceYear ? ` · ${document.issuanceYear}` : ""} ·{" "}
        {situationText(document)}
      </p>
      <DocumentQuickActions document={document} />
    </li>
  );
}

/**
 * Contenido del tema ordenado por secciones estándar (normativa, cronograma,
 * anexos numerados y preguntas frecuentes) con acciones directas por
 * documento y un botón para subir cada tipo sin buscar el formulario.
 */
export function ModuleContentSections({
  canUpload,
  documents,
  moduleId,
}: {
  canUpload: boolean;
  documents: DocumentLibraryItem[];
  moduleId: string;
}) {
  const sections = SECTIONS.map((section) => ({
    ...section,
    items: sortedItems(
      section.code,
      documents.filter((document) => section.matches(document)),
    ),
  }));
  const others = sortedItems(
    "OTROS",
    documents.filter(
      (document) => !SECTIONS.some((section) => section.matches(document)),
    ),
  );

  return (
    <section
      aria-labelledby="module-content-title"
      className="rounded-xl border border-avend-border bg-avend-surface p-5"
    >
      <h2 className="text-xl font-bold" id="module-content-title">
        Contenido del tema
      </h2>
      <p className="mt-1 text-base leading-7 text-avend-text-muted">
        Normativa, cronograma, anexos y preguntas frecuentes ordenados para
        encontrarlos rápido. Los anexos se ordenan por su número.
      </p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {sections.map((section) => (
          <article
            className="rounded-lg border border-avend-border p-4"
            key={section.code}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-bold">
                {section.title} ({section.items.length})
              </h3>
              {canUpload ? (
                <Link
                  className="font-semibold underline"
                  href={`/admin/modules/${moduleId}?cargar=1&tipo=${section.code}#cargar-documento`}
                >
                  + Subir {section.title.toLowerCase()}
                </Link>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-avend-text-muted">{section.hint}</p>
            {section.items.length === 0 ? (
              <p className="mt-2 text-base text-avend-text-muted">
                Sin {section.title.toLowerCase()} todavía.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {section.items.map((document) => (
                  <DocumentLine
                    code={section.code}
                    document={document}
                    key={document.id}
                  />
                ))}
              </ul>
            )}
          </article>
        ))}
        {others.length ? (
          <article className="rounded-lg border border-avend-border p-4">
            <h3 className="text-base font-bold">
              Otros documentos ({others.length})
            </h3>
            <p className="mt-1 text-sm text-avend-text-muted">
              Otros tipos cargados en este tema.
            </p>
            <ul className="mt-2 space-y-2">
              {others.map((document) => (
                <DocumentLine
                  code="OTROS"
                  document={document}
                  key={document.id}
                />
              ))}
            </ul>
          </article>
        ) : null}
      </div>
    </section>
  );
}
