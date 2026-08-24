'use client';

import { useActionState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import {
  initialAdminActionState,
  type AdminActionState,
} from '@/lib/admin-api/action-state';

export type AdminAction = (
  state: AdminActionState,
  formData: FormData,
) => Promise<AdminActionState>;

interface AdminActionFormProps {
  action: AdminAction;
  children: ReactNode;
  className?: string;
  submitLabel: string;
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      className="avend-button avend-button--primary avend-admin-submit"
      disabled={pending}
      type="submit"
    >
      {pending ? 'Procesando…' : label}
    </button>
  );
}

export function AdminActionForm({
  action,
  children,
  className = 'space-y-3',
  submitLabel,
}: AdminActionFormProps) {
  const [state, formAction] = useActionState(action, initialAdminActionState);
  const messageClassName =
    state.status === 'success'
      ? 'avend-feedback--success'
      : 'avend-feedback--error';

  return (
    <form action={formAction} className={className} noValidate>
      {children}
      {state.message ? (
        <p
          aria-live="polite"
          className={`avend-feedback ${messageClassName}`}
          role={state.status === 'error' ? 'alert' : 'status'}
        >
          {state.message}
        </p>
      ) : null}
      {state.downloadUrl ? (
        <a
          className="avend-text-link"
          href={state.downloadUrl}
          rel="noreferrer"
          target="_blank"
        >
          Abrir descarga temporal
        </a>
      ) : null}
      <SubmitButton label={submitLabel} />
    </form>
  );
}
