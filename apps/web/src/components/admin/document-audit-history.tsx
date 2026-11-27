import {
  describeAuditEvent,
  type AuditDescriptionContext,
} from "@/lib/admin-api/document-audit";
import type { DocumentAuditEvent } from "@/lib/admin-api/types";
import styles from "./document-audit-history.module.css";

const dateTimeFormatter = new Intl.DateTimeFormat("es-PE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Lima",
});

function AuditEventItem({
  context,
  event,
}: {
  context: AuditDescriptionContext;
  event: DocumentAuditEvent;
}) {
  const described = describeAuditEvent(event, context);

  return (
    <li
      className={`rounded-lg border border-avend-border p-4 ${described.routine ? "bg-avend-surface-muted" : "bg-avend-surface"}`}
    >
      <h3 className="text-base font-bold">{described.title}</h3>
      <p className="mt-1 text-base text-avend-text-muted">
        <time dateTime={event.occurredAt}>
          {dateTimeFormatter.format(new Date(event.occurredAt))}
        </time>{" "}
        · {event.actorName ?? "Sistema"}
      </p>
      {described.details.length ? (
        <ul className="mt-2 space-y-1 text-base" role="list">
          {described.details.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * Las acciones frecuentes (abrir o descargar el PDF) se repiten muchas veces.
 * Se agrupan por tipo y solo se conserva la más reciente para no llenar el
 * historial con decenas de filas idénticas.
 */
export function latestAuditEvent(
  events: DocumentAuditEvent[],
): DocumentAuditEvent | undefined {
  const newestByAction = new Map<string, DocumentAuditEvent>();
  for (const event of events) {
    const current = newestByAction.get(event.action);
    if (
      !current ||
      new Date(event.occurredAt).getTime() >
        new Date(current.occurredAt).getTime()
    ) {
      newestByAction.set(event.action, event);
    }
  }
  return [...newestByAction.values()].sort(
    (left, right) =>
      new Date(right.occurredAt).getTime() -
      new Date(left.occurredAt).getTime(),
  )[0];
}

/**
 * Historial del documento en lenguaje llano, plegado por defecto para no
 * alargar el diálogo. Muestra únicamente la última acción registrada; las
 * acciones repetidas se resumen en su versión más reciente.
 */
export function DocumentAuditHistory({
  context,
  events,
}: {
  context: AuditDescriptionContext;
  events: DocumentAuditEvent[];
}) {
  const latest = latestAuditEvent(events);

  return (
    <details
      className="rounded-xl border border-avend-border bg-avend-surface p-5"
      id="audit-history"
    >
      <summary className={`${styles.summary} inline-flex min-h-11 cursor-pointer list-none items-center gap-0.5 text-xl font-bold text-avend-navy`}>
        Historial del documento
        <svg
          aria-hidden="true"
          className={`${styles.chevron} ml-1 h-5 w-5`}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <p className="mt-1 text-base text-avend-text-muted">
        Registro automático de quién hizo cada cambio y cuándo. Es solo de
        consulta: no necesitas hacer nada aquí.
      </p>
      {latest ? (
        <>
          <p className="mt-3 text-base font-semibold text-avend-text-muted">
            Última acción registrada
          </p>
          <ol className="mt-2">
            <AuditEventItem context={context} event={latest} />
          </ol>
        </>
      ) : (
        <p className="mt-4 text-base text-avend-text-muted">
          Aún no hay eventos registrados.
        </p>
      )}
    </details>
  );
}
