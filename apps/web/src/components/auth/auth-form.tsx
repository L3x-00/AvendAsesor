'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { FormField } from '@/components/ui/form-field';
import { useToast } from '@/components/ui/toast';
import { ValidatedForm } from '@/components/ui/validated-form';
import {
  initialAuthActionState,
  type AuthActionState,
  type AuthFieldName,
} from '@/lib/auth/action-state';
import type { FieldRules } from '@/lib/ui/field-validation';
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

const FIELD_LABELS: Record<AuthFieldName, string> = {
  email: 'El correo electrónico',
  fullName: 'El nombre completo',
  password: 'La contraseña',
  passwordConfirmation: 'La confirmación de la contraseña',
};

/**
 * Las reglas se derivan de los campos que la pantalla declara, de modo que
 * sign-in, sign-up, recuperación y cambio de contraseña comparten los mismos
 * mensajes sin repetirlos en cada ruta.
 */
function rulesForFields(fields: AuthField[]): FieldRules {
  const rules: FieldRules = {};

  for (const field of fields) {
    const label = FIELD_LABELS[field.name];
    rules[field.name] = [{ kind: 'required', label }];

    if (field.type === 'email') {
      rules[field.name].push({ kind: 'email', label });
    }

    if (field.name === 'password' || field.name === 'passwordConfirmation') {
      rules[field.name].push({ kind: 'minLength', label, min: 8 });
    }
  }

  return rules;
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <div className="avend-auth-submit-wrap">
      <button
        aria-busy={pending}
        className="avend-button avend-button--primary avend-auth-submit"
        disabled={pending}
        type="submit"
      >
        {pending ? <span aria-hidden="true" className="avend-button-spinner" /> : null}
        <span>{pending ? 'Procesando…' : label}</span>
      </button>
      {pending ? (
        <p className="avend-auth-pending" role="status">
          Procesamos tu solicitud de forma segura. Esto puede tomar unos segundos.
        </p>
      ) : null}
    </div>
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
  const { showToast } = useToast();
  const announced = useRef<AuthActionState | null>(null);
  const rules = rulesForFields(fields);

  useEffect(() => {
    if (state.status !== 'success' || announced.current === state) return;
    announced.current = state;
    if (state.message) showToast(state.message);
  }, [showToast, state]);

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

        <ValidatedForm
          action={formAction}
          className="avend-auth-form"
          rules={rules}
          serverErrors={state.fieldErrors}
        >
          {fields.map((field) => (
            <FormField key={field.name} label={field.label} name={field.name} required>
              <input
                autoComplete={field.autoComplete}
                className="avend-field"
                name={field.name}
                type={field.type}
              />
            </FormField>
          ))}

          {/* El aviso general queda para lo que no pertenece a un campo: una
              credencial rechazada, una sesión caducada o un fallo del servidor. */}
          {state.status === 'error' && state.message ? (
            <p
              aria-live="polite"
              className="avend-feedback avend-feedback--error"
              role="alert"
            >
              {state.message}
            </p>
          ) : null}

          {state.status === 'success' && state.message ? (
            <p
              aria-live="polite"
              className="avend-feedback avend-feedback--success"
              role="status"
            >
              {state.message}
            </p>
          ) : null}

          <SubmitButton label={submitLabel} />
        </ValidatedForm>

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
