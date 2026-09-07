import type { ReactNode } from "react";

interface AdminPageProps {
  children: ReactNode;
  description: string;
  eyebrow?: string | null;
  headerAside?: ReactNode;
  title: string;
  welcome?: string;
}

/**
 * Cabecera y contenido de una sección administrativa.
 *
 * La barra lateral ya no llega por aquí: la aporta `AdminShellFrame` desde el
 * layout del segmento, de modo que persiste entre secciones. Lo que queda es lo
 * que sí cambia en cada ruta —título, descripción y cabecera propia—, y por eso
 * es lo único que Next.js tiene que volver a pintar al navegar.
 */
export function AdminPage({
  children,
  description,
  eyebrow = "Administración",
  headerAside,
  title,
  welcome,
}: AdminPageProps) {
  return (
    <>
      <header
        className={`avend-admin-header${headerAside ? " avend-admin-header--with-aside" : ""}`}
      >
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
    </>
  );
}
