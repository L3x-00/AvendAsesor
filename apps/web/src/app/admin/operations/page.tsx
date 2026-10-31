import Link from "next/link";
import type { ReactNode } from "react";
import { AdminPage } from "@/components/admin/admin-page";
import styles from "@/components/admin/consultation-reports.module.css";
import { UnansweredGroups } from "@/components/admin/unanswered-groups";
import { createAuthorizedConsultationReportsApiContext } from "@/lib/consultation-reports-api/authorized-client";
import {
  consultationCaseIssueSchema,
  consultationCaseKindSchema,
  consultationCaseStatusSchema,
  consultationPeriodSchema,
  type ConsultationCaseSummary,
  type ConsultationPeriod,
  type ConsultationReportsDashboard,
} from "@/lib/consultation-reports-api/types";

type SearchValue = string | string[] | undefined;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CASES_PER_PAGE = 50;

function one(value: SearchValue): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function uuid(value: SearchValue): string | undefined {
  const candidate = one(value);
  return candidate && uuidPattern.test(candidate) ? candidate : undefined;
}

function pageNumber(value: SearchValue): number {
  const candidate = one(value);
  if (!candidate || !/^[1-9]\d*$/u.test(candidate)) return 1;
  const page = Number(candidate);
  return Number.isSafeInteger(page) && page <= 10_000 ? page : 1;
}

function queryString(
  values: Record<string, number | string | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return params.toString();
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Lima",
  }).format(new Date(value));
}

const statusLabels = {
  pending: "Pendiente",
  in_review: "En revisión",
  resolved: "Resuelto",
  discarded: "Descartado",
} as const;

const kindLabels = {
  automatic_alert: "Alerta automática",
  teacher_report: "Reporte docente",
  teacher_suggestion: "Sugerencia docente",
} as const;

const issueLabels = {
  support_insufficient: "Sin sustento suficiente",
  support_partial: "Sustento parcial",
  stale_document: "Posible uso de documentación no vigente",
  citation_insufficient: "Citas insuficientes",
  possible_contradiction: "Posible contradicción",
  low_confidence: "Baja confianza",
  technical_error: "Error técnico",
  ambiguous_request: "Consulta ambigua",
  teacher_report: "Reporte docente",
  teacher_suggestion: "Sugerencia docente",
} as const;

const reportReasonLabels = {
  answer_not_relevant: "La respuesta no corresponde",
  information_outdated: "La información parece desactualizada",
  citation_does_not_support: "La cita no sustenta la respuesta",
  missing_information: "Falta información",
  answer_unclear: "La respuesta es confusa",
  other: "Otro",
} as const;

type IconName =
  | "bulb"
  | "chart"
  | "chat"
  | "document"
  | "flag"
  | "refresh"
  | "users"
  | "warning";

function IconGraphic({ name }: { name: IconName }) {
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
      {iconPaths[name]}
    </svg>
  );
}

const iconPaths: Record<IconName, ReactNode> = {
  chat: (
    <path d="M20.5 11.5a8.5 8.5 0 0 1-8.5 8.5 8.6 8.6 0 0 1-3.9-1L3 21l1.9-4.6a8.5 8.5 0 1 1 15.6-4.9z" />
  ),
  chart: <path d="M5 20V12M11 20V5M17 20v-9" />,
  document: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </>
  ),
  flag: (
    <>
      <path d="M5 21V4" />
      <path d="M5 5h11l-1.6 3L16 11H5z" />
    </>
  ),
  bulb: (
    <>
      <path d="M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z" />
      <path d="M10 19h4M10.5 22h3" />
    </>
  ),
  users: (
    <>
      <path d="M16 20v-1.6a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 20v-1.6a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
    </>
  ),
  refresh: (
    <>
      <path d="M3 12a9 9 0 0 1 15.3-6.4L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.3 6.4L3 16" />
      <path d="M3 21v-5h5" />
    </>
  ),
  warning: (
    <>
      <path d="M12 4 21 20H3z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
};

type MetricTone = "attention" | "info" | "risk" | "success";

function MetricCard({
  label,
  value,
  hint,
  icon,
  tone = "info",
}: {
  hint: string;
  icon: IconName;
  label: string;
  tone?: MetricTone;
  value: number | string;
}) {
  return (
    <div className={styles.metric} data-tone={tone}>
      <dt>
        {label}
        <span aria-hidden="true" className={styles.metricIcon}>
          <IconGraphic name={icon} />
        </span>
      </dt>
      <dd>
        {value}
        <small>{hint}</small>
      </dd>
    </div>
  );
}

function MetricGroup({
  children,
  icon,
  title,
}: {
  children: ReactNode;
  icon: IconName;
  title: string;
}) {
  return (
    <div className={styles.metricGroup}>
      <h3 className={styles.groupTitle}>
        <span aria-hidden="true" className={styles.groupIcon}>
          <IconGraphic name={icon} />
        </span>
        {title}
      </h3>
      <dl className={styles.metrics}>{children}</dl>
    </div>
  );
}

function HighlightCard({
  countLabel,
  footnote,
  icon,
  module,
  submodule,
  title,
  titleId,
  tone,
}: {
  countLabel: "consultas" | "incidencias";
  footnote: string;
  icon: IconName;
  module: { count: number; name: string } | null;
  submodule: { count: number; name: string } | null;
  title: string;
  titleId: string;
  tone: MetricTone;
}) {
  const plural = countLabel === "consultas" ? "consultas" : "incidencias";
  const singular = countLabel === "consultas" ? "consulta" : "incidencia";
  const rows = [
    { item: module, label: "Módulo" },
    { item: submodule, label: "Submódulo" },
  ];

  return (
    <section aria-labelledby={titleId} className={styles.section}>
      <h2 className={styles.highlightTitle} id={titleId}>
        <span
          aria-hidden="true"
          className={styles.highlightIcon}
          data-tone={tone}
        >
          <IconGraphic name={icon} />
        </span>
        {title}
      </h2>
      <dl className={styles.highlightRows}>
        {rows.map(({ item, label }) => (
          <div className={styles.highlightRow} key={label}>
            <dt>{label}</dt>
            <dd>
              <span className={styles.highlightName}>
                {item ? item.name : "Sin datos"}
              </span>
              {item ? (
                <span className={styles.highlightCount} data-tone={tone}>
                  {item.count} {item.count === 1 ? singular : plural}
                </span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
      <p className={styles.highlightNote}>{footnote}</p>
    </section>
  );
}

function Ranking({
  title,
  items,
  period,
  filter,
}: {
  filter: "moduleId" | "submoduleId";
  items: ConsultationReportsDashboard["consultationModules"];
  period: ConsultationPeriod;
  title: string;
}) {
  return (
    <section className={styles.ranking}>
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className={styles.empty}>No hay datos para este periodo.</p>
      ) : (
        <ol role="list">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/admin/operations?${queryString({ [filter]: item.id, period, vista: "consultar" })}`}
              >
                <span>{item.name}</span>
                <strong>{item.count}</strong>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function TopicsRanking({
  period,
  topics,
}: {
  period: ConsultationPeriod;
  topics: Array<{
    count: number;
    id: string;
    moduleId: string;
    name: string;
    topicKind: "module" | "submodule";
  }>;
}) {
  return (
    <section className={styles.ranking}>
      <h3>Temas más consultados</h3>
      <p className={styles.meta}>
        Se agrupan por la ruta más específica detectada.
      </p>
      {topics.length === 0 ? (
        <p className={styles.empty}>
          No hay rutas detectadas para este periodo.
        </p>
      ) : (
        <ol role="list">
          {topics.map((topic) => (
            <li key={topic.id}>
              <Link
                href={`/admin/operations?${queryString({
                  [topic.topicKind === "submodule"
                    ? "submoduleId"
                    : "moduleId"]: topic.id,
                  period,
                  vista: "consultar",
                })}`}
              >
                <span>{topic.name}</span>
                <strong>{topic.count}</strong>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ReviewPriorities({
  items,
}: {
  items: Array<{
    caseId: string;
    createdAt: string;
    issueTypes: Array<keyof typeof issueLabels>;
    openCaseCount: number;
    priority: "critical" | "high" | "medium";
    questionSnapshot: string | null;
    reviewExcerpt: string | null;
  }>;
}) {
  const priorityLabels = {
    critical: "Crítica",
    high: "Alta",
    medium: "Media",
  } as const;

    return (
    <details
      className={`${styles.section} ${styles.collapsibleSection}`}
    >
      <summary className={styles.collapsibleHeader}>
        <div className={styles.collapsibleHeading}>
          <h2 id="consultation-priorities-title">
            Respuestas con mayor necesidad de revisión
          </h2>
          <p>
            Solo se muestran respuestas con casos abiertos. La prioridad toma en
            cuenta la severidad y los tipos distintos de incidencia.
          </p>
        </div>

        <span className={styles.collapsibleIndicator} aria-hidden="true">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </summary>

      <div className={styles.collapsibleContent}>
      {items.length === 0 ? (
        <p className={styles.empty}>
          No hay respuestas abiertas que requieran revisión en este periodo.
        </p>
      ) : (
        <ol className={styles.priorityList}>
          {items.map((item) => (
            <li key={item.caseId}>
              <Link href={`/admin/operations/${item.caseId}`}>
                <span className={styles.badge} data-priority={item.priority}>
                  Prioridad {priorityLabels[item.priority]}
                </span>
                <strong>
                  {item.questionSnapshot ??
                    item.reviewExcerpt ??
                    "Respuesta que requiere revisión"}
                </strong>
                <span className={styles.meta}>
                  {item.issueTypes
                    .map((issue) => issueLabels[issue])
                    .join(" · ")}
                  {" · "}
                  {item.openCaseCount}{" "}
                  {item.openCaseCount === 1 ? "caso abierto" : "casos abiertos"}
                  {" · "}
                  {formatDate(item.createdAt)}
                </span>
              </Link>
            </li>
          ))}
                </ol>
      )}
      </div>
    </details>
  );
}

export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchValue>>;
}) {
  const requested = await searchParams;
  const view = one(requested.vista) === "reportes" ? "reportes" : "consultar";
  const period =
    consultationPeriodSchema.safeParse(one(requested.period)).data ??
    (view === "reportes" ? "month" : "last_24h");
  const status = consultationCaseStatusSchema.safeParse(
    one(requested.status),
  ).data;
  const kind = consultationCaseKindSchema.safeParse(one(requested.kind)).data;
  const issueType = consultationCaseIssueSchema.safeParse(
    one(requested.issueType),
  ).data;
  const moduleId = uuid(requested.moduleId);
  const submoduleId = uuid(requested.submoduleId);
  const query = one(requested.query)?.trim();
  const currentPage = pageNumber(requested.page);
  const offset = (currentPage - 1) * CASES_PER_PAGE;
  const { access, client } =
    await createAuthorizedConsultationReportsApiContext();
  // Cada pestaña carga solo lo suyo: la bandeja diaria no arrastra reportes y
  // el tablero no espera a la lista de casos.
  const queue =
    view === "consultar"
      ? await Promise.all([
          client.listCases({
            issueType,
            kind,
            limit: CASES_PER_PAGE,
            moduleId,
            offset,
            period,
            query,
            status,
            submoduleId,
          }),
          // Un resumen opcional: si falla, el resto de la página se muestra igual.
          client.getUnansweredGroups(period).catch(() => null),
          client.getReviewPriorities(period),
        ])
      : null;
  const report =
    view === "reportes"
      ? await Promise.all([
          client.getDashboard(period),
          client.getTopics(period),
          client.listCases({
            kind: "teacher_report",
            limit: CASES_PER_PAGE,
            moduleId,
            offset,
            period,
            submoduleId,
          }),
        ])
      : null;
  const cases = queue?.[0] ?? [];
  const unansweredGroups = queue?.[1] ?? null;
  const reviewPriorities = queue?.[2] ?? [];
  const dashboard = report?.[0] ?? null;
  const topics = report?.[1] ?? [];
  const teacherReports = report?.[2] ?? [];
  const reportsByModule = new Map<string, ConsultationCaseSummary[]>();
  for (const teacherReport of teacherReports) {
    const name = teacherReport.detectedModuleName ??
      teacherReport.requestedModuleName ?? "Sin módulo identificado";
    reportsByModule.set(name, [
      ...(reportsByModule.get(name) ?? []),
      teacherReport,
    ]);
  }
  const totalCases = cases[0]?.totalCount ?? 0;
  const caseFilters = {
    issueType,
    kind,
    moduleId,
    period,
    query,
    status,
    submoduleId,
  };
  const casesHref = (page: number): string =>
    `/admin/operations?${queryString({
      ...caseFilters,
      page: page > 1 ? page : undefined,
      vista: "consultar",
    })}`;
  const hasPreviousPage = currentPage > 1;
  const hasNextPage =
    cases.length === CASES_PER_PAGE && totalCases > offset + CASES_PER_PAGE;

  return (
    <AdminPage
      description={
        view === "consultar"
          ? "Revisa las consultas pendientes y la documentación que falta."
          : "Tendencias, reportes y sugerencias de los docentes en el periodo seleccionado."
      }
      title="Consultas y reportes"
    >
      <main className={styles.page}>
        <nav
          aria-label="Secciones de consultas y reportes"
          className={styles.viewTabs}
        >
          <Link
            aria-current={view === "consultar" ? "page" : undefined}
            className={styles.viewTab}
            data-active={view === "consultar"}
            href={`/admin/operations?${queryString({
              ...caseFilters,
              period,
              vista: "consultar",
            })}`}
          >
            Consultar
          </Link>
          <Link
            aria-current={view === "reportes" ? "page" : undefined}
            className={styles.viewTab}
            data-active={view === "reportes"}
            href={`/admin/operations?${queryString({
              period,
              vista: "reportes",
            })}`}
          >
            Reportes
          </Link>
        </nav>

        {view === "consultar" ? (
          <UnansweredGroups
            canUpload={access.modulesAccess}
            groups={unansweredGroups}
            period={period}
          />
        ) : null}

        {view === "reportes" && dashboard ? (
        <section
          aria-labelledby="consultation-dashboard-title"
          className={styles.section}
        >
          <div className={`${styles.sectionHeader} ${styles.dashboardHeader}`}>
            <div>
              <h2 id="consultation-dashboard-title">
                Indicadores de consultas
              </h2>
              <p className={styles.periodRange}>
                Datos del {formatDate(dashboard.periodStart)} al{" "}
                {formatDate(dashboard.periodEnd)} (hora de Lima)
              </p>
            </div>
            <form className={styles.periodForm} method="get">
              <input name="vista" type="hidden" value={view} />
              <label htmlFor="consultation-period">
                Periodo
                <select
                  defaultValue={period}
                  id="consultation-period"
                  name="period"
                >
                  <option value="last_6h">Últimas 6 horas</option>
                  <option value="last_24h">Últimas 24 horas</option>
                  <option value="last_7d">Últimos 7 días</option>
                  <option value="last_30d">Últimos 30 días</option>
                  <option value="today">Hoy (día calendario)</option>
                  <option value="week">Esta semana</option>
                  <option value="month">Este mes</option>
                </select>
              </label>
              <button
                className={`avend-button avend-button--primary ${styles.periodButton}`}
                type="submit"
              >
                <span aria-hidden="true" className={styles.buttonIcon}>
                  <IconGraphic name="refresh" />
                </span>
                Actualizar
              </button>
            </form>
          </div>

          <MetricGroup icon="chart" title="Resumen de actividad">
            <MetricCard
              hint="Preguntas de docentes registradas."
              icon="chat"
              label="Consultas realizadas"
              value={dashboard.totalQuestions}
            />
            <MetricCard
              hint="Consultas con al menos un caso de control."
              icon="warning"
              label="Respuestas con incidencias"
              tone="risk"
              value={dashboard.answersWithIncidents}
            />
            <MetricCard
              hint="Sin evidencia documental suficiente."
              icon="document"
              label="Sin sustento suficiente"
              tone="attention"
              value={dashboard.noSupport}
            />
          </MetricGroup>

          <MetricGroup icon="users" title="Aportes de docentes">
            <MetricCard
              hint="Respuestas reportadas por docentes."
              icon="flag"
              label="Reportes de docentes"
              tone="attention"
              value={dashboard.teacherReports}
            />
            <MetricCard
              hint="Aportes que esperan revisión humana."
              icon="bulb"
              label="Sugerencias de docentes"
              value={dashboard.teacherSuggestions}
            />
            <MetricCard
              hint="Archivos compartidos en sugerencias."
              icon="document"
              label="Documentos o normas sugeridos"
              tone="success"
              value={dashboard.documentsSuggested}
            />
          </MetricGroup>
        </section>
        ) : null}

        {view === "reportes" && dashboard ? (
          <div className={styles.highlights}>
            <HighlightCard
              countLabel="consultas"
              footnote="Submódulo identificado con certeza."
              icon="chart"
              module={dashboard.topConsultedModule}
              submodule={dashboard.topConsultedSubmodule}
              title="Lo más consultado"
              titleId="top-consulted-title"
              tone="info"
            />
            <HighlightCard
              countLabel="incidencias"
              footnote="Reportes, alertas y sugerencias por módulo y submódulo."
              icon="warning"
              module={dashboard.topIncidentModule}
              submodule={dashboard.topIncidentSubmodule}
              title="Dónde se concentran las incidencias"
              titleId="top-incidents-title"
              tone="attention"
            />
          </div>
        ) : null}

        {view === "reportes" && dashboard ? (
        <section
          aria-labelledby="consultation-rankings-title"
          className={styles.section}
        >
          <div className={styles.sectionHeader}>
            <div>
              <h2 id="consultation-rankings-title">Tendencias por ruta</h2>
              <p>
                Los rankings de consultas y de incidencias se calculan de forma
                independiente.
              </p>
            </div>
          </div>
          <div className={styles.rankings}>
            <Ranking
              filter="moduleId"
              items={dashboard.consultationModules}
              period={period}
              title="Módulos más consultados"
            />
            <Ranking
              filter="submoduleId"
              items={dashboard.consultationSubmodules}
              period={period}
              title="Submódulos más consultados"
            />
            <Ranking
              filter="moduleId"
              items={dashboard.incidentModules}
              period={period}
              title="Módulos con más incidencias"
            />
            <Ranking
              filter="submoduleId"
              items={dashboard.incidentSubmodules}
              period={period}
              title="Submódulos con más incidencias"
            />
            <TopicsRanking period={period} topics={topics} />
          </div>
        </section>
        ) : null}

        {view === "reportes" ? (
          <section aria-labelledby="teacher-reports-title" className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 id="teacher-reports-title">Reportes de docentes por módulo</h2>
                <p>Abre un caso para revisar la pregunta, la respuesta y el motivo.</p>
              </div>
            </div>
            {teacherReports.length === 0 ? (
              <p className={styles.empty}>No hay reportes en este periodo.</p>
            ) : [...reportsByModule].map(([moduleName, moduleReports]) => (
              <div key={moduleName}>
                <h3>{moduleName} ({moduleReports.length} en esta página)</h3>
                <ul className={styles.caseList}>
                  {moduleReports.map((item) => (
                    <li className={styles.caseItem} key={item.id}>
                      <p className={styles.caseQuestion}>
                        {item.questionSnapshot ?? item.reporterComment ?? "Reporte del docente"}
                      </p>
                      <p className={styles.meta}>
                        {item.detectedSubmoduleName ? `${item.detectedSubmoduleName} · ` : ""}
                        {item.reportReason ? `${reportReasonLabels[item.reportReason]} · ` : ""}
                        {formatDate(item.createdAt)}
                      </p>
                      <Link className={styles.caseLink} href={`/admin/operations/${item.id}`}>
                        Ver caso
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {currentPage > 1 ? (
              <Link href={`/admin/operations?${queryString({
                vista: "reportes", period, moduleId, submoduleId,
                page: currentPage - 1,
              })}`}>Ver reportes más recientes</Link>
            ) : null}
            {teacherReports[0]?.totalCount > (currentPage * CASES_PER_PAGE) ? (
              <Link href={`/admin/operations?${queryString({
                vista: "reportes", period, moduleId, submoduleId,
                page: currentPage + 1,
              })}`}>Ver más reportes</Link>
            ) : null}
          </section>
        ) : null}

        {view === "consultar" ? (
          <ReviewPriorities items={reviewPriorities} />
        ) : null}

        {view === "consultar" ? (
          <details
            className={`${styles.section} ${styles.collapsibleSection}`}
            open={
              Boolean(query || status || kind || issueType || moduleId || submoduleId) ||
              currentPage > 1
                ? true
                : undefined
            }
          >
            <summary className={styles.collapsibleHeader}>
              <div className={styles.collapsibleHeading}>
                <h2 id="consultation-cases-title">
                  Casos para revisión
                </h2>

                <p>
                  {totalCases}{" "}
                  {totalCases === 1 ? "caso encontrado" : "casos encontrados"} en
                  el periodo seleccionado.
                </p>
              </div>

              <span className={styles.collapsibleIndicator} aria-hidden="true">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </span>
            </summary>

            <div className={styles.collapsibleContent}>
          <form className={styles.filters} method="get">
            <input name="period" type="hidden" value={period} />
            <label htmlFor="case-search">
              Buscar
              <input
                defaultValue={query}
                id="case-search"
                maxLength={200}
                name="query"
                placeholder="Consulta, respuesta o comentario"
                type="search"
              />
            </label>
            <label htmlFor="case-status">
              Estado
              <select
                defaultValue={status ?? ""}
                id="case-status"
                name="status"
              >
                <option value="">Todos</option>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="case-kind">
              Origen
              <select defaultValue={kind ?? ""} id="case-kind" name="kind">
                <option value="">Todos</option>
                {Object.entries(kindLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="case-issue">
              Tipo de caso
              <select
                defaultValue={issueType ?? ""}
                id="case-issue"
                name="issueType"
              >
                <option value="">Todos</option>
                {Object.entries(issueLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {moduleId ? (
              <input name="moduleId" type="hidden" value={moduleId} />
            ) : null}
            {submoduleId ? (
              <input name="submoduleId" type="hidden" value={submoduleId} />
            ) : null}
            <button
              className="avend-button avend-button--secondary"
              type="submit"
            >
              Aplicar filtros
            </button>
            <Link
              className="avend-text-link"
              href={`/admin/operations?period=${period}`}
            >
              Limpiar filtros
            </Link>
          </form>

          {cases.length === 0 ? (
            <p className={styles.empty}>
              No hay casos para los filtros seleccionados. Las consultas sin
              hallazgos no se convierten en incidencias.
            </p>
          ) : (
            <ul className={styles.caseList}>
              {cases.map((consultationCase) => (
                <li className={styles.caseItem} key={consultationCase.id}>
                  <div className={styles.caseItemHeader}>
                    <div className={styles.badgeRow}>
                      <span
                        className={styles.badge}
                        data-status={consultationCase.status}
                      >
                        {statusLabels[consultationCase.status]}
                      </span>
                      <span className={styles.badge}>
                        {kindLabels[consultationCase.kind]}
                      </span>
                      <span className={styles.badge}>
                        {issueLabels[consultationCase.issueType]}
                      </span>
                      {consultationCase.attachmentCount > 0 ? (
                        <span className={styles.badge}>
                          Archivo adjunto
                          {consultationCase.attachmentCount > 1
                            ? ` · ${consultationCase.attachmentCount}`
                            : ""}
                        </span>
                      ) : null}
                    </div>
                    <time
                      className={styles.meta}
                      dateTime={consultationCase.createdAt}
                    >
                      {formatDate(consultationCase.createdAt)}
                    </time>
                  </div>
                  <p className={styles.caseQuestion}>
                    {consultationCase.questionSnapshot ??
                      consultationCase.reporterComment ??
                      consultationCase.reviewExcerpt ??
                      "Caso sin texto disponible"}
                  </p>
                  {consultationCase.answerSnapshot ? (
                    <p className={styles.caseText}>
                      {consultationCase.answerSnapshot.slice(0, 280)}
                      {consultationCase.answerSnapshot.length > 280 ? "…" : ""}
                    </p>
                  ) : null}
                  <p className={styles.route}>
                    Ruta:{" "}
                    {consultationCase.detectedModuleName ??
                      consultationCase.requestedModuleName ??
                      "Sin módulo"}
                    {consultationCase.detectedSubmoduleName
                      ? ` › ${consultationCase.detectedSubmoduleName}`
                      : ""}
                  </p>
                  {consultationCase.reportReason ? (
                    <p className={styles.meta}>
                      Motivo:{" "}
                      {reportReasonLabels[consultationCase.reportReason]}
                    </p>
                  ) : null}
                  <p className={styles.meta}>
                    {consultationCase.sourceCount} fuentes ·{" "}
                    {consultationCase.attachmentCount} adjuntos ·{" "}
                    {consultationCase.linkedDocumentCount} documentos vinculados
                  </p>
                  <Link
                    className={styles.caseLink}
                    href={`/admin/operations/${consultationCase.id}`}
                  >
                    Ver detalle y gestionar caso
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {hasPreviousPage || hasNextPage ? (
            <nav aria-label="Paginación de casos" className={styles.pagination}>
              {hasPreviousPage ? (
                <Link
                  className="avend-button avend-button--secondary"
                  href={casesHref(currentPage - 1)}
                >
                  Casos anteriores
                </Link>
              ) : (
                <span />
              )}
              <span className={styles.meta}>Página {currentPage}</span>
              {hasNextPage ? (
                <Link
                  className="avend-button avend-button--secondary"
                  href={casesHref(currentPage + 1)}
                >
                  Más casos
                </Link>
              ) : null}
            </nav>
          ) : null}
        </div>
      </details>
    ) : null}
      </main>
    </AdminPage>
  );
}
