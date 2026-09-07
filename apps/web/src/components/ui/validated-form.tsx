"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  hasErrors,
  validateField,
  validateFormData,
  valuesFromFormData,
  type FieldErrors,
  type FieldRules,
} from "@/lib/ui/field-validation";

/**
 * Formulario con validación campo por campo.
 *
 * Reúne tres comportamientos que antes faltaban o estaban repetidos en cada
 * pantalla:
 *
 * 1. Al enviar, se marcan TODOS los campos con error, no solo el primero, y la
 *    vista se desplaza al primero para que no quede fuera de pantalla en
 *    formularios largos.
 * 2. El error de un campo desaparece en cuanto el usuario lo corrige. Se
 *    escucha en el formulario por delegación, de modo que sirve igual para
 *    inputs, selects, textareas y campos de archivo sin cablear cada uno.
 * 3. Los errores que devuelve el servidor por campo se muestran en el mismo
 *    sitio que los del navegador. El mensaje general queda reservado para lo
 *    que no pertenece a ningún campo: un fallo de red o de permisos.
 */

interface FieldErrorContextValue {
  errorFor: (name: string) => string | undefined;
  registerRules: (name: string) => void;
}

const FieldErrorContext = createContext<FieldErrorContextValue | null>(null);

interface ValidatedFormProps {
  action?: (formData: FormData) => void;
  children: ReactNode;
  className?: string;
  id?: string;
  onValidSubmit?: (formData: FormData, form: HTMLFormElement) => void;
  rules: FieldRules;
  /** Errores por campo devueltos por la acción de servidor. */
  serverErrors?: FieldErrors;
}

type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function formControls(form: HTMLFormElement): FormControl[] {
  return [...form.elements].filter(
    (element): element is FormControl =>
      (element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement) &&
      element.name.length > 0 &&
      !element.disabled,
  );
}

/**
 * Los atributos nativos (`required`, `type="email"`, `pattern`, `min`) siguen
 * valiendo. El formulario lleva `noValidate` para sustituir los globos del
 * navegador por mensajes propios, pero la restricción se comprueba igual: así
 * un campo sin regla declarada nunca se envía vacío por descuido.
 */
function nativeConstraintErrors(form: HTMLFormElement): FieldErrors {
  const errors: FieldErrors = {};

  for (const control of formControls(form)) {
    if (control.checkValidity()) continue;
    errors[control.name] ??= control.validationMessage || "Revisa este campo.";
  }

  return errors;
}

/**
 * Marca el control aunque no esté envuelto en `FormField`: el borde rojo y la
 * lectura del error no deben depender de que la pantalla ya se haya migrado al
 * componente nuevo.
 */
function markInvalidControls(form: HTMLFormElement, errors: FieldErrors): void {
  for (const control of formControls(form)) {
    if (errors[control.name]) {
      control.setAttribute("aria-invalid", "true");
    } else {
      control.removeAttribute("aria-invalid");
    }
  }
}

function focusFirstError(form: HTMLFormElement, errors: FieldErrors): void {
  const firstName = Object.keys(errors)[0];
  if (!firstName) return;

  // `form.elements` evita construir un selector con el nombre del campo, que
  // obligaría a escaparlo y falla en entornos sin `CSS.escape`.
  const control = formControls(form).find(
    (candidate) => candidate.name === firstName,
  );
  if (!control) return;

  // `scrollIntoView` no existe en todos los entornos de render. El
  // desplazamiento es una cortesía; el foco es lo que no puede perderse.
  control.scrollIntoView?.({ behavior: "smooth", block: "center" });
  // El foco va después del desplazamiento para que el lector de pantalla
  // anuncie el campo ya visible.
  globalThis.setTimeout(() => control.focus({ preventScroll: true }), 0);
}

export function ValidatedForm({
  action,
  children,
  className,
  id,
  onValidSubmit,
  rules,
  serverErrors,
}: ValidatedFormProps) {
  // Se parte de los errores del servidor por si el formulario se monta ya con
  // ellos; el ajuste posterior solo cubre los que llegan más tarde.
  const [errors, setErrors] = useState<FieldErrors>(serverErrors ?? {});
  const [lastServerErrors, setLastServerErrors] = useState(serverErrors);
  const formRef = useRef<HTMLFormElement>(null);

  // Los errores del servidor llegan tras un envío, así que sustituyen a los del
  // navegador: son la respuesta a ese mismo intento. Se ajustan durante el
  // render y no en un efecto, que es el patrón de React para reaccionar a un
  // cambio de props sin provocar un segundo render.
  if (serverErrors !== lastServerErrors) {
    setLastServerErrors(serverErrors);
    if (serverErrors && hasErrors(serverErrors)) {
      setErrors(serverErrors);
    }
  }

  // Llevar el foco al primer campo sí es un efecto: toca el DOM, no el estado.
  useEffect(() => {
    const form = formRef.current;
    if (!form || !serverErrors || !hasErrors(serverErrors)) return;
    markInvalidControls(form, serverErrors);
    focusFirstError(form, serverErrors);
  }, [serverErrors]);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      const form = event.currentTarget;
      const found = {
        ...nativeConstraintErrors(form),
        ...validateFormData(rules, new FormData(form)),
      };

      if (hasErrors(found)) {
        event.preventDefault();
        setErrors(found);
        markInvalidControls(form, found);
        focusFirstError(form, found);
        return;
      }

      setErrors({});
      markInvalidControls(form, {});

      if (!onValidSubmit) return;
      // Sin Server Action, el envío lo gestiona el propio componente (por
      // ejemplo con `fetch`), así que hay que detener el envío nativo.
      if (!action) event.preventDefault();
      onValidSubmit(new FormData(form), form);
    },
    [action, onValidSubmit, rules],
  );

  /**
   * Revalida solo el campo tocado. Validar el formulario entero al teclear
   * pintaría de rojo campos que el usuario todavía no ha visitado.
   */
  const handleInput = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      const target = event.target as HTMLElement | null;
      const name = target && "name" in target ? (target as HTMLInputElement).name : "";
      if (!name) return;

      setErrors((current) => {
        if (!current[name]) return current;

        const form = formRef.current;
        if (!form) return current;

        const values = valuesFromFormData(new FormData(form));
        if (validateField(rules[name], values[name], values)) return current;
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLSelectElement ||
          target instanceof HTMLTextAreaElement
        ) {
          if (!target.checkValidity()) return current;
          target.removeAttribute("aria-invalid");
        }

        const next = { ...current };
        delete next[name];
        return next;
      });
    },
    [rules],
  );

  const contextValue = useMemo<FieldErrorContextValue>(
    () => ({
      errorFor: (name: string) => errors[name],
      registerRules: () => undefined,
    }),
    [errors],
  );

  return (
    <FieldErrorContext.Provider value={contextValue}>
      <form
        action={action}
        className={className}
        id={id}
        noValidate
        onChange={handleInput}
        onInput={handleInput}
        onSubmit={handleSubmit}
        ref={formRef}
      >
        {children}
      </form>
    </FieldErrorContext.Provider>
  );
}

/** Error vigente de un campo, si el campo está dentro de un `ValidatedForm`. */
export function useFieldError(name: string): string | undefined {
  return useContext(FieldErrorContext)?.errorFor(name);
}

/**
 * Publica errores por campo sin usar `ValidatedForm`.
 *
 * Lo necesitan los formularios que ya gestionan su propio envío —la carga de
 * PDF sube el archivo directamente al API— pero que igualmente deben mostrar el
 * error debajo del campo que lo produjo.
 */
export function FieldErrorProvider({
  children,
  errors,
}: {
  children: ReactNode;
  errors: FieldErrors;
}) {
  const value = useMemo<FieldErrorContextValue>(
    () => ({
      errorFor: (name: string) => errors[name],
      registerRules: () => undefined,
    }),
    [errors],
  );

  return (
    <FieldErrorContext.Provider value={value}>
      {children}
    </FieldErrorContext.Provider>
  );
}
