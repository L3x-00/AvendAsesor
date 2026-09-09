"use client";

import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import { useFieldError } from "./validated-form";

export { FieldErrorProvider } from "./validated-form";

/**
 * Campo de formulario con su etiqueta, su ayuda y su error.
 *
 * El error se pinta DEBAJO del campo que lo produjo y el control se tiñe de
 * rojo suave, en vez del mensaje general que obligaba a adivinar. La
 * accesibilidad va incluida: `aria-invalid` marca el control y
 * `aria-describedby` enlaza el texto del error, de modo que un lector de
 * pantalla lo lee al entrar en el campo.
 */

interface FormFieldProps {
  children: ReactNode;
  /** Error explícito. Si se omite, se toma del `ValidatedForm` que lo envuelve. */
  error?: string;
  hint?: string;
  label: string;
  name: string;
  /** Marca visual de obligatorio; la validación la definen las reglas. */
  required?: boolean;
}

type ControlProps = {
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  className?: string;
  id?: string;
};

export function FormField({
  children,
  error,
  hint,
  label,
  name,
  required = false,
}: FormFieldProps) {
  const contextError = useFieldError(name);
  const instanceId = useId();
  const message = error ?? contextError;
  const errorId = `${instanceId}-${name}-error`;
  const hintId = `${instanceId}-${name}-hint`;
  const child = isValidElement<ControlProps>(children) ? children : null;
  const controlId = child?.props.id ?? `${instanceId}-${name}`;
  const describedBy = [child?.props["aria-describedby"], hint ? hintId : null, message ? errorId : null]
    .filter(Boolean)
    .join(" ");

  const control = child
    ? cloneElement(child, {
        "aria-describedby": describedBy || undefined,
        "aria-invalid": message ? true : child.props["aria-invalid"],
        className: [child.props.className, message ? "avend-field--invalid" : null]
          .filter(Boolean)
          .join(" "),
        id: controlId,
      })
    : children;

  return (
    <div className="avend-form-field">
      {/* El asterisco de obligatorio se pinta desde CSS: si fuera texto del
          `label`, pasaría a formar parte del nombre accesible del campo y lo
          leería el lector de pantalla como parte de la etiqueta. */}
      <label
        className={`avend-field-label${required ? " avend-field-label--required" : ""}`}
        htmlFor={controlId}
      >
        {label}
      </label>
      {hint ? (
        <p className="avend-field-hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {control}
      {message ? (
        <p aria-live="polite" className="avend-field-error" data-field-error={name} id={errorId}>
          <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5v5.5M12 16.2v.3" />
          </svg>
          <span>{message}</span>
        </p>
      ) : null}
    </div>
  );
}

/**
 * Solo el mensaje de error de un campo.
 *
 * Para formularios que ya tienen su propia maquetación de etiqueta y control
 * —los del panel administrativo usan rejillas de CSS Modules— envolverlos en
 * `FormField` rompería el layout. Esto añade el mensaje debajo del campo sin
 * tocar nada más; el borde rojo lo aporta el `aria-invalid` que marca el
 * formulario.
 */
export function FieldError({ name }: { name: string }) {
  const message = useFieldError(name);
  const instanceId = useId();
  if (!message) return null;

  return (
    <p aria-live="polite" className="avend-field-error" data-field-error={name} id={`${instanceId}-${name}-error`}>
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5v5.5M12 16.2v.3" />
      </svg>
      <span>{message}</span>
    </p>
  );
}

/** Igual que `FormField`, pero para grupos (radios, casillas) sin un `for`. */
export function FormFieldGroup({
  children,
  error,
  hint,
  label,
  name,
}: Omit<FormFieldProps, "required">): ReactElement {
  const contextError = useFieldError(name);
  const instanceId = useId();
  const message = error ?? contextError;
  const errorId = `${instanceId}-${name}-error`;
  const hintId = `${instanceId}-${name}-hint`;

  return (
    <fieldset
      aria-describedby={[hint ? hintId : null, message ? errorId : null].filter(Boolean).join(" ") || undefined}
      aria-invalid={message ? true : undefined}
      className="avend-form-field"
      name={name}
    >
      <legend className="avend-field-label">{label}</legend>
      {hint ? <p className="avend-field-hint" id={hintId}>{hint}</p> : null}
      {children}
      {message ? (
        <p aria-live="polite" className="avend-field-error" data-field-error={name} id={errorId}>
          <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5v5.5M12 16.2v.3" />
          </svg>
          <span>{message}</span>
        </p>
      ) : null}
    </fieldset>
  );
}
