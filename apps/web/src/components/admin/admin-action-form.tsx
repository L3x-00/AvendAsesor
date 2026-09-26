"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { FormField } from "@/components/ui/form-field";
import { useToast } from "@/components/ui/toast";
import { ValidatedForm } from "@/components/ui/validated-form";
import {
  initialAdminActionState,
  type AdminActionState,
} from "@/lib/admin-api/action-state";
import type { FieldRules } from "@/lib/ui/field-validation";

export type AdminAction = (
  state: AdminActionState,
  formData: FormData,
) => Promise<AdminActionState>;

interface AdminActionFormProps {
  action: AdminAction;
  children: ReactNode;
  className?: string;
  confirmMessage?: string;
  onSuccess?: () => void;
  /** Reglas por campo. Sin ellas el formulario sigue funcionando, pero pierde
   * la validación inmediata y solo muestra lo que responda el servidor. */
  rules?: FieldRules;
  submitLabel: string;
  /** Texto del aviso de éxito. Si se omite se usa el mensaje de la acción. */
  successMessage?: string;
  /** "danger": botón rojo para confirmar acciones destructivas. */
  tone?: "danger" | "primary";
}

function SubmitButton({
  label,
  tone = "primary",
}: {
  label: string;
  tone?: "danger" | "primary";
}) {
  const { pending } = useFormStatus();

  return (
    <button
      className={`avend-button ${tone === "danger" ? "avend-button--danger" : "avend-button--primary"} avend-admin-submit`}
      disabled={pending}
      type="submit"
    >
      {pending ? "Procesando…" : label}
    </button>
  );
}

export function AdminActionForm({
  action,
  children,
  className = "space-y-3",
  confirmMessage,
  onSuccess,
  rules = {},
  submitLabel,
  successMessage,
  tone = "primary",
}: AdminActionFormProps) {
  const [state, formAction] = useActionState(action, initialAdminActionState);
  const { showToast } = useToast();
  const announced = useRef<AdminActionState | null>(null);

  // El éxito se confirma con un aviso emergente en vez de un párrafo que se
  // pierde entre el resto de la pantalla. La referencia evita repetirlo cuando
  // React vuelve a renderizar con el mismo estado.
  useEffect(() => {
    if (state.status !== "success" || announced.current === state) return;
    announced.current = state;
    showToast(state.message ?? successMessage ?? "Guardado con éxito.");
    onSuccess?.();
  }, [showToast, state, successMessage, onSuccess]);

  // Solo queda visible el aviso general: lo que pertenece a un campo lo pinta
  // el propio campo, debajo de él.
  const generalMessage = state.status === "error" ? state.message : undefined;

  return (
    <ValidatedForm
      action={
        confirmMessage
          ? (formData: FormData) => {
              if (window.confirm(confirmMessage)) formAction(formData);
            }
          : formAction
      }
      className={className}
      rules={rules}
      serverErrors={state.fieldErrors}
      submissionState={state}
    >
      {children}
      {generalMessage ? (
        <p
          aria-live="polite"
          className="avend-feedback avend-feedback--error"
          role="alert"
        >
          {generalMessage}
        </p>
      ) : null}
      {/* El aviso emergente confirma; este texto permanece. Hace falta para dar
          contexto a lo que la acción deja en pantalla, como el enlace de
          descarga temporal, que sin él aparecería suelto. */}
      {state.status === "success" && state.message ? (
        <p
          aria-live="polite"
          className="avend-feedback avend-feedback--success"
          role="status"
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
      <SubmitButton label={submitLabel} tone={tone} />
    </ValidatedForm>
  );
}

export { FormField };
