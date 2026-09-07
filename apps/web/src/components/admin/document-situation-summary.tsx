import Link from "next/link";
import { archiveReasonLabel } from "@/lib/admin-api/document-taxonomy";
import type { ManagedDocumentDetails } from "@/lib/admin-api/types";

const dayFormatter = new Intl.DateTimeFormat("es-PE", {
  dateStyle: "long",
  timeZone: "America/Lima",
});

/**
 * La fecha de reemplazo es un día del calendario, no un instante: se fija a
 * mediodía UTC para que Lima (UTC-5) no la retroceda un día.
 */
function formatReplacementDay(value: string): string {
  return dayFormatter.format(new Date(`${value}T12:00:00.000Z`));
}

interface DocumentSituationSummaryProps {
  document: Pick<
    ManagedDocumentDetails,
    | "archiveObservation"
    | "archiveReasonCode"
    | "archiveReasonDetail"
    | "deactivationReason"
    | "replacementDate"
    | "replacementDocumentId"
    | "replacementObservation"
    | "replacementReason"
    | "replacementYear"
    | "situation"
  >;
  replacement: { id: string; title: string } | null;
}

/**
 * El punto 12 del requerimiento: un documento reemplazado o archivado debe
 * mostrar por qué perdió vigencia y, cuando corresponde, abrir el documento que
 * lo sustituye. Estos datos ya viajaban en el contrato pero no se pintaban en
 * ninguna parte de la ficha.
 */
export function DocumentSituationSummary({
  document,
  replacement,
}: DocumentSituationSummaryProps) {
  if (document.situation === "current") return null;

  const isReplaced = document.situation === "replaced";
  const observation = isReplaced
    ? document.replacementObservation
    : document.archiveObservation;

  return (
    <section
      aria-labelledby="document-situation-summary"
      className="rounded-xl border border-amber-300 bg-amber-50 p-5"
      id="situation-detail"
    >
      <h2
        className="text-xl font-bold text-amber-900"
        id="document-situation-summary"
      >
        {isReplaced ? "Reemplazado / Sin vigencia" : "Documento archivado"}
      </h2>
      <dl className="mt-4 grid gap-4 text-base sm:grid-cols-2">
        {isReplaced ? (
          <div className="sm:col-span-2">
            <dt className="font-semibold text-amber-900">
              Documento que lo reemplaza
            </dt>
            <dd className="mt-1">
              {replacement ? (
                <Link
                  className="font-semibold text-avend-navy underline"
                  href={`/admin/documents/${replacement.id}`}
                >
                  {replacement.title}
                </Link>
              ) : document.replacementDocumentId ? (
                "El documento que lo reemplaza ya no está disponible."
              ) : (
                "Aún no está registrado en la biblioteca."
              )}
            </dd>
          </div>
        ) : null}

        {isReplaced ? (
          <div>
            <dt className="font-semibold text-amber-900">
              Fecha o año del reemplazo
            </dt>
            <dd className="mt-1">
              {document.replacementDate
                ? formatReplacementDay(document.replacementDate)
                : (document.replacementYear ?? "No registrado")}
            </dd>
          </div>
        ) : null}

        <div>
          <dt className="font-semibold text-amber-900">Motivo</dt>
          <dd className="mt-1">
            {isReplaced
              ? (document.replacementReason ?? "No registrado")
              : document.archiveReasonCode
                ? archiveReasonLabel(document.archiveReasonCode)
                : (document.deactivationReason ?? "No registrado")}
          </dd>
        </div>

        {!isReplaced && document.archiveReasonDetail ? (
          <div className="sm:col-span-2">
            <dt className="font-semibold text-amber-900">
              Detalle del motivo
            </dt>
            <dd className="mt-1">{document.archiveReasonDetail}</dd>
          </div>
        ) : null}

        {observation ? (
          <div className="sm:col-span-2">
            <dt className="font-semibold text-amber-900">Observación</dt>
            <dd className="mt-1">{observation}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
