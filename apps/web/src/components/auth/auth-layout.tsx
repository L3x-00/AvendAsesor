import type { ReactNode } from 'react';
import { BrandLogo } from '@/components/ui/brand-logo';

interface AuthLayoutProps {
  children: ReactNode;
}

/**
 * Marco compartido para los flujos de identidad. Mantiene el contenido de
 * autenticación concentrado y legible, sin trasladar lógica de sesión al cliente.
 */
export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <main className="avend-auth-page" id="main-content">
      <div className="avend-auth-layout">
        <aside aria-label="Identidad de AVEND ASESOR" className="avend-auth-aside">
          <BrandLogo className="avend-auth-logo" priority tone="dark-surface" />
          <div className="avend-auth-aside-copy">
            <h2>Información clara para tu práctica profesional</h2>
            <p>
              Ingresa a un espacio diseñado para acompañarte con calma,
              claridad y controles de acceso seguros.
            </p>
          </div>
          <ul aria-label="Principios de la plataforma" className="avend-auth-principles">
            <li>Instrucciones directas y fáciles de seguir.</li>
            <li>Tu cuenta se protege con verificación de correo.</li>
            <li>Los permisos se validan antes de mostrar información privada.</li>
          </ul>
        </aside>
        <section aria-label="Acceso a AVEND ASESOR" className="avend-auth-content">
          <div className="avend-auth-card">{children}</div>
        </section>
      </div>
    </main>
  );
}
