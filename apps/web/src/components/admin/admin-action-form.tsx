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
      className="inline-flex min-h-10 items-center justify-center rounded-md bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-not-allowed disabled:bg-slate-400"
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
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : 'border-rose-200 bg-rose-50 text-rose-900';

  return (
    <form action={formAction} className={className} noValidate>
      {children}
      {state.message ? (
        <p
          aria-live="polite"
          className={`rounded-md border px-3 py-2 text-sm ${messageClassName}`}
          role={state.status === 'error' ? 'alert' : 'status'}
        >
          {state.message}
        </p>
      ) : null}
      {state.downloadUrl ? (
        <a
          className="block text-sm font-semibold text-sky-800 underline underline-offset-4"
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
