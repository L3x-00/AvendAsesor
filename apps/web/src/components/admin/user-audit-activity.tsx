"use client";

import { useState } from "react";
import {
  formatOperationalAuditAction,
  formatOperationalAuditDetail,
  formatOperationalAuditResourceType,
  formatUserRole,
} from "@/lib/admin-api/labels";
import type { OperationalAuditEvent } from "@/lib/admin-api/types";
import styles from "./user-audit-activity.module.css";

export const AUDIT_ACTIVITY_PAGE_SIZE = 10;

const auditDateFormatter = new Intl.DateTimeFormat("es-PE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Lima",
});

function formatAuditDate(value: string): string {
  return auditDateFormatter.format(new Date(value));
}

export function UserAuditActivity({
  events,
}: {
  events: OperationalAuditEvent[];
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(
    1,
    Math.ceil(events.length / AUDIT_ACTIVITY_PAGE_SIZE),
  );
  const safePage = Math.min(currentPage, totalPages);
  const visibleStart = (safePage - 1) * AUDIT_ACTIVITY_PAGE_SIZE;
  const visibleEvents = events.slice(
    visibleStart,
    visibleStart + AUDIT_ACTIVITY_PAGE_SIZE,
  );
  const firstVisible = events.length === 0
    ? 0
    : (safePage - 1) * AUDIT_ACTIVITY_PAGE_SIZE + 1;
  const lastVisible = Math.min(
    safePage * AUDIT_ACTIVITY_PAGE_SIZE,
    events.length,
  );

  if (events.length === 0) {
    return (
      <p className="avend-content-empty">
        Aún no hay eventos administrativos para mostrar.
      </p>
    );
  }

  return (
    <>
      <p aria-live="polite" className={styles.summary}>
        Mostrando {firstVisible}–{lastVisible} de {events.length} eventos.
      </p>
      <div className="avend-audit-scroll">
        <table className="avend-audit-table" role="table">
          <caption className="avend-visually-hidden">
            Actividad administrativa auditada
          </caption>
          <thead role="rowgroup">
            <tr role="row">
              <th role="columnheader" scope="col">Acción</th>
              <th role="columnheader" scope="col">Rol ejecutor</th>
              <th role="columnheader" scope="col">Recurso</th>
              <th role="columnheader" scope="col">Detalle</th>
              <th role="columnheader" scope="col">Fecha</th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {visibleEvents.map((event) => (
              <tr className={styles.row} key={event.id} role="row">
                <td data-label="Acción" role="cell">
                  {formatOperationalAuditAction(event.action)}
                </td>
                <td data-label="Rol ejecutor" role="cell">
                  {formatUserRole(event.actorRole)}
                </td>
                <td data-label="Recurso" role="cell">
                  {formatOperationalAuditResourceType(event.resourceType)}
                </td>
                <td data-label="Detalle" role="cell">
                  {formatOperationalAuditDetail(event) ?? "—"}
                </td>
                <td data-label="Fecha" role="cell">
                  {formatAuditDate(event.occurredAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 ? (
        <nav aria-label="Paginación de actividad auditada" className={styles.pagination}>
          <button
            className={styles.pageButton}
            disabled={safePage === 1}
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            type="button"
          >
            Anterior
          </button>
          <span className={styles.pageCurrent}>
            Página {safePage} de {totalPages}
          </span>
          <button
            className={styles.pageButton}
            disabled={safePage === totalPages}
            onClick={() =>
              setCurrentPage((page) => Math.min(totalPages, page + 1))
            }
            type="button"
          >
            Siguiente
          </button>
        </nav>
      ) : null}
    </>
  );
}
