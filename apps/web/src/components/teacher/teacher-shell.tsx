"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BrandLogo } from "@/components/ui/brand-logo";
import type { ChatModule } from "@/lib/chat-api/types";

type TeacherSection = "chat" | "guide" | "history" | "profile";
type TeacherRole = "docente" | "admin" | "superadmin";
type NavigationIconName =
  | "admin"
  | "chat"
  | "guide"
  | "history"
  | "module"
  | "profile"
  | "signout";

function isAdministrative(role: TeacherRole | undefined): boolean {
  return role === "admin" || role === "superadmin";
}

/** Solo los módulos raíz se listan en la barra lateral; los submódulos se
 * muestran en la zona principal de trabajo (guía visual §3–§4). */
function parentModules(modules: ChatModule[]): ChatModule[] {
  return modules
    .filter((module) => module.parentModuleId === null)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

interface TeacherShellProps {
  activeSection: TeacherSection;
  children: ReactNode;
  moduleNavigationDisabled?: boolean;
  modules: ChatModule[];
  onModuleSelect?: (moduleId: string) => void;
  onNewChat?: () => void;
  role?: TeacherRole;
  selectedModuleId?: string;
}

function NavigationIcon({ name }: { name: NavigationIconName }) {
  const paths: Record<NavigationIconName, ReactNode> = {
    admin: (
      <>
        <path d="M12 3 5 6v5c0 4.2 2.9 7.3 7 8 4.1-.7 7-3.8 7-8V6l-7-3Z" />
        <path d="m9.2 12 1.9 1.9 3.7-3.8" />
      </>
    ),
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
    signout: (
      <>
        <path d="M14 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2" />
        <path d="M10 12h10m0 0-3-3m3 3-3 3" />
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
  moduleNavigationDisabled,
  modules,
  onModuleSelect,
  onNewChat,
  role,
  selectedModuleId,
}: Pick<
  TeacherShellProps,
  | "activeSection"
  | "moduleNavigationDisabled"
  | "modules"
  | "onModuleSelect"
  | "onNewChat"
  | "role"
  | "selectedModuleId"
>) {
  const rootModules = parentModules(modules);

  return (
    <nav aria-label="Navegación principal" className="avend-teacher-navigation">
      {onNewChat ? (
        <button
          aria-current={
            activeSection === "chat" && !selectedModuleId ? "page" : undefined
          }
          className="avend-teacher-new-chat"
          disabled={moduleNavigationDisabled}
          onClick={onNewChat}
          type="button"
        >
          <NavigationIcon name="chat" />
          Nuevo chat
        </button>
      ) : (
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
      )}

      <div
        aria-label="Módulos de consulta"
        className="avend-teacher-module-list"
      >
        {rootModules.length === 0 ? (
          <p className="avend-teacher-modules-empty">
            Los módulos aparecerán aquí cuando estén configurados.
          </p>
        ) : (
          rootModules.map((module) =>
            onModuleSelect ? (
              <button
                aria-pressed={module.id === selectedModuleId}
                className="avend-teacher-navigation-link avend-teacher-module-link"
                disabled={moduleNavigationDisabled}
                key={module.id}
                onClick={() => onModuleSelect(module.id)}
                type="button"
              >
                <NavigationIcon name="module" />
                <span>{module.name}</span>
              </button>
            ) : (
              <Link
                aria-current={module.id === selectedModuleId ? "page" : undefined}
                className="avend-teacher-navigation-link avend-teacher-module-link"
                href={`/chat?module=${encodeURIComponent(module.id)}`}
                key={module.id}
              >
                <NavigationIcon name="module" />
                <span>{module.name}</span>
              </Link>
            ),
          )
        )}
      </div>

      <div className="avend-teacher-navigation-divider" />
      {isAdministrative(role) ? (
        <Link
          className="avend-teacher-navigation-link avend-teacher-admin-entry"
          href="/admin"
        >
          <NavigationIcon name="admin" />
          <span>Panel de administración</span>
        </Link>
      ) : null}
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

      <form
        action="/auth/sign-out"
        className="avend-teacher-sign-out"
        method="post"
      >
        <button
          className="avend-teacher-navigation-link avend-teacher-sign-out-button"
          type="submit"
        >
          <NavigationIcon name="signout" />
          <span>Cerrar sesión</span>
        </button>
      </form>
    </nav>
  );
}

/** Shared visual frame. Each route resolves authorization server-side first. */
export function TeacherShell({
  activeSection,
  children,
  moduleNavigationDisabled,
  modules,
  onModuleSelect,
  onNewChat,
  role,
  selectedModuleId,
}: TeacherShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuDetailsRef = useRef<HTMLDetailsElement>(null);
  const mobileMenuSummaryRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const details = mobileMenuDetailsRef.current;
    if (!details) return;
    const detailsElement = details;

    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape" || !detailsElement.open) return;
      event.preventDefault();
      detailsElement.open = false;
      setMobileMenuOpen(false);
      globalThis.setTimeout(() => {
        mobileMenuSummaryRef.current?.focus();
      }, 0);
    }

    detailsElement.addEventListener("keydown", handleEscape);
    return () => detailsElement.removeEventListener("keydown", handleEscape);
  }, []);

  function closeMobileMenuAndRestoreFocus() {
    if (mobileMenuDetailsRef.current) {
      mobileMenuDetailsRef.current.open = false;
    }
    setMobileMenuOpen(false);
    globalThis.setTimeout(() => {
      mobileMenuSummaryRef.current?.focus();
    }, 0);
  }

  function handleMobileModuleSelect(moduleId: string) {
    onModuleSelect?.(moduleId);
    closeMobileMenuAndRestoreFocus();
  }

  function handleMobileNewChat() {
    onNewChat?.();
    closeMobileMenuAndRestoreFocus();
  }

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
          moduleNavigationDisabled={moduleNavigationDisabled}
          modules={modules}
          onModuleSelect={onModuleSelect}
          onNewChat={onNewChat}
          role={role}
          selectedModuleId={selectedModuleId}
        />
      </aside>

      <main className="avend-teacher-main" id="main-content">
        <div className="avend-teacher-mobile-bar">
          <BrandLogo className="avend-teacher-mobile-logo" />
          <details
            className="avend-teacher-mobile-menu"
            onToggle={(event) => setMobileMenuOpen(event.currentTarget.open)}
            ref={mobileMenuDetailsRef}
          >
            <summary
              aria-label={
                mobileMenuOpen
                  ? "Menú: cerrar navegación principal"
                  : "Menú: abrir navegación principal"
              }
              ref={mobileMenuSummaryRef}
            >
              <svg
                aria-hidden="true"
                className="avend-teacher-mobile-menu-icon"
                fill="none"
                viewBox="0 0 24 24"
              >
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
              <span>Menú</span>
            </summary>
            <TeacherNavigation
              activeSection={activeSection}
              moduleNavigationDisabled={moduleNavigationDisabled}
              modules={modules}
              onModuleSelect={
                onModuleSelect ? handleMobileModuleSelect : undefined
              }
              onNewChat={onNewChat ? handleMobileNewChat : undefined}
              role={role}
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
