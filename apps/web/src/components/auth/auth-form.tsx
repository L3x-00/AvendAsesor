'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  initialAuthActionState,
  type AuthActionState,
  type AuthFieldName,
} from '@/lib/auth/action-state';

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
      className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-sky-700 px-4 py-2 font-semibold text-white transition hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-not-allowed disabled:bg-slate-400"
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
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : 'border-rose-200 bg-rose-50 text-rose-800';

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 text-slate-900">
      <section
        aria-labelledby="auth-title"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
      >
        <p className="text-sm font-semibold tracking-wide text-sky-700">
          AVEND ASESOR
        </p>
        <h1 className="mt-2 text-2xl font-bold" id="auth-title">
          {title}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>

        <form action={formAction} className="mt-6 space-y-4" noValidate>
          {fields.map((field) => {
            const error = state.fieldErrors?.[field.name];
            const errorId = `${field.name}-error`;

            return (
              <div key={field.name}>
                <label
                  className="mb-1.5 block text-sm font-medium text-slate-800"
                  htmlFor={field.name}
                >
                  {field.label}
                </label>
                <input
                  aria-describedby={error ? errorId : undefined}
                  aria-invalid={Boolean(error)}
                  autoComplete={field.autoComplete}
                  className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-700 focus:ring-2 focus:ring-sky-100 aria-[invalid=true]:border-rose-600"
                  id={field.name}
                  name={field.name}
                  required
                  type={field.type}
                />
                {error ? (
                  <p className="mt-1.5 text-sm text-rose-700" id={errorId}>
                    {error}
                  </p>
                ) : null}
              </div>
            );
          })}

          {state.message ? (
            <p
              aria-live="polite"
              className={`rounded-lg border px-3 py-2 text-sm ${messageClassName}`}
              role={state.status === 'error' ? 'alert' : 'status'}
            >
              {state.message}
            </p>
          ) : null}

          <SubmitButton label={submitLabel} />
        </form>

        {links.length > 0 ? (
          <nav aria-label="Enlaces de autenticación" className="mt-5 space-y-2 text-sm">
            {links.map((link) => (
              <a
                className="block font-medium text-sky-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
                href={link.href}
                key={link.href}
              >
                {link.label}
              </a>
            ))}
          </nav>
        ) : null}
      </section>
    </main>
  );
}
