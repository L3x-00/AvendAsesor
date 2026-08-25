import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/ui/brand-logo";

type AdminSection = "documents" | "home" | "modules" | "operations" | "users";

interface AdminShellProps {
  activeSection: AdminSection;
  children: ReactNode;
  description: string;
  isSuperadmin?: boolean;
  title: string;
}

const navigation: ReadonlyArray<{
  href: string;
  label: string;
  requiresSuperadmin?: boolean;
  section: AdminSection;
}> = [
  { href: "/admin", label: "Inicio", section: "home" },
  { href: "/admin/operations", label: "Operación", section: "operations" },
  { href: "/admin/modules", label: "Módulos", section: "modules" },
  { href: "/admin/documents", label: "Documentos", section: "documents" },
  {
    href: "/admin/users",
    label: "Usuarios",
    requiresSuperadmin: true,
    section: "users",
  },
];

function AdminNavigation({
  activeSection,
  isSuperadmin,
}: Pick<AdminShellProps, "activeSection" | "isSuperadmin">) {
  return (
    <nav aria-label="Administración" className="avend-admin-navigation">
      {navigation
        .filter((item) => !item.requiresSuperadmin || isSuperadmin)
        .map((item) => (
          <Link
            aria-current={item.section === activeSection ? "page" : undefined}
            className="avend-admin-navigation-link"
            href={item.href}
            key={item.href}
          >
            {item.label}
          </Link>
        ))}
      <Link
        className="avend-admin-navigation-link avend-admin-chat-entry"
        href="/chat"
      >
        Ir al chat de consulta
      </Link>
      <form
        action="/auth/sign-out"
        className="avend-admin-sign-out"
        method="post"
      >
        <button
          className="avend-admin-navigation-link avend-admin-sign-out-button"
          type="submit"
        >
          Cerrar sesión
        </button>
      </form>
    </nav>
  );
}

/**
 * Presentational frame for the administrative BFF. It contains no identity,
 * data or mutation logic; the server route and Server Actions remain the
 * authority for every operation rendered inside it.
 */
export function AdminShell({
  activeSection,
  children,
  description,
  isSuperadmin = false,
  title,
}: AdminShellProps) {
  return (
    <div className="avend-admin-shell">
      <a className="avend-skip-link" href="#main-content">
        Saltar al contenido principal
      </a>
      <aside
        aria-label="Identidad y navegación administrativa"
        className="avend-admin-sidebar"
      >
        <BrandLogo
          className="avend-admin-sidebar-logo"
          priority
          tone="dark-surface"
        />
        <p className="avend-admin-sidebar-kicker">Área protegida</p>
        <p className="avend-admin-sidebar-description">
          Gestiona los recursos autorizados. Las acciones se validan nuevamente
          antes de aplicarse.
        </p>
        <AdminNavigation
          activeSection={activeSection}
          isSuperadmin={isSuperadmin}
        />
      </aside>

      <main className="avend-admin-main" id="main-content">
        <header className="avend-admin-header">
          <div className="avend-admin-mobile-bar">
            <BrandLogo className="avend-admin-mobile-logo" />
            <details className="avend-admin-mobile-menu">
              <summary>Menú administrativo</summary>
              <AdminNavigation
                activeSection={activeSection}
                isSuperadmin={isSuperadmin}
              />
            </details>
          </div>
          <p className="avend-eyebrow">Administración</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </header>
        <div className="avend-admin-content">{children}</div>
      </main>
    </div>
  );
}
