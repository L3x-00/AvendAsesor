
import Link from "next/link";
import { AdminPage } from "@/components/admin/admin-page";
import styles from "@/components/admin/consultation-reports.module.css";
import { createAuthorizedConsultationReportsApiContext } from "@/lib/consultation-reports-api/authorized-client";
import {
  consultationPeriodSchema,
  type ConsultationCaseSummary,
} from "@/lib/consultation-reports-api/types";

type SearchValue = string | string[] | undefined;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function one(value: SearchValue): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Lima",
  }).format(new Date(value));
}

export default async function ReviewGroupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchValue>>;
}) {
  const requested = await searchParams;

  const period =
    consultationPeriodSchema.safeParse(one(requested.period)).data ??
    "last_24h";

  const rawKind = one(requested.kind);

  const kind =
    rawKind === "topic" ||
    rawKind === "catalog" ||
    rawKind === "unknown"
      ? rawKind
      : null;

  const rawModuleId = one(requested.moduleId);

  const moduleId =
    rawModuleId && UUID_PATTERN.test(rawModuleId)
      ? rawModuleId
      : null;

  const backHref = `/admin/operations?${new URLSearchParams({
    period,
    vista: "consultar",
  }).toString()}`;

  const { client } =
    await createAuthorizedConsultationReportsApiContext();

  /*
   * Recuperamos el mismo resumen autorizado que alimenta
   * "¿Qué documentación falta?".
   *
   * El backend construye los grupos a partir de un máximo
   * de 100 casos pendientes y 100 casos en revisión.
   */
  const [groups, pending, inReview] = await Promise.all([
    client.getUnansweredGroups(period),
    client.listCases({
      issueType: "support_insufficient",
      kind: "automatic_alert",
      limit: 100,
      offset: 0,
      period,
      status: "pending",
    }),
    client.listCases({
      issueType: "support_insufficient",
      kind: "automatic_alert",
      limit: 100,
      offset: 0,
      period,
      status: "in_review",
    }),
  ]);

  /*
   * Seleccionamos un grupo que realmente exista en la
   * clasificación actual del servidor.
   */
  const group =
    groups.find(
      (item) =>
        item.kind === kind &&
        (item.moduleId ?? null) === moduleId,
    ) ?? null;

  /*
   * Utilizamos exclusivamente identificadores de casos
   * entregados por el servidor. No aceptamos listas de
   * identificadores suministradas desde la URL.
   */
  const casesById = new Map(
    [...pending, ...inReview].map((item) => [item.id, item]),
  );

  const cases: ConsultationCaseSummary[] = group
    ? group.caseIds
        .map((id) => casesById.get(id))
        .filter(
          (item): item is ConsultationCaseSummary =>
            item !== undefined,
        )
    : [];

  const groupName = group
    ? [group.parentModuleName, group.moduleName]
        .filter(Boolean)
        .join(" › ") ||
      (group.kind === "catalog"
        ? "Preguntas sobre los documentos disponibles"
        : "Sin tema identificado")
    : "Grupo no disponible";

  return (
    <AdminPage
      title="Revisión de consultas"
      description="Consulta los casos agrupados por documentación pendiente."
    >
      <main className={styles.page}>
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>{groupName}</h2>

              <p>
                {group
                  ? `${group.count} ${
                      group.count === 1
                        ? "consulta pendiente"
                        : "consultas pendientes"
                    } en este grupo.`
                  : "El grupo no está disponible o sus consultas fueron actualizadas."}
              </p>
            </div>

            <Link
              className="avend-button avend-button--secondary"
              href={backHref}
            >
              Volver a consultas
            </Link>
          </div>

          {group && group.count > cases.length ? (
            <p className={styles.meta}>
              Se muestran {cases.length} de {group.count} consultas
              identificadas. Algunas pueden haber cambiado de estado
              o quedar fuera del límite actual de 50 casos por grupo.
            </p>
          ) : null}

          {cases.length === 0 ? (
            <p className={styles.empty}>
              No hay casos abiertos disponibles para revisar en este grupo.
            </p>
          ) : (
            <ul className={styles.caseList}>
              {cases.map((item) => (
                <li className={styles.caseItem} key={item.id}>
                  <div className={styles.caseItemHeader}>
                    <span
                      className={styles.badge}
                      data-status={item.status}
                    >
                      {item.status === "pending"
                        ? "Pendiente"
                        : "En revisión"}
                    </span>

                    <time
                      className={styles.meta}
                      dateTime={item.createdAt}
                    >
                      {formatDate(item.createdAt)}
                    </time>
                  </div>

                  <p className={styles.caseQuestion}>
                    {item.questionSnapshot ??
                      item.reviewExcerpt ??
                      "Consulta sin texto disponible"}
                  </p>

                  <p className={styles.meta}>
                    Ruta registrada:{" "}
                    {item.detectedSubmoduleName ??
                      item.detectedModuleName ??
                      item.requestedModuleName ??
                      "Sin ruta detectada"}
                  </p>

                  <Link
                    className={styles.caseLink}
                    href={`/admin/operations/${item.id}`}
                  >
                    Ver detalle y gestionar caso
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </AdminPage>
  );
}
