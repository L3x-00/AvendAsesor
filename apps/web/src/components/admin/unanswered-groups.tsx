import Link from "next/link";
import { resolveUnansweredGroupAction } from "@/app/admin/operations/consultation-actions";
import type { UnansweredGroup } from "@/lib/consultation-reports-api/types";
import { AdminActionForm } from "./admin-action-form";
import reports from "./consultation-reports.module.css";
import styles from "./unanswered-groups.module.css";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeZone: "America/Lima",
  }).format(new Date(value));
}

function groupTitle(group: UnansweredGroup): string {
  if (group.kind === "catalog") {
    return "Preguntas sobre los documentos disponibles";
  }
  if (group.kind === "unknown" || !group.moduleName) {
    return "Sin tema identificado";
  }
  return group.parentModuleName
    ? `${group.parentModuleName} › ${group.moduleName}`
    : group.moduleName;
}

const hints: Record<UnansweredGroup["kind"], string> = {
  catalog:
    "El asistente ya responde estas preguntas mostrando los documentos disponibles y preguntas recomendadas. Puedes cerrarlas.",
  topic:
    "Falta documentación sobre este tema. Carga el documento y luego marca el grupo como resuelto: cada docente verá en su historial que ya puede volver a preguntar.",
  unknown:
    "No se identificó un tema. Revisa los casos uno por uno o ciérralos si son pruebas o mensajes sin consulta.",
};

const defaultNotes: Record<UnansweredGroup["kind"], string> = {
  catalog:
    "El asistente ya responde este tipo de pregunta con el catálogo de documentos disponibles.",
  topic:
    "Se cargó documentación sobre este tema. La consulta ya puede responderse con sustento.",
  unknown: "Revisado por la administración.",
};

function casesHref(group: UnansweredGroup, period: string): string {
  const params = new URLSearchParams({
    issueType: "support_insufficient",
    kind: "automatic_alert",
    period,
  });
  if (group.moduleId) {
    params.set(
      group.parentModuleName ? "submoduleId" : "moduleId",
      group.moduleId,
    );
  }
  return `/admin/operations?${params.toString()}#consultation-cases-title`;
}

/**
 * «¿Qué documentación falta?»: las consultas sin sustento abiertas, agrupadas
 * por tema, con la acción para cargar el documento y cerrar el grupo.
 */
export function UnansweredGroups({
  canUpload = true,
  groups,
  period,
}: {
  /** Sin acceso a Módulos no se ofrece cargar el documento (lo hará quien lo tenga). */
  canUpload?: boolean;
  /** null: el resumen no se pudo cargar (el resto de la página sigue). */
  groups: UnansweredGroup[] | null;
  period: string;
}) {
  if (!groups) {
    return (
      <section
        aria-labelledby="unanswered-groups-title"
        className={reports.section}
      >
        <div className={reports.sectionHeader}>
          <div>
            <h2 id="unanswered-groups-title">¿Qué documentación falta?</h2>
            <p>
              No pudimos preparar este resumen ahora. Los casos siguen
              disponibles más abajo; vuelve a intentarlo en unos minutos.
            </p>
          </div>
        </div>
      </section>
    );
  }
  const total = groups.reduce((sum, group) => sum + group.count, 0);

  return (
    <section
      aria-labelledby="unanswered-groups-title"
      className={reports.section}
    >
      <div className={reports.sectionHeader}>
        <div>
          <h2 id="unanswered-groups-title">¿Qué documentación falta?</h2>
          <p>
            {total === 0
              ? "No hay consultas sin sustento pendientes en este periodo."
              : `${total} ${total === 1 ? "consulta quedó" : "consultas quedaron"} sin sustento. Se agrupan por tema para que sepas qué documento cargar primero.`}
          </p>
        </div>
      </div>

      {groups.length ? (
        <ul className={styles.list}>
          {groups.map((group) => {
            const titleId = `unanswered-group-${group.kind}-${group.moduleId ?? "none"}`;
            // El formulario envía como máximo 50 casos por vez.
            const closable = group.caseIds.length;
            const defaultStatus =
              group.kind === "topic" ? "resolved" : "discarded";
            return (
              <li
                aria-labelledby={titleId}
                className={styles.group}
                data-kind={group.kind}
                key={titleId}
              >
                <div className={styles.header}>
                  <h3 id={titleId}>{groupTitle(group)}</h3>
                  <span className={styles.count}>
                    {group.count} {group.count === 1 ? "consulta" : "consultas"}
                  </span>
                </div>
                <p className={reports.meta}>
                  Última el {formatDate(group.latestAt)}
                </p>
                {group.examples.length ? (
                  <ul className={styles.examples}>
                    {group.examples.map((text) => (
                      <li key={text}>«{text}»</li>
                    ))}
                  </ul>
                ) : null}
                <p className={styles.hint}>{hints[group.kind]}</p>
                <div className={styles.actions}>
                  {canUpload && group.kind === "topic" && group.moduleId ? (
                    <Link
                      className="avend-button avend-button--primary"
                      href={`/admin/modules/${group.moduleId}?cargar=1`}
                    >
                      Cargar documento en este tema
                    </Link>
                  ) : null}
                  <Link
                    className="avend-button avend-button--secondary"
                    href={casesHref(group, period)}
                  >
                    Ver casos
                  </Link>
                </div>
                <details className={styles.resolve}>
                  <summary>
                    Cerrar{" "}
                    {closable === 1 ? "la consulta" : `${closable} consultas`}
                  </summary>
                  <AdminActionForm
                    action={resolveUnansweredGroupAction}
                    className={styles.resolveForm}
                    rules={{
                      note: [
                        { kind: "required", label: "La nota" },
                        { kind: "maxLength", label: "La nota", max: 2000 },
                      ],
                    }}
                    submitLabel={
                      closable === 1
                        ? "Cerrar consulta"
                        : `Cerrar ${closable} consultas`
                    }
                  >
                    {group.count > closable ? (
                      <p className={reports.meta}>
                        Se cierran {closable} de {group.count}; el resto queda
                        abierto para la próxima vez.
                      </p>
                    ) : null}
                    {group.caseIds.map((caseId) => (
                      <input
                        key={caseId}
                        name="caseId"
                        type="hidden"
                        value={caseId}
                      />
                    ))}
                    <input name="period" type="hidden" value={period} />
                    <label
                      className={styles.noteLabel}
                      htmlFor={`${titleId}-status`}
                    >
                      Cómo se cierra
                      <select
                        defaultValue={defaultStatus}
                        id={`${titleId}-status`}
                        name="status"
                      >
                        <option value="resolved">
                          Resuelta: se cargó la documentación (se avisa a cada
                          docente)
                        </option>
                        <option value="discarded">
                          Descartada: no requiere documento (sin aviso)
                        </option>
                      </select>
                    </label>
                    <label
                      className={styles.noteLabel}
                      htmlFor={`${titleId}-note`}
                    >
                      Nota para el historial de cada caso
                      <textarea
                        defaultValue={defaultNotes[group.kind]}
                        id={`${titleId}-note`}
                        maxLength={2000}
                        name="note"
                        rows={3}
                      />
                    </label>
                  </AdminActionForm>
                </details>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
