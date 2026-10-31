import Link from "next/link";
import type { UnansweredGroup } from "@/lib/consultation-reports-api/types";
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
function groupDisplayTitle(group: UnansweredGroup): string {
  if (group.kind === "topic" && group.moduleName) {
    return group.moduleName;
  }

  return groupTitle(group);
}

const hints: Record<UnansweredGroup["kind"], string> = {
  catalog:
    "El asistente ya responde estas preguntas mostrando los documentos disponibles y preguntas recomendadas. Puedes cerrarlas.",
  topic:
    "Falta documentación sobre este tema. Carga el documento y luego marca el grupo como resuelto: cada docente verá en su historial que ya puede volver a preguntar.",
  unknown:
    "No se identificó un tema. Revisa los casos uno por uno o ciérralos si son pruebas o mensajes sin consulta.",
};

/**
 * Iconos de la carpeta `public/icons` que mejor describen cada tema. Solo es
 * una pista visual: si ningún tema coincide se usa el icono genérico.
 */
const groupIconRules: Array<{ icon: string; pattern: RegExp }> = [
  {
    icon: "renumeracion",
    pattern:
      /remunera|salario|gratificaci|bonificaci|asignaci[oó]n|escala|haber/i,
  },
  {
    icon: "ley",
    pattern: /\bley\b|leyes|norma|reglamento|legal|legislaci|jur[ií]dic|decreto|resoluci/i,
  },
  {
    icon: "evaluacion",
    pattern: /evaluaci|desempe|monitoreo|calificaci|acompa[ñn]amiento/i,
  },
  { icon: "auxiliar", pattern: /auxiliar|apoyo|asistente/i },
  {
    icon: "contrato",
    pattern: /contrato|nombramiento|designaci|vinculaci|\bcas\b/i,
  },
  { icon: "plaza", pattern: /plaza|vacante|cargo|puesto/i },
];

function groupIcon(group: UnansweredGroup): string | null {
  if (group.kind !== "topic") return null;
  const haystack = `${group.parentModuleName ?? ""} ${group.moduleName ?? ""}`;
  return (
    groupIconRules.find((rule) => rule.pattern.test(haystack))?.icon ?? null
  );
}

function groupReviewHref(group: UnansweredGroup, period: string): string {
  const params = new URLSearchParams({
    kind: group.kind,
    period,
  });

  if (group.moduleId) {
    params.set("moduleId", group.moduleId);
  }

  return `/admin/operations/grupos/revisar?${params.toString()}`;
}

function DocumentIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="20"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="20"
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="20"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="20"
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

function FallbackIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="22"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="22"
    >
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v18H6.5A2.5 2.5 0 0 1 4 18.5z" />
      <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v18h4.5A2.5 2.5 0 0 0 20 18.5z" />
    </svg>
  );
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
        className={`${reports.section} ${styles.missingDocs}`}
      >
        <div className={reports.sectionHeader}>
          <div className={styles.titleBlock}>
            <h2 id="unanswered-groups-title">¿Qué documentación falta?</h2>
            <p className={styles.lead}>
              No pudimos preparar este resumen ahora. Los casos siguen
              disponibles más abajo; vuelve a intentarlo en unos minutos.
            </p>
          </div>
        </div>
      </section>
    );
  }
  const total = groups.reduce((sum, group) => sum + group.count, 0);
  const pendingTopics = groups.filter((group) => group.kind === "topic").length;

  return (
    <section
      aria-labelledby="unanswered-groups-title"
      className={`${reports.section} ${styles.missingDocs}`}
    >
      <div className={reports.sectionHeader}>
        <div className={styles.titleBlock}>
          <h2 id="unanswered-groups-title">¿Qué documentación falta?</h2>
          <p className={styles.lead}>
            {total === 0
              ? "No hay consultas sin sustento pendientes en este periodo."
              : "Revisa las consultas, carga el documento correspondiente y cierra los casos cuando estén resueltos."}
          </p>
        </div>
      </div>

      {total > 0 ? (
        <div
          aria-label="Resumen de consultas sin sustento"
          className={styles.summaryStrip}
          role="group"
        >
          <p className={styles.summaryItem}>
            <span className={styles.summaryIcon} aria-hidden="true">
              <DocumentIcon />
            </span>
            <strong>
              {total}{" "}
              {total === 1
                ? "consulta quedó sin sustento"
                : "consultas quedaron sin sustento"}
            </strong>
          </p>
          {pendingTopics > 0 ? (
            <p className={styles.summaryItem}>
              <span className={styles.summaryIcon} aria-hidden="true">
                <FolderIcon />
              </span>
              <strong>
                {pendingTopics}{" "}
                {pendingTopics === 1 ? "tema pendiente" : "temas pendientes"}
              </strong>
            </p>
          ) : null}
        </div>
      ) : null}

      {groups.length ? (
        <ul className={styles.list}>
          {groups.map((group) => {
            const titleId = `unanswered-group-${group.kind}-${group.moduleId ?? "none"}`;
            // El formulario envía como máximo 50 casos por vez.
            const closable = group.caseIds.length;
            const closeParams = new URLSearchParams({
              kind: group.kind,
              period,
            });
            if (group.moduleId) closeParams.set("moduleId", group.moduleId);
            const icon = groupIcon(group);
            return (
              <li
                aria-label={groupTitle(group)}
                className={styles.group}
                data-kind={group.kind}
                key={titleId}
              >
                <div className={styles.header}>
                  <span
                    aria-hidden="true"
                    className={styles.groupIcon}
                    data-icon={icon ?? undefined}
                  >
                    {icon ? null : <FallbackIcon />}
                  </span>

                  <div className={styles.heading}>
                    {group.parentModuleName ? (
                      <span className={styles.parentLabel}>
                        {group.parentModuleName}
                      </span>
                    ) : null}

                    <h3 id={titleId}>{groupDisplayTitle(group)}</h3>
                    <p className={styles.lastSeen}>
                      Última consulta: {formatDate(group.latestAt)}
                    </p>
                  </div>

                  <span className={styles.count}>
                    {group.count} {group.count === 1 ? "consulta" : "consultas"}
                  </span>
                </div>

                {group.examples.length ? (
                  <div className={styles.panel}>
                    <p className={styles.panelLabel}>Consultas recientes</p>
                    <ul className={styles.examples}>
                      {group.examples.map((text) => (
                        <li key={text}>«{text}»</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {group.kind !== "topic" ? (
                  <div className={styles.panel}>
                    <p className={styles.panelLabel}>Qué hacer</p>
                    <p className={styles.hint}>{hints[group.kind]}</p>
                  </div>
                ) : null}

                {group.count > closable ? (
                  <p className={styles.note}>
                    Puedes revisar {closable} de {group.count} consultas en la
                    pantalla de cierre; el resto sigue pendiente.
                  </p>
                ) : null}

                <div className={styles.actions}>
                  {canUpload && group.kind === "topic" && group.moduleId ? (
                    <Link
                      className={`avend-button avend-button--primary ${styles.actionPrimary}`}
                      href={`/admin/modules/${group.moduleId}?cargar=1`}
                    >
                      Cargar documento en este tema
                    </Link>
                  ) : null}
                  <Link
                    className="avend-button avend-button--secondary"
                    href={
                      group.count === 1 && group.caseIds.length === 1
                        ? `/admin/operations/${group.caseIds[0]}`
                        : groupReviewHref(group, period)
                    }
                  >
                    {group.count === 1 ? "Ver caso" : "Ver casos"}
                  </Link>
                  <Link
                    className="avend-button avend-button--secondary"
                    href={`/admin/operations/grupos/cerrar?${closeParams.toString()}`}
                  >
                    Cerrar {closable === 1 ? "la consulta" : `${closable} consultas`}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
