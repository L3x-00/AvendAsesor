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
  /** Aviso sereno sobre el formulario (p. ej. una sesión caducada). */
  notice?: { text: string; title: string };
  /** Ofrece mantener la sesión y recordar el correo en este dispositivo. */
  rememberOption?: boolean;
  submitLabel: string;
  title: string;
}

/**
 * Solo se recuerda el CORREO, nunca la contraseña: guardarla es tarea del
 * gestor de contraseñas del navegador, que los campos ya habilitan con
 * `autocomplete="email"` y `autocomplete="current-password"`.
 */
const REMEMBERED_EMAIL_KEY = 'avend-remembered-email';

function readRememberedEmail(): string | null {
  try {
    return window.localStorage.getItem(REMEMBERED_EMAIL_KEY);
  } catch {
    return null;
  }
}

function writeRememberedEmail(email: string | null) {
  try {
    if (email) window.localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
    else window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
  } catch {
    // Almacenamiento bloqueado (modo privado): recordar es solo una comodidad.
  }
}

function RememberMe() {
  return (
    <label className="avend-remember">
      <input defaultChecked name="remember" type="checkbox" />
      <span className="avend-remember-box" aria-hidden="true">
        <svg fill="none" viewBox="0 0 24 24">
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        </svg>
      </span>
      <span className="avend-remember-text">
        <strong>Mantener mi sesión iniciada</strong>
        <span>
          En este dispositivo no tendrás que volver a ingresar tus datos. No lo
          marques en una computadora compartida.
        </span>
      </span>
    </label>
  );
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
  const setsPassword = fields.some((field) => field.name === 'passwordConfirmation');

  for (const field of fields) {
    const label = FIELD_LABELS[field.name];
    rules[field.name] = [{ kind: 'required', label }];

    if (field.type === 'email') {
      rules[field.name].push({ kind: 'email', label });
    }

    if (field.name === 'fullName') {
      rules[field.name].push(
        { kind: 'minLength', label, min: 2 },
        { kind: 'maxLength', label, max: 160 },
      );
    }

    // El acceso acepta contraseñas ya existentes; la política de creación se
    // aplica solo al registro y al cambio, igual que en el contrato vigente.
    if (field.name === 'password' && setsPassword) {
      rules[field.name].push(
        { kind: 'minLength', label, min: 8, trim: false },
        { kind: 'pattern', label, regexp: /[a-z]/, message: 'La contraseña debe incluir una letra minúscula.' },
        { kind: 'pattern', label, regexp: /[A-Z]/, message: 'La contraseña debe incluir una letra mayúscula.' },
        { kind: 'pattern', label, regexp: /[0-9]/, message: 'La contraseña debe incluir un número.' },
      );
    }

    if (field.name === 'passwordConfirmation') {
      rules[field.name].push({ kind: 'matchesField', field: 'password', message: 'Las contraseñas no coinciden.' });
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
  notice,
  rememberOption = false,
  submitLabel,
  title,
}: AuthFormProps) {
  const [state, formAction] = useActionState(action, initialAuthActionState);
  const { showToast } = useToast();
  const announced = useRef<AuthActionState | null>(null);
  const rules = rulesForFields(fields);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  // El correo recordado se completa tras montar (localStorage no existe en el
  // servidor) y el foco pasa directo a la contraseña: un paso menos.
  useEffect(() => {
    if (!rememberOption) return;
    const remembered = readRememberedEmail();
    const input = emailInputRef.current;
    if (!remembered || !input || input.value) return;
    input.value = remembered;
    passwordInputRef.current?.focus();
  }, [rememberOption]);

  function rememberEmail(formData: FormData) {
    if (!rememberOption) return;
    const email = formData.get('email');
    writeRememberedEmail(
      formData.get('remember') === 'on' && typeof email === 'string'
        ? email.trim()
        : null,
    );
  }

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

        {notice ? (
          <div className="avend-auth-notice" role="status">
            <span aria-hidden="true" className="avend-auth-notice-icon">
              <svg fill="none" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="8.5" />
                <path d="M12 7.5V12l3 2" />
              </svg>
            </span>
            <div>
              <strong>{notice.title}</strong>
              <p>{notice.text}</p>
            </div>
          </div>
        ) : null}

        <ValidatedForm
          action={formAction}
          className="avend-auth-form"
          onValidSubmit={rememberEmail}
          rules={rules}
          serverErrors={state.fieldErrors}
          submissionState={state}
        >
          {fields.map((field) => (
            <FormField key={field.name} label={field.label} name={field.name} required>
              <input
                autoComplete={field.autoComplete}
                className="avend-field"
                name={field.name}
                ref={
                  field.name === 'email'
                    ? emailInputRef
                    : field.name === 'password'
                      ? passwordInputRef
                      : undefined
                }
                type={field.type}
              />
            </FormField>
          ))}

          {rememberOption ? <RememberMe /> : null}

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
