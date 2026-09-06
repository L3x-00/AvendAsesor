import Link from "next/link";
import { AdminShell } from "@/components/admin/admin-shell";
import styles from "@/components/admin/consultation-reports.module.css";
import { createAuthorizedConsultationReportsApiContext } from "@/lib/consultation-reports-api/authorized-client";
import {
  consultationCaseIssueSchema,
  consultationCaseKindSchema,
  consultationCaseStatusSchema,
  consultationPeriodSchema,
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

function MetricCard({
  label,
  value,
  hint,
  tone,
}: {
  hint: string;
  label: string;
  tone?: "attention" | "risk" | "success";
  value: number | string;
}) {
  return (
    <div className={styles.metric} data-tone={tone}>
      <dt>{label}</dt>
      <dd>{value}</dd>
      <small>{hint}</small>
    </div>
  );
}

function rankingValue(item: { count: number; name: string } | null): string {
  return item ? `${item.name} · ${item.count}` : "Sin datos";
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
        <ol>
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/admin/operations?${queryString({ [filter]: item.id, period })}`}
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
        <ol>
          {topics.map((topic) => (
            <li key={topic.id}>
              <Link
                href={`/admin/operations?${queryString({
                  [topic.topicKind === "submodule"
                    ? "submoduleId"
                    : "moduleId"]: topic.id,
                  period,
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
    <section
      aria-labelledby="consultation-priorities-title"
      className={styles.section}
    >
      <div className={styles.sectionHeader}>
        <div>
          <h2 id="consultation-priorities-title">
            Respuestas con mayor necesidad de revisión
          </h2>
          <p>
            Solo se muestran respuestas con casos abiertos. La prioridad toma en
            cuenta la severidad y los tipos distintos de incidencia.
          </p>
        </div>
      </div>
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
    </section>
  );
}

export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchValue>>;
}) {
  const requested = await searchParams;
  const period =
    consultationPeriodSchema.safeParse(one(requested.period)).data ?? "month";
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
  const [dashboard, topics, reviewPriorities, cases] = await Promise.all([
    client.getDashboard(period),
    client.getTopics(period),
    client.getReviewPriorities(period),
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
  ]);
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
    })}`;
  const hasPreviousPage = currentPage > 1;
  const hasNextPage =
    cases.length === CASES_PER_PAGE && totalCases > offset + CASES_PER_PAGE;

  return (
    <AdminShell
      activeSection="operations"
      description="Centro de control de calidad del asistente: revisa tendencias, reportes y sugerencias sin modificar la conversación original."
      modulesAccess={access.modulesAccess}
      title="Consultas y reportes"
      userName={access.fullName}
      userRole={access.role}
    >
      <main className={styles.page}>
        <section
          aria-labelledby="consultation-dashboard-title"
          className={styles.section}
        >
          <div className={styles.sectionHeader}>
            <div>
              <h2 id="consultation-dashboard-title">
                Indicadores de consultas
              </h2>
              <p>
                Datos desde {formatDate(dashboard.periodStart)} hasta{" "}
                {formatDate(dashboard.periodEnd)} (hora de Lima).
              </p>
            </div>
            <form className={styles.periodForm} method="get">
              <label htmlFor="consultation-period">
                Periodo
                <select
                  defaultValue={period}
                  id="consultation-period"
                  name="period"
                >
                  <option value="today">Hoy</option>
                  <option value="week">Esta semana</option>
                  <option value="month">Este mes</option>
                </select>
              </label>
              <button
                className="avend-button avend-button--secondary"
                type="submit"
              >
                Actualizar
              </button>
            </form>
          </div>
          <dl className={styles.metrics}>
            <MetricCard
              hint="Preguntas de docentes registradas."
              label="Consultas realizadas"
              value={dashboard.totalQuestions}
            />
            <MetricCard
              hint="Consultas con al menos un caso de control."
              label="Respuestas con incidencias"
              tone="attention"
              value={dashboard.answersWithIncidents}
            />
            <MetricCard
              hint="No hubo evidencia documental suficiente."
              label="Sin sustento suficiente"
              tone="risk"
              value={dashboard.noSupport}
            />
            <MetricCard
              hint="Respuestas reportadas por docentes."
              label="Reportes de docentes"
              tone="attention"
              value={dashboard.teacherReports}
            />
            <MetricCard
              hint="Aportes que esperan revisión humana."
              label="Sugerencias de docentes"
              value={dashboard.teacherSuggestions}
            />
            <MetricCard
              hint="Archivos compartidos por docentes en sugerencias."
              label="Documentos o normas sugeridos"
              tone="success"
              value={dashboard.documentsSuggested}
            />
            <MetricCard
              hint="Ranking independiente por consultas."
              label="Módulo más consultado"
              value={rankingValue(dashboard.topConsultedModule)}
            />
            <MetricCard
              hint="Solo cuando la ruta se detectó con certeza."
              label="Submódulo más consultado"
              value={rankingValue(dashboard.topConsultedSubmodule)}
            />
            <MetricCard
              hint="Reportes, alertas y sugerencias por módulo."
              label="Módulo con más incidencias"
              tone="attention"
              value={rankingValue(dashboard.topIncidentModule)}
            />
            <MetricCard
              hint="Reportes, alertas y sugerencias por submódulo."
              label="Submódulo con más incidencias"
              tone="attention"
              value={rankingValue(dashboard.topIncidentSubmodule)}
            />
          </dl>
        </section>

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

        <ReviewPriorities items={reviewPriorities} />

        <section
          aria-labelledby="consultation-cases-title"
          className={styles.section}
        >
          <div className={styles.sectionHeader}>
            <div>
              <h2 id="consultation-cases-title">Casos para revisión</h2>
              <p>
                {totalCases}{" "}
                {totalCases === 1 ? "caso encontrado" : "casos encontrados"} en
                el periodo seleccionado.
              </p>
            </div>
          </div>
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
        </section>
      </main>
    </AdminShell>
  );
}
