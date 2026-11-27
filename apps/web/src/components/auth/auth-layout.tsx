import type { ReactNode } from 'react';
import { BrandLogo } from '@/components/ui/brand-logo';

interface AuthLayoutProps {
  children: ReactNode;
  /** Textos del panel lateral según el flujo (acceso o registro). */
  variant?: 'sign-in' | 'sign-up';
}

const COPY = {
  'sign-in': {
    description:
      'Ingresa a un espacio diseñado para acompañarte con calma, claridad y consultas de acceso seguros.',
    features: [
      {
        icon: 'shield',
        text: 'Tu cuenta se protege con verificación de correo.',
        title: 'Acceso seguro',
      },
      {
        icon: 'bolt',
        text: 'Instrucciones directas y fáciles de seguir.',
        title: 'Uso confiable',
      },
      {
        icon: 'lock',
        text: 'Tus permisos se validan antes de mostrar información privada.',
        title: 'Privacidad garantizada',
      },
    ],
  },
  'sign-up': {
    description:
      'Crea tu cuenta y accede a un espacio diseñado para acompañarte con calma, claridad y consultas de forma segura.',
    features: [
      {
        icon: 'user',
        text: 'Crea tu cuenta en pocos pasos.',
        title: 'Registro sencillo',
      },
      {
        icon: 'shield',
        text: 'Tus datos se protegen con verificación de correo.',
        title: 'Acceso seguro',
      },
      {
        icon: 'layers',
        text: 'Consulta normativa, procedimientos y más información especializada.',
        title: 'Acceso a recursos',
      },
    ],
  },
} as const;

function FeatureIcon({ name }: { name: string }) {
  if (name === 'bolt') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M13 3 5 13h5l-1 8 8-10h-5z" />
      </svg>
    );
  }
  if (name === 'user') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <circle cx="10" cy="8" r="3.5" />
        <path d="M3.5 20a6.5 6.5 0 0 1 13 0M17 8h5M19.5 5.5v5" />
      </svg>
    );
  }
  if (name === 'layers') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M12 4 4 8l8 4 8-4zM4 12l8 4 8-4M4 16l8 4 8-4" />
      </svg>
    );
  }
  if (name === 'lock') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <rect height="10" rx="2" width="14" x="5" y="10.5" />
        <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 3.5 5 6v5.5c0 4.4 2.9 7.7 7 9 4.1-1.3 7-4.6 7-9V6z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

/**
 * Marco compartido para los flujos de identidad. Mantiene el contenido de
 * autenticación concentrado y legible, sin trasladar lógica de sesión al cliente.
 */
export function AuthLayout({ children, variant = 'sign-in' }: AuthLayoutProps) {
  const copy = COPY[variant];

  return (
    <main className="avend-auth-page" id="main-content">
      <div className="avend-auth-layout">
        <aside aria-label="Identidad de AVEND ASESOR" className="avend-auth-aside">
          <BrandLogo className="avend-auth-logo" priority tone="dark-surface" />
          <div className="avend-auth-aside-copy">
            <h2>Información clara para tu práctica profesional</h2>
            <p>{copy.description}</p>
          </div>
          <ul aria-label="Principios de la plataforma" className="avend-auth-principles">
            {copy.features.map((feature) => (
              <li key={feature.title}>
                <span className="avend-auth-feature-icon">
                  <FeatureIcon name={feature.icon} />
                </span>
                <span className="avend-auth-feature-copy">
                  <strong>{feature.title}</strong>
                  <span>{feature.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </aside>
        <section aria-label="Acceso a AVEND ASESOR" className="avend-auth-content">
          <div className="avend-auth-card">{children}</div>
        </section>
      </div>
    </main>
  );
}
