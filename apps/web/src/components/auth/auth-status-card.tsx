import Link from 'next/link';
import { AuthLayout } from './auth-layout';

interface AuthStatusCardProps {
  actionHref: string;
  actionLabel: string;
  description: string;
  eyebrow: string;
  /** Segunda salida opcional (p. ej. «Ir a mi historial» en la página 404). */
  secondaryAction?: { href: string; label: string };
  /**
   * Ofrece cerrar la sesión actual (POST a /auth/sign-out). Imprescindible
   * donde la persona no llega a ver ningún panel, como el acceso denegado.
   */
  signOutLabel?: string;
  title: string;
}

/** Presents a clear completion, recovery or access state without changing auth behavior. */
export function AuthStatusCard({
  actionHref,
  actionLabel,
  description,
  eyebrow,
  secondaryAction,
  signOutLabel,
  title,
}: AuthStatusCardProps) {
  return (
    <AuthLayout>
      <header className="avend-auth-heading">
        <p className="avend-eyebrow">{eyebrow}</p>
        <h1 id="auth-status-title">{title}</h1>
        <p>{description}</p>
      </header>
      <Link
        aria-describedby="auth-status-title"
        className="avend-button avend-button--primary avend-auth-status-action"
        href={actionHref}
      >
        {actionLabel}
      </Link>
      {secondaryAction ? (
        <Link
          className="avend-button avend-button--secondary avend-auth-status-action"
          href={secondaryAction.href}
        >
          {secondaryAction.label}
        </Link>
      ) : null}
      {signOutLabel ? (
        <form action="/auth/sign-out" method="post">
          <button
            className="avend-button avend-button--secondary avend-auth-status-action"
            type="submit"
          >
            {signOutLabel}
          </button>
        </form>
      ) : null}
    </AuthLayout>
  );
}
