"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/ui/brand-logo";
import type { ChatModule } from "@/lib/chat-api/types";

type TeacherSection = "chat" | "guide" | "history" | "profile";
type NavigationIconName = "chat" | "guide" | "history" | "module" | "profile";

interface TeacherShellProps {
  activeSection: TeacherSection;
  children: ReactNode;
  modules: ChatModule[];
  selectedModuleId?: string;
}

function NavigationIcon({ name }: { name: NavigationIconName }) {
  const paths: Record<NavigationIconName, ReactNode> = {
    chat: <path d="M5 18.5 3.5 21l3.1-1.1A8.5 8.5 0 1 0 5 18.5Z" />,
    guide: (
      <>
        <path d="M5.5 4.5A2.5 2.5 0 0 1 8 2h9.5v17H8a2.5 2.5 0 0 0-2.5 2.5" />
        <path d="M5.5 4.5v17M9 6h5M9 10h5" />
      </>
    ),
    history: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7v5l3.5 2" />
      </>
    ),
    module: (
      <path d="M3 6.5h6l1.6 2H21v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6.5Z" />
    ),
    profile: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      className="avend-navigation-icon"
      fill="none"
      viewBox="0 0 24 24"
    >
      {paths[name]}
    </svg>
  );
}

function TeacherNavigation({
  activeSection,
  modules,
  selectedModuleId,
}: Pick<TeacherShellProps, "activeSection" | "modules" | "selectedModuleId">) {
  return (
    <nav aria-label="Navegación principal" className="avend-teacher-navigation">
      <Link
        aria-current={
          activeSection === "chat" && !selectedModuleId ? "page" : undefined
        }
        className="avend-teacher-new-chat"
        href="/chat"
      >
        <NavigationIcon name="chat" />
        Nuevo chat
      </Link>

      <div
        aria-label="Módulos de consulta"
        className="avend-teacher-module-list"
      >
        {modules.length === 0 ? (
          <p className="avend-teacher-modules-empty">
            Los módulos aparecerán aquí cuando estén configurados.
          </p>
        ) : (
          modules.map((module) => (
            <Link
              aria-current={module.id === selectedModuleId ? "page" : undefined}
              className="avend-teacher-navigation-link"
              href={`/chat?module=${encodeURIComponent(module.id)}`}
              key={module.id}
            >
              <NavigationIcon name="module" />
              <span>{module.name}</span>
            </Link>
          ))
        )}
      </div>

      <div className="avend-teacher-navigation-divider" />
      <Link
        aria-current={activeSection === "history" ? "page" : undefined}
        className="avend-teacher-navigation-link"
        href="/history"
      >
        <NavigationIcon name="history" />
        Historial
      </Link>
      <Link
        aria-current={activeSection === "guide" ? "page" : undefined}
        className="avend-teacher-navigation-link"
        href="/guide"
      >
        <NavigationIcon name="guide" />
        Guía de uso
      </Link>
      <Link
        aria-current={activeSection === "profile" ? "page" : undefined}
        className="avend-teacher-navigation-link"
        href="/profile"
      >
        <NavigationIcon name="profile" />
        Mi perfil
      </Link>
    </nav>
  );
}

/** Shared visual frame. Each route resolves authorization server-side first. */
export function TeacherShell({
  activeSection,
  children,
  modules,
  selectedModuleId,
}: TeacherShellProps) {
  return (
    <div className="avend-teacher-shell">
      <a className="avend-skip-link" href="#main-content">
        Saltar al contenido principal
      </a>
      <aside aria-label="Identidad y módulos" className="avend-teacher-sidebar">
        <BrandLogo
          className="avend-teacher-sidebar-logo"
          priority
          tone="dark-surface"
        />
        <TeacherNavigation
          activeSection={activeSection}
          modules={modules}
          selectedModuleId={selectedModuleId}
        />
      </aside>

      <main className="avend-teacher-main" id="main-content">
        <div className="avend-teacher-mobile-bar">
          <BrandLogo className="avend-teacher-mobile-logo" />
          <details className="avend-teacher-mobile-menu">
            <summary aria-label="Abrir navegación principal">Menú</summary>
            <TeacherNavigation
              activeSection={activeSection}
              modules={modules}
              selectedModuleId={selectedModuleId}
            />
          </details>
        </div>
        {children}
        <p className="avend-teacher-disclaimer">
          La información proporcionada es referencial y no reemplaza la
          normativa vigente.
        </p>
      </main>
    </div>
  );
}
