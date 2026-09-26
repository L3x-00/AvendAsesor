import {
  describeAuditEvent,
  type AuditDescriptionContext,
} from "@/lib/admin-api/document-audit";
import type { DocumentAuditEvent } from "@/lib/admin-api/types";

const dateTimeFormatter = new Intl.DateTimeFormat("es-PE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Lima",
});

/** Cuántos eventos se muestran antes de plegar el resto. */
export const VISIBLE_AUDIT_EVENTS = 5;

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
 * Historial del documento en lenguaje llano. Es un registro de auditoría
 * (quién hizo qué y cuándo): no pide acciones, así que se explica en una
 * línea y solo se muestran los eventos recientes; el resto queda plegado.
 */
export function DocumentAuditHistory({
  context,
  events,
}: {
  context: AuditDescriptionContext;
  events: DocumentAuditEvent[];
}) {
  const recent = events.slice(0, VISIBLE_AUDIT_EVENTS);
  const older = events.slice(VISIBLE_AUDIT_EVENTS);

  return (
    <section
      aria-labelledby="audit-history-title"
      className="rounded-xl border border-avend-border bg-avend-surface p-5"
      id="audit-history"
    >
      <h2 className="text-xl font-bold" id="audit-history-title">
        Historial del documento
      </h2>
      <p className="mt-1 text-base text-avend-text-muted">
        Registro automático de quién hizo cada cambio y cuándo. Es solo de
        consulta: no necesitas hacer nada aquí.
      </p>
      {events.length ? (
        <>
          <ol className="mt-4 space-y-3">
            {recent.map((event) => (
              <AuditEventItem context={context} event={event} key={event.id} />
            ))}
          </ol>
          {older.length ? (
            <details className="mt-3">
              <summary className="inline-flex min-h-11 cursor-pointer items-center text-base font-semibold text-avend-navy">
                Ver {older.length} {older.length === 1 ? "evento anterior" : "eventos anteriores"}
              </summary>
              <ol className="mt-3 space-y-3" start={VISIBLE_AUDIT_EVENTS + 1}>
                {older.map((event) => (
                  <AuditEventItem context={context} event={event} key={event.id} />
                ))}
              </ol>
            </details>
          ) : null}
        </>
      ) : (
        <p className="mt-4 text-base text-avend-text-muted">
          Aún no hay eventos registrados.
        </p>
      )}
    </section>
  );
}
