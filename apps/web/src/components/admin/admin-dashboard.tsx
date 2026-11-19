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
  icon: string;
  title: string;
}

const numberFormatter = new Intl.NumberFormat("es-PE");

const quickLinks: ReadonlyArray<QuickLink> = [
  {
    description: "Gestionar usuarios, roles y accesos.",
    href: "/admin/users",
    icon: "active",
    title: "Usuarios",
  },
  {
    description: "Administrar módulos, submódulos y organización documental.",
    href: "/admin/modules",
    icon: "modules",
    title: "Módulos",
  },
  {
    description:
      "Consultar, buscar, visualizar y descargar el historial documental.",
    href: "/admin/documents",
    icon: "documents",
    title: "Historial de documentos",
  },
  {
    description: "Revisar consultas, incidencias, reportes y métricas.",
    href: "/admin/operations",
    icon: "queries",
    title: "Consultas y reportes",
  },
  {
    description: "Abrir AVEND ASESOR tal como lo utiliza el docente.",
    href: "/chat",
    icon: "teacher",
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

function DashboardIcon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    registered: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 5v1" />
      </>
    ),
    active: (
      <>
        <circle cx="12" cy="7" r="3" />
        <path d="M5 20v-2a7 7 0 0 1 14 0v2" />
      </>
    ),
    expiring: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    expired: (
      <>
        <path d="M12 3 20 6v5c0 5-3 8-8 10-5-2-8-5-8-10V6z" />
        <path d="m9 12 2 2 4-5" />
      </>
    ),
    modules: (
      <>
        <path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5" />
      </>
    ),
    submodules: <path d="M3 6h7l2 2h9v11H3z" />,
    documents: (
      <>
        <path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6" />
      </>
    ),
    queries: <path d="M4 5h16v12H9l-5 4z" />,
    ai: <path d="m12 3 2 6 6 3-6 2-2 7-2-7-6-2 6-3z" />,
    teacher: (
      <path d="m3 9 9-4 9 4-9 4zM6 11.3V16c2.8 2.2 9.2 2.2 12 0v-4.7M21 9v6" />
    ),
  };
  return (
    <span className={styles.iconTile} aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {paths[name] ?? paths.modules}
      </svg>
    </span>
  );
}

/**
 * Cada módulo se reconoce por su propio ícono, como en el diseño de referencia:
 * monedas, maletín, carpeta, birrete o personas según el tema.
 */
function ModuleIcon({ name }: { name: string }) {
  const normalized = name.toLocaleLowerCase("es-PE");
  const paths = normalized.includes("remuner") ? (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </>
  ) : normalized.includes("contrat") || normalized.includes("desplaz") ? (
    <>
      <path d="M4 8h16v11H4zM8 8V5h8v3M4 13h16" />
      <path d="M10 13h4v2h-4z" />
    </>
  ) : normalized.includes("evaluaci") ? (
    <path d="m3 9 9-4 9 4-9 4zM6 11.3V16c2.8 2.2 9.2 2.2 12 0v-4.7M21 9v6" />
  ) : normalized.includes("auxiliar") ? (
    <>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="10" r="2.5" />
      <path d="M3.5 20v-1.5a5.5 5.5 0 0 1 11 0V20M14.5 16.5a4.5 4.5 0 0 1 6 4" />
    </>
  ) : (
    <path d="M3 6h7l2 2h9v11H3z" />
  );

  return (
    <span className={styles.iconTile} aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {paths}
      </svg>
    </span>
  );
}

function MetricGlyph({ name }: { name: "documents" | "submodules" }) {
  return (
    <svg
      aria-hidden="true"
      className={styles.metricGlyph}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      {name === "submodules" ? (
        <path d="M3 6h7l2 2h9v11H3z" />
      ) : (
        <>
          <path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6" />
        </>
      )}
    </svg>
  );
}

function SectionIcon({
  name,
}: {
  name: "general" | "modules" | "quick" | "users";
}) {
  const paths = {
    general: <path d="M4 20V10M10 20V4M16 20v-7M2 20h20" />,
    modules: <path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5" />,
    quick: <path d="M13 2 4 14h6l-1 8 9-12h-6z" />,
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 5v1" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      className={styles.sectionIcon}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      {paths[name]}
    </svg>
  );
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
          <DashboardIcon name={card.key} />
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
          <SectionIcon name="users" />
          <span>Estado de usuarios</span>
        </h2>
        <MetricCards cards={userCards} className={styles.userMetricsGrid} />
      </section>

      <section aria-labelledby="avend-modules-title" className={styles.section}>
        <h2 className={styles.sectionTitle} id="avend-modules-title">
          <SectionIcon name="modules" />
          <span>Módulos de AVEND ASESOR</span>
        </h2>
        <Link className={styles.viewAll} href="/admin/modules">
          Ver todos los módulos <span aria-hidden="true">→</span>
        </Link>
        {dashboard.moduleSummaries.length ? (
          <ul className={styles.modulesGrid} role="list">
            {dashboard.moduleSummaries.map((module) => (
              <li key={module.id}>
                <Link
                  className={styles.moduleCard}
                  href={`/admin/modules/${module.id}`}
                >
                  <span className={styles.moduleTitle}>{module.name}</span>
                  {module.isActive ? null : (
                    <span className={styles.moduleInactive}>Inactivo</span>
                  )}
                  <span className={styles.moduleMetrics}>
                    <span>
                      <MetricGlyph name="submodules" />
                      <strong>{formatCount(module.submoduleCount)}</strong>
                      <span>Submódulos</span>
                    </span>
                    <span>
                      <MetricGlyph name="documents" />
                      <strong>{formatCount(module.documentCount)}</strong>
                      <span>Documentos</span>
                    </span>
                  </span>
                  <span className={styles.moduleAction} aria-hidden="true">
                    →
                  </span>
                  <ModuleIcon name={module.name} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.modulesEmpty}>
            Aún no hay módulos registrados.{" "}
            <Link href="/admin/modules">Crear el primer módulo</Link>
          </p>
        )}
      </section>

      <section aria-labelledby="quick-access-title" className={styles.section}>
        <h2 className={styles.sectionTitle} id="quick-access-title">
          <SectionIcon name="quick" />
          <span>Accesos rápidos</span>
        </h2>
        <ul className={styles.quickGrid} role="list">
          {quickLinks.map((link) => (
            <li key={link.href}>
              <Link className={styles.quickCard} href={link.href}>
                <span className={styles.quickTitle}>{link.title}</span>
                <span className={styles.quickDescription}>
                  {link.description}
                </span>
                <DashboardIcon name={link.icon} />
                <span aria-hidden="true" className={styles.cardArrow}>
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="general-info-title" className={styles.section}>
        <h2 className={styles.sectionTitle} id="general-info-title">
          <SectionIcon name="general" />
          <span>Información general de AVEND ASESOR</span>
        </h2>
        <MetricCards
          cards={generalCards}
          className={styles.generalMetricsGrid}
        />
      </section>
    </div>
  );
}
