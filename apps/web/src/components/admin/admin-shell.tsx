"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/ui/brand-logo";
import { formatUserRole } from "@/lib/admin-api/labels";
import type { AdministrativeRole } from "@/lib/authorization/policy";

export type AdminSection =
  | "documents"
  | "home"
  | "modules"
  | "operations"
  | "users";
type AdminNavigationIconName =
  | "chat"
  | "documents"
  | "home"
  | "lock"
  | "modules"
  | "reports"
  | "signout"
  | "users";

interface AdminShellFrameProps {
  children: ReactNode;
  modulesAccess: boolean;
  userName: string;
  userRole: AdministrativeRole;
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

/**
 * El marco vive en el layout del segmento, que no sabe cuál de sus hijos se
 * está mostrando. La sección se deduce de la ruta, que además cambia en el
 * instante del clic: el resaltado se mueve sin esperar al servidor.
 */
export function adminSectionFromPathname(pathname: string): AdminSection {
  if (pathname.startsWith("/admin/users")) return "users";
  if (pathname.startsWith("/admin/modules")) return "modules";
  if (pathname.startsWith("/admin/operations")) return "operations";
  if (pathname.startsWith("/admin/documents")) return "documents";
  return "home";
}

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

  return `${parts[0][0]}${parts.at(-1)?.[0] ?? ""}`.toLocaleUpperCase("es-PE");
}

function AdminNavigation({
  activeSection,
  modulesAccess,
  userRole,
}: {
  activeSection: AdminSection;
  modulesAccess: boolean;
  userRole: AdministrativeRole;
}) {
  return (
    <nav aria-label="Administración" className="avend-admin-navigation">
      {navigation
        .filter(
          (item) =>
            (!item.requiresSuperadmin || userRole === "superadmin") &&
            (modulesAccess ||
              (item.section !== "modules" && item.section !== "documents")),
        )
        .map((item) => (
          <Link
            aria-current={
              item.section && item.section === activeSection
                ? "page"
                : undefined
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
}: {
  userName: string;
  userRole: AdministrativeRole;
}) {
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
 * Marco persistente del panel administrativo: barra lateral, identidad y menú
 * móvil. Vive en `app/admin/layout.tsx`, así que al cambiar de sección Next.js
 * solo sustituye el contenido y la barra lateral no se desmonta.
 *
 * Antes cada página renderizaba el marco completo por su cuenta. Sin segmento
 * común, el único límite de carga disponible ocupaba toda la pantalla y cada
 * navegación reconstruía la interfaz entera.
 *
 * La identidad y el rol llegan del perfil verificado en el servidor; este
 * componente no concede permisos: solo decide qué enlaces se muestran.
 */
export function AdminShellFrame({
  children,
  modulesAccess,
  userName,
  userRole,
}: AdminShellFrameProps) {
  const pathname = usePathname();
  const activeSection = adminSectionFromPathname(pathname ?? "/admin");

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
        <AdminNavigation
          activeSection={activeSection}
          modulesAccess={modulesAccess}
          userRole={userRole}
        />
        <AdminAccount userName={userName} userRole={userRole} />
      </aside>

      <main className="avend-admin-main" id="main-content">
        <div className="avend-admin-mobile-bar">
          <BrandLogo className="avend-admin-mobile-logo" />
          <details className="avend-admin-mobile-menu">
            <summary>Menú administrativo</summary>
            <div className="avend-admin-mobile-panel">
              <AdminNavigation
                activeSection={activeSection}
                modulesAccess={modulesAccess}
                userRole={userRole}
              />
              <AdminAccount userName={userName} userRole={userRole} />
            </div>
          </details>
        </div>
        {children}
      </main>
    </div>
  );
}
