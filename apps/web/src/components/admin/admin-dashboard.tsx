import Link from "next/link";
import type { AdminHomeDashboard } from "@/lib/admin-api/types";
import styles from "./admin-dashboard.module.css";

interface AdminDashboardProps {
  dashboard: AdminHomeDashboard;
}

type UserMetricTone = "active" | "expired" | "expiring" | "registered";

interface MetricCard {
  hint: string;
  key: string;
  label: string;
  tone?: UserMetricTone;
  value: number;
}

interface QuickLink {
  description: string;
  href: string;
  title: string;
}

const numberFormatter = new Intl.NumberFormat("es-PE");

const quickLinks: ReadonlyArray<QuickLink> = [
  {
    description: "Gestionar usuarios, roles y accesos.",
    href: "/admin/users",
    title: "Usuarios",
  },
  {
    description: "Administrar módulos, submódulos y organización documental.",
    href: "/admin/modules",
    title: "Módulos",
  },
  {
    description:
      "Consultar, buscar, visualizar y descargar el historial documental.",
    href: "/admin/documents",
    title: "Historial de documentos",
  },
  {
    description: "Revisar consultas, incidencias, reportes y métricas.",
    href: "/admin/operations",
    title: "Consultas y reportes",
  },
  {
    description: "Abrir AVEND ASESOR tal como lo utiliza el docente.",
    href: "/chat",
    title: "Ver como docente",
  },
];

function formatCount(value: number): string {
  return numberFormatter.format(value);
}

function metricToneClass(tone?: UserMetricTone): string {
  if (!tone) return styles.metricCard;

  const toneClass: Record<UserMetricTone, string> = {
    active: styles.metricCardActive,
    expired: styles.metricCardExpired,
    expiring: styles.metricCardExpiring,
    registered: styles.metricCardRegistered,
  };

  return `${styles.metricCard} ${toneClass[tone]}`;
}

function MetricCards({
  cards,
  className,
}: {
  cards: MetricCard[];
  className: string;
}) {
  return (
    <ul className={className} role="list">
      {cards.map((card) => (
        <li className={metricToneClass(card.tone)} key={card.key}>
          <p className={styles.metricLabel}>{card.label}</p>
          <p className={styles.metricValue}>{formatCount(card.value)}</p>
          <p className={styles.metricHint}>{card.hint}</p>
        </li>
      ))}
    </ul>
  );
}

/**
 * Read-only administrative home. Operational incidents intentionally remain in
 * Consultas y reportes; this view only presents aggregate database facts and
 * direct navigation to the areas where administrators work.
 */
export function AdminDashboard({ dashboard }: AdminDashboardProps) {
  const userCards: MetricCard[] = [
    {
      hint: "Total de usuarios registrados.",
      key: "registered",
      label: "Usuarios registrados",
      tone: "registered",
      value: dashboard.totalUsers,
    },
    {
      hint: "Usuarios con acceso vigente.",
      key: "active",
      label: "Usuarios activos",
      tone: "active",
      value: dashboard.activeUsers,
    },
    {
      hint: `Accesos que vencen en los próximos ${dashboard.expiryWindowDays} días.`,
      key: "expiring",
      label: "Por vencer",
      tone: "expiring",
      value: dashboard.expiringSoonUsers,
    },
    {
      hint: "Usuarios con acceso vencido.",
      key: "expired",
      label: "Expirados",
      tone: "expired",
      value: dashboard.expiredUsers,
    },
  ];

  const generalCards: MetricCard[] = [
    {
      hint: "Módulos principales disponibles.",
      key: "modules",
      label: "Módulos activos",
      value: dashboard.activeModules,
    },
    {
      hint: "Submódulos disponibles en el sistema.",
      key: "submodules",
      label: "Submódulos activos",
      value: dashboard.activeSubmodules,
    },
    {
      hint: "Total de documentos en la biblioteca, sin filtrar su vigencia.",
      key: "documents",
      label: "Documentos cargados",
      value: dashboard.totalDocuments,
    },
    {
      hint: "Total de consultas realizadas por docentes.",
      key: "queries",
      label: "Consultas realizadas",
      value: dashboard.totalQueries,
    },
    {
      hint: "Consultas respondidas por el servicio de inteligencia artificial.",
      key: "ai",
      label: "Consumo IA",
      value: dashboard.aiQueriesProcessed,
    },
  ];

  return (
    <div className={styles.dashboard}>
      <section aria-labelledby="user-status-title" className={styles.section}>
        <h2 className={styles.sectionTitle} id="user-status-title">
          Estado de usuarios
        </h2>
        <MetricCards cards={userCards} className={styles.userMetricsGrid} />
      </section>

      <section aria-labelledby="general-info-title" className={styles.section}>
        <h2 className={styles.sectionTitle} id="general-info-title">
          Información general de AVEND ASESOR
        </h2>
        <MetricCards cards={generalCards} className={styles.generalMetricsGrid} />
      </section>

      <section aria-labelledby="quick-access-title" className={styles.section}>
        <h2 className={styles.sectionTitle} id="quick-access-title">
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
                <span aria-hidden="true" className={styles.cardArrow}>
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="avend-modules-title" className={styles.section}>
        <h2 className={styles.sectionTitle} id="avend-modules-title">
          Módulos de AVEND ASESOR
        </h2>
        <ul className={styles.modulesGrid} role="list">
          {dashboard.moduleSummaries.map((module) => (
            <li key={module.id}>
              <Link
                className={styles.moduleCard}
                href={`/admin/modules/${module.id}`}
              >
                <span className={styles.moduleTitle}>{module.name}</span>
                <span className={styles.moduleMetrics}>
                  <span>
                    <strong>{formatCount(module.submoduleCount)}</strong>
                    <span>Submódulos</span>
                  </span>
                  <span>
                    <strong>{formatCount(module.documentCount)}</strong>
                    <span>Documentos</span>
                  </span>
                </span>
                <span className={styles.moduleAction}>Administrar módulo →</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
