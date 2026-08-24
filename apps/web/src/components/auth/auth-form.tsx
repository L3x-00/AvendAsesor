'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  initialAuthActionState,
  type AuthActionState,
  type AuthFieldName,
} from '@/lib/auth/action-state';
import { AuthLayout } from './auth-layout';

export type AuthAction = (
  state: AuthActionState,
  formData: FormData,
) => Promise<AuthActionState>;

export interface AuthField {
  autoComplete: string;
  label: string;
  name: AuthFieldName;
  type: 'email' | 'password' | 'text';
}

export interface AuthLink {
  href: string;
  label: string;
}

interface AuthFormProps {
  action: AuthAction;
  description: string;
  fields: AuthField[];
  links?: AuthLink[];
  submitLabel: string;
  title: string;
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      className="avend-button avend-button--primary avend-auth-submit"
      disabled={pending}
      type="submit"
    >
      {pending ? 'Procesando…' : label}
    </button>
  );
}

export function AuthForm({
  action,
  description,
  fields,
  links = [],
  submitLabel,
  title,
}: AuthFormProps) {
  const [state, formAction] = useActionState(action, initialAuthActionState);
  const messageClassName =
    state.status === 'success'
      ? 'avend-feedback--success'
      : 'avend-feedback--error';

  return (
    <AuthLayout>
      <section aria-labelledby="auth-title">
        <header className="avend-auth-heading">
          <p className="avend-eyebrow">Acceso seguro</p>
          <h1 id="auth-title">
          {title}
          </h1>
          <p>{description}</p>
        </header>

        <form action={formAction} className="avend-auth-form" noValidate>
          {fields.map((field) => {
            const error = state.fieldErrors?.[field.name];
            const errorId = `${field.name}-error`;

            return (
              <div key={field.name}>
                <label
                  className="avend-field-label"
                  htmlFor={field.name}
                >
                  {field.label}
                </label>
                <input
                  aria-describedby={error ? errorId : undefined}
                  aria-invalid={Boolean(error)}
                  autoComplete={field.autoComplete}
                  className="avend-field"
                  id={field.name}
                  name={field.name}
                  required
                  type={field.type}
                />
                {error ? (
                  <p className="avend-field-error" id={errorId}>
                    {error}
                  </p>
                ) : null}
              </div>
            );
          })}

          {state.message ? (
            <p
              aria-live="polite"
              className={`avend-feedback ${messageClassName}`}
              role={state.status === 'error' ? 'alert' : 'status'}
            >
              {state.message}
            </p>
          ) : null}

          <SubmitButton label={submitLabel} />
        </form>

        {links.length > 0 ? (
          <nav aria-label="Enlaces de autenticación" className="avend-auth-links">
            {links.map((link) => (
              <a
                className="avend-text-link"
                href={link.href}
                key={link.href}
              >
                {link.label}
              </a>
            ))}
          </nav>
        ) : null}
      </section>
    </AuthLayout>
  );
}
