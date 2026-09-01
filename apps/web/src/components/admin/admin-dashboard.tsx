import Link from "next/link";
import { formatUserRole } from "@/lib/admin-api/labels";
import type { OperationalMetrics } from "@/lib/admin-api/types";
import type { AdministrativeRole } from "@/lib/authorization/policy";
import styles from "./admin-dashboard.module.css";

interface AdminDashboardProps {
  metrics: OperationalMetrics;
  role: AdministrativeRole;
}

const numberFormatter = new Intl.NumberFormat("es-PE");

function formatCount(value: number): string {
  return numberFormatter.format(value);
}

interface MetricCard {
  attention?: boolean;
  hint: string;
  key: string;
  label: string;
  value: number;
}

interface QuickLink {
  badge?: string;
  description: string;
  href: string;
  title: string;
}

/**
 * Read-only administrative home dashboard. It summarizes the operational
 * metrics returned by the API and links to the sections that perform the
 * actual management; it never mutates state or grants permissions.
 */
export function AdminDashboard({ metrics, role }: AdminDashboardProps) {
  const metricCards: MetricCard[] = [
    {
      hint: "Cuentas con acceso al sistema",
      key: "users",
      label: "Usuarios registrados",
      value: metrics.totalUsers,
    },
    {
      hint: "Disponibles para el chat",
      key: "modules",
      label: "Módulos activos",
      value: metrics.activeModules,
    },
    {
      hint: "PDFs vigentes e indexables",
      key: "documents",
      label: "Documentos activos",
      value: metrics.activeDocuments,
    },
    {
      hint: "Conversaciones registradas",
      key: "conversations",
      label: "Conversaciones",
      value: metrics.totalConversations,
    },
    {
      attention: metrics.pendingUnansweredQuestions > 0,
      hint: "En la cola sin resolver",
      key: "pending-questions",
      label: "Consultas por revisar",
      value: metrics.pendingUnansweredQuestions,
    },
    {
      attention: metrics.pendingIngestionJobs > 0,
      hint: "Documentos procesándose",
      key: "pending-ingestion",
      label: "Ingestas en proceso",
      value: metrics.pendingIngestionJobs,
    },
  ];

  const quickLinks: QuickLink[] = [
    {
      badge:
        metrics.pendingUnansweredQuestions > 0
          ? `${formatCount(metrics.pendingUnansweredQuestions)} por revisar`
          : undefined,
      description: "Revisa las preguntas sin resolver y el estado operativo.",
      href: "/admin/operations",
      title: "Consultas y reportes",
    },
    {
      description: "Carga PDFs y consulta sus versiones y su ingesta.",
      href: "/admin/documents",
      title: "Historial de documentos",
    },
    {
      description: "Organiza los temas disponibles para el chat docente.",
      href: "/admin/modules",
      title: "Módulos",
    },
    ...(role === "superadmin"
      ? [
          {
            description: "Gestiona roles y estados y revisa la auditoría.",
            href: "/admin/users",
            title: "Usuarios y auditoría",
          },
        ]
      : []),
  ];

  return (
    <div className={styles.dashboard}>
      <section aria-labelledby="dashboard-metrics-title">
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle} id="dashboard-metrics-title">
            Resumen operativo
          </h2>
          <p className={styles.roleTag}>
            Acceso: <strong>{formatUserRole(role)}</strong>
          </p>
        </div>
        <ul className={styles.metricsGrid} role="list">
          {metricCards.map((card) => (
            <li
              className={
                card.attention
                  ? `${styles.metricCard} ${styles.metricCardAttention}`
                  : styles.metricCard
              }
              key={card.key}
            >
              <p className={styles.metricValue}>{formatCount(card.value)}</p>
              <p className={styles.metricLabel}>{card.label}</p>
              <p className={styles.metricHint}>{card.hint}</p>
              {card.attention ? (
                <p className={styles.metricFlag}>Requiere atención</p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <div className={styles.panels}>
        <section
          aria-labelledby="dashboard-health-title"
          className={styles.panel}
        >
          <h2 className={styles.sectionTitle} id="dashboard-health-title">
            Estado del sistema
          </h2>
          <dl className={styles.healthList}>
            <div className={styles.healthRow}>
              <dt className={styles.healthTerm}>Consultas sin resolver</dt>
              <dd className={styles.healthValue}>
                {formatCount(metrics.pendingUnansweredQuestions)} por revisar ·{" "}
                {formatCount(metrics.resolvedUnansweredQuestions)} resueltas ·{" "}
                {formatCount(metrics.dismissedUnansweredQuestions)} descartadas
              </dd>
            </div>
            <div className={styles.healthRow}>
              <dt className={styles.healthTerm}>Ingesta de documentos</dt>
              <dd className={styles.healthValue}>
                {metrics.pendingIngestionJobs > 0
                  ? `${formatCount(metrics.pendingIngestionJobs)} en proceso`
                  : "Al día"}
              </dd>
            </div>
            <div className={styles.healthRow}>
              <dt className={styles.healthTerm}>Costo del proveedor de IA</dt>
              <dd className={styles.healthValue}>No configurado</dd>
            </div>
          </dl>
        </section>

        <section
          aria-labelledby="dashboard-actions-title"
          className={styles.panel}
        >
          <h2 className={styles.sectionTitle} id="dashboard-actions-title">
            Accesos rápidos
          </h2>
          <ul className={styles.quickGrid} role="list">
            {quickLinks.map((link) => (
              <li key={link.href}>
                <Link className={styles.quickCard} href={link.href}>
                  <span className={styles.quickTitle}>{link.title}</span>
                  <span className={styles.quickDescription}>
                    {link.description}
                  </span>
                  {link.badge ? (
                    <span className={styles.quickBadge}>{link.badge}</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
