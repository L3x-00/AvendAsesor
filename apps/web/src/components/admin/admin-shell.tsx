import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/ui/brand-logo";
import { formatUserRole } from "@/lib/admin-api/labels";
import type { AdministrativeRole } from "@/lib/authorization/policy";

type AdminSection = "documents" | "home" | "modules" | "operations" | "users";
type AdminNavigationIconName =
  | "chat"
  | "documents"
  | "home"
  | "lock"
  | "modules"
  | "reports"
  | "signout"
  | "users";

interface AdminShellProps {
  activeSection: AdminSection;
  children: ReactNode;
  description: string;
  eyebrow?: string | null;
  headerAside?: ReactNode;
  title: string;
  userName: string;
  userRole: AdministrativeRole;
  welcome?: string;
}

const navigation: ReadonlyArray<{
  href: string;
  icon: AdminNavigationIconName;
  label: string;
  requiresSuperadmin?: boolean;
  section?: AdminSection;
}> = [
  { href: "/admin", icon: "home", label: "Inicio", section: "home" },
  {
    href: "/admin/users",
    icon: "users",
    label: "Usuarios",
    requiresSuperadmin: true,
    section: "users",
  },
  {
    href: "/admin/modules",
    icon: "modules",
    label: "Módulos",
    section: "modules",
  },
  {
    href: "/admin/operations",
    icon: "reports",
    label: "Consultas y reportes",
    section: "operations",
  },
  {
    href: "/admin/documents",
    icon: "documents",
    label: "Historial de documentos",
    section: "documents",
  },
  {
    href: "/chat",
    icon: "chat",
    label: "Chat (ver como docente)",
  },
];

function AdminNavigationIcon({
  className = "",
  name,
}: {
  className?: string;
  name: AdminNavigationIconName;
}) {
  const paths: Record<AdminNavigationIconName, ReactNode> = {
    chat: <path d="M5 18.5 3.5 21l3.1-1.1A8.5 8.5 0 1 0 5 18.5Z" />,
    documents: (
      <>
        <path d="M6 3.5h8l4 4V21H6z" />
        <path d="M14 3.5V8h4M9 12h6M9 16h6" />
      </>
    ),
    home: (
      <>
        <path d="m3.5 11 8.5-7 8.5 7" />
        <path d="M5.5 10v10h13V10M9.5 20v-6h5v6" />
      </>
    ),
    lock: (
      <>
        <path d="M12 2.5 4.5 6v5.5c0 4.5 3 7.8 7.5 9 4.5-1.2 7.5-4.5 7.5-9V6z" />
        <rect height="6" rx="1" width="6" x="9" y="10" />
        <path d="M10.5 10V8.5a1.5 1.5 0 0 1 3 0V10" />
      </>
    ),
    modules: (
      <>
        <path d="m12 3 8 4.5-8 4.5-8-4.5z" />
        <path d="m4 12 8 4.5 8-4.5M4 16.5 12 21l8-4.5" />
      </>
    ),
    reports: (
      <>
        <path d="M4 20V12h4v8M10 20V7h4v13M16 20V3h4v17" />
        <path d="M3 20.5h18" />
      </>
    ),
    signout: (
      <>
        <path d="M14 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2" />
        <path d="M10 12h10m0 0-3-3m3 3-3 3" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 20v-2a5.5 5.5 0 0 1 11 0v2" />
        <circle cx="17.5" cy="9.5" r="2.5" />
        <path d="M16 14.5a4.5 4.5 0 0 1 4.5 4.5v1" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      className={`avend-admin-navigation-icon ${className}`.trim()}
      fill="none"
      viewBox="0 0 24 24"
    >
      {paths[name]}
    </svg>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return "US";
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toLocaleUpperCase("es-PE");
  }

  return `${parts[0][0]}${parts.at(-1)?.[0] ?? ""}`.toLocaleUpperCase(
    "es-PE",
  );
}

function AdminNavigation({
  activeSection,
  userRole,
}: Pick<AdminShellProps, "activeSection" | "userRole">) {
  return (
    <nav aria-label="Administración" className="avend-admin-navigation">
      {navigation
        .filter(
          (item) => !item.requiresSuperadmin || userRole === "superadmin",
        )
        .map((item) => (
          <Link
            aria-current={
              item.section && item.section === activeSection ? "page" : undefined
            }
            className="avend-admin-navigation-link"
            href={item.href}
            key={item.href}
          >
            <AdminNavigationIcon name={item.icon} />
            <span>{item.label}</span>
          </Link>
        ))}
    </nav>
  );
}

function AdminAccount({
  userName,
  userRole,
}: Pick<AdminShellProps, "userName" | "userRole">) {
  return (
    <div className="avend-admin-account">
      <div className="avend-admin-account-identity">
        <span aria-hidden="true" className="avend-admin-account-avatar">
          {getInitials(userName)}
        </span>
        <div>
          <p className="avend-admin-account-name">{userName}</p>
          <p className="avend-admin-account-role">{formatUserRole(userRole)}</p>
        </div>
      </div>
      <form
        action="/auth/sign-out"
        className="avend-admin-sign-out"
        method="post"
      >
        <button
          className="avend-admin-navigation-link avend-admin-sign-out-button"
          type="submit"
        >
          <AdminNavigationIcon name="signout" />
          <span>Cerrar sesión</span>
        </button>
      </form>
    </div>
  );
}

/**
 * Presentational frame for the administrative BFF. Identity and role arrive
 * from the verified server-side profile; this component adds no permissions.
 */
export function AdminShell({
  activeSection,
  children,
  description,
  eyebrow = "Administración",
  headerAside,
  title,
  userName,
  userRole,
  welcome,
}: AdminShellProps) {
  return (
    <div
      className={`avend-admin-shell${activeSection === "home" ? " avend-admin-shell--home" : ""}`}
    >
      <a className="avend-skip-link" href="#main-content">
        Saltar al contenido principal
      </a>
      <aside
        aria-label="Identidad y navegación administrativa"
        className="avend-admin-sidebar"
      >
        <div className="avend-admin-brand">
          <BrandLogo
            className="avend-admin-sidebar-logo"
            priority
            tone="dark-surface"
          />
          <p>Panel de administrador</p>
        </div>
        <div className="avend-admin-protected-area">
          <AdminNavigationIcon
            className="avend-admin-protected-icon"
            name="lock"
          />
          <div>
            <p className="avend-admin-sidebar-kicker">Área protegida</p>
            <p className="avend-admin-sidebar-description">
              Gestiona los recursos autorizados. Las acciones se validan antes
              de aplicarse.
            </p>
          </div>
        </div>
        <AdminNavigation activeSection={activeSection} userRole={userRole} />
        <AdminAccount userName={userName} userRole={userRole} />
      </aside>

      <main className="avend-admin-main" id="main-content">
        <header
          className={`avend-admin-header${headerAside ? " avend-admin-header--with-aside" : ""}`}
        >
          <div className="avend-admin-mobile-bar">
            <BrandLogo className="avend-admin-mobile-logo" />
            <details className="avend-admin-mobile-menu">
              <summary>Menú administrativo</summary>
              <div className="avend-admin-mobile-panel">
                <AdminNavigation
                  activeSection={activeSection}
                  userRole={userRole}
                />
                <AdminAccount userName={userName} userRole={userRole} />
              </div>
            </details>
          </div>
          <div className="avend-admin-header-layout">
            <div className="avend-admin-header-copy">
              {eyebrow ? <p className="avend-eyebrow">{eyebrow}</p> : null}
              <h1>{title}</h1>
              {welcome ? (
                <p className="avend-admin-header-welcome">{welcome}</p>
              ) : null}
              <p className="avend-admin-header-description">{description}</p>
            </div>
            {headerAside ? (
              <div className="avend-admin-header-aside">{headerAside}</div>
            ) : null}
          </div>
        </header>
        <div className="avend-admin-content">{children}</div>
      </main>
    </div>
  );
}
