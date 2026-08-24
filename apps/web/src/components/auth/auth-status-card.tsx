import Link from 'next/link';
import { AuthLayout } from './auth-layout';

interface AuthStatusCardProps {
  actionHref: string;
  actionLabel: string;
  description: string;
  eyebrow: string;
  title: string;
}

/** Presents a clear completion, recovery or access state without changing auth behavior. */
export function AuthStatusCard({
  actionHref,
  actionLabel,
  description,
  eyebrow,
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
    </AuthLayout>
  );
}
