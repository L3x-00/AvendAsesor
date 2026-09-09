"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  hasErrors,
  validateFormData,
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
}

const FieldErrorContext = createContext<FieldErrorContextValue | null>(null);

interface ValidatedFormProps {
  action?: (formData: FormData) => void;
  "aria-busy"?: boolean;
  children: ReactNode;
  className?: string;
  id?: string;
  onValidSubmit?: (formData: FormData, form: HTMLFormElement) => void;
  rules: FieldRules;
  /** Errores por campo devueltos por la acción de servidor. */
  serverErrors?: FieldErrors;
  /** Evita el reset automático de React al devolver un error de servidor. */
  submissionState?: { status: "idle" | "error" | "success" };
}

type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function formControls(form: HTMLFormElement): FormControl[] {
  return [...form.elements].filter(
    (element): element is FormControl =>
      (element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement) &&
      element.name.length > 0 &&
      !element.matches(":disabled"),
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
    if (!control.willValidate || control.validity.valid) continue;
    // Algunos entornos no reflejan FileList en validity.valueMissing aunque
    // el usuario ya haya seleccionado un archivo válido.
    if (control instanceof HTMLInputElement && control.type === "file" && control.validity.valueMissing && control.files?.length) continue;
    const validity = control.validity;
    let message = control.validationMessage || "Revisa este campo.";
    if (validity.valueMissing) message = "Este campo es obligatorio.";
    else if (validity.typeMismatch) message = control.type === "email"
      ? "El correo electrónico no es válido." : "Ingresa una dirección válida.";
    else if (validity.badInput) message = "Ingresa un número válido.";
    else if (validity.patternMismatch) message = control.title || "El formato de este campo no es válido.";
    else if (validity.tooShort && "minLength" in control) message = `Ingresa al menos ${control.minLength} caracteres.`;
    else if (validity.tooLong && "maxLength" in control) message = `Ingresa como máximo ${control.maxLength} caracteres.`;
    else if (control instanceof HTMLInputElement) {
      if (validity.rangeUnderflow) message = `El valor debe ser igual o mayor que ${control.min}.`;
      else if (validity.rangeOverflow) message = `El valor debe ser igual o menor que ${control.max}.`;
      else if (validity.stepMismatch) message = "Ingresa un valor dentro de los incrementos permitidos.";
    }
    errors[control.name] ??= message;
  }

  return errors;
}

/**
 * Marca el control aunque no esté envuelto en `FormField`: el borde rojo y la
 * lectura del error no deben depender de que la pantalla ya se haya migrado al
 * componente nuevo.
 */
function markInvalidControls(form: HTMLFormElement, errors: FieldErrors, formId: string): void {
  const controls = formControls(form);
  const byName = new Map<string, HTMLElement>();
  for (const message of form.querySelectorAll<HTMLElement>("[data-field-error]")) {
    const name = message.dataset.fieldError!;
    if (message.dataset.generatedFieldError && !errors[name]) message.remove();
    else byName.set(name, message);
  }
  for (const control of controls) {
    if (control.type === "hidden") continue;
    const previousId = control.dataset.validationErrorId;
    const descriptions = new Set((control.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean));
    if (previousId) descriptions.delete(previousId);
    const error = errors[control.name];
    if (error) {
      let message = byName.get(control.name);
      if (!message) {
        message = document.createElement("span");
        message.className = "avend-field-error";
        message.id = `${formId}-${control.name}-error`;
        message.dataset.fieldError = control.name;
        message.dataset.generatedFieldError = "true";
        // El error se enlaza al control con aria-describedby, así que va FUERA
        // de una etiqueta envolvente. Dentro, su texto se sumaría al nombre
        // accesible del campo y rompería getByLabelText, que lee el textContent
        // de la etiqueta (y no respeta aria-hidden).
        const lastControl = controls.filter((item) => item.name === control.name && item.type !== "hidden").at(-1)!;
        const anchor = lastControl.closest("label") ?? lastControl;
        anchor.insertAdjacentElement("afterend", message);
        byName.set(control.name, message);
      }
      if (message.dataset.generatedFieldError) message.textContent = error;
      control.setAttribute("aria-invalid", "true");
      control.dataset.validationErrorId = message.id;
      descriptions.add(message.id);
    } else if (previousId) {
      control.removeAttribute("aria-invalid");
      delete control.dataset.validationErrorId;
    }
    if (descriptions.size) control.setAttribute("aria-describedby", [...descriptions].join(" "));
    else control.removeAttribute("aria-describedby");
  }
}

/** Conserva los File originales, incluidos inputs múltiples. */
export function formDataFromForm(form: HTMLFormElement, submitter?: HTMLElement | null): FormData {
  const data = new FormData(form, submitter);
  const replaced = new Set<string>();
  for (const control of formControls(form)) {
    if (!(control instanceof HTMLInputElement) || control.type !== "file" || !control.files?.length) continue;
    if (!replaced.has(control.name)) {
      data.delete(control.name);
      replaced.add(control.name);
    }
    for (const file of control.files) data.append(control.name, file);
  }
  return data;
}

export function collectFormErrors(form: HTMLFormElement, rules: FieldRules): FieldErrors {
  return { ...nativeConstraintErrors(form), ...validateFormData(rules, formDataFromForm(form)) };
}

function focusFirstError(form: HTMLFormElement, errors: FieldErrors): void {
  // `form.elements` evita construir un selector con el nombre del campo, que
  // obligaría a escaparlo y falla en entornos sin `CSS.escape`.
  const control = formControls(form).find(
    (candidate) => errors[candidate.name] && candidate.type !== "hidden",
  );
  if (!control) return;

  for (let ancestor = control.parentElement; ancestor; ancestor = ancestor.parentElement) {
    if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
  }

  // `scrollIntoView` no existe en todos los entornos de render. El
  // desplazamiento es una cortesía; el foco es lo que no puede perderse.
  const reduceMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  control.scrollIntoView?.({ behavior: reduceMotion ? "instant" : "smooth", block: "center" });
  // El foco va después del desplazamiento para que el lector de pantalla
  // anuncie el campo ya visible.
  globalThis.setTimeout(() => {
    if (control.isConnected) control.focus({ preventScroll: true });
  }, 0);
}

export function ValidatedForm({
  action,
  "aria-busy": ariaBusy,
  children,
  className,
  id,
  onValidSubmit,
  rules,
  serverErrors,
  submissionState,
}: ValidatedFormProps) {
  // Se parte de los errores del servidor por si el formulario se monta ya con
  // ellos; el ajuste posterior solo cubre los que llegan más tarde.
  const [errors, setErrors] = useState<FieldErrors>(serverErrors ?? {});
  const [lastServerErrors, setLastServerErrors] = useState(serverErrors);
  const formRef = useRef<HTMLFormElement>(null);
  const formId = useId();
  const validatedFields = useRef(new Set<string>(Object.keys(serverErrors ?? {})));
  const currentRules = useRef(rules);
  const serverErrorNames = useRef(new Set(Object.keys(serverErrors ?? {})));
  const allowReset = useRef(false);
  const managesReset = Boolean(action && submissionState);

  useLayoutEffect(() => {
    const form = formRef.current;
    if (!form || !managesReset) return;
    // Los eventos sintéticos de React están suspendidos durante su commit.
    // El listener nativo conserva los valores incluso en ese reset interno.
    const retainValues = (event: Event) => {
      if (!allowReset.current) event.preventDefault();
    };
    form.addEventListener("reset", retainValues, true);
    return () => form.removeEventListener("reset", retainValues, true);
  }, [managesReset]);

  // React reinicia el formulario antes de publicar las props del resultado.
  // Cancelamos ese reset y lo autorizamos al recibir un éxito confirmado.
  useLayoutEffect(() => {
    if (submissionState?.status !== "success") return;
    allowReset.current = true;
    try {
      formRef.current?.reset();
    } finally {
      allowReset.current = false;
    }
  }, [submissionState]);

  useLayoutEffect(() => {
    currentRules.current = rules;
  }, [rules]);

  // Los errores del servidor llegan tras un envío, así que sustituyen a los del
  // navegador: son la respuesta a ese mismo intento. Se ajustan durante el
  // render y no en un efecto, que es el patrón de React para reaccionar a un
  // cambio de props sin provocar un segundo render.
  if (serverErrors !== lastServerErrors) {
    setLastServerErrors(serverErrors);
    setErrors(serverErrors ?? {});
  }

  useEffect(() => {
    const form = formRef.current;
    if (form) markInvalidControls(form, errors, formId);
  }, [errors, formId]);

  // Llevar el foco al primer campo sí es un efecto: toca el DOM, no el estado.
  useEffect(() => {
    serverErrorNames.current = new Set(Object.keys(serverErrors ?? {}));
    const form = formRef.current;
    if (!form || !serverErrors || !hasErrors(serverErrors)) return;
    Object.keys(serverErrors).forEach((name) => validatedFields.current.add(name));
    focusFirstError(form, serverErrors);
  }, [serverErrors]);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      const form = event.currentTarget;
      const found = collectFormErrors(form, rules);
      validatedFields.current = new Set([...Object.keys(rules), ...formControls(form).map((control) => control.name)]);
      serverErrorNames.current.clear();

      if (hasErrors(found)) {
        event.preventDefault();
        setErrors(found);
        focusFirstError(form, found);
        return;
      }

      setErrors({});

      if (!onValidSubmit) return;
      // Sin Server Action, el envío lo gestiona el propio componente (por
      // ejemplo con `fetch`), así que hay que detener el envío nativo.
      if (!action) event.preventDefault();
      onValidSubmit(formDataFromForm(form, (event.nativeEvent as SubmitEvent).submitter), form);
    },
    [action, onValidSubmit, rules],
  );

  /**
   * Actualiza el campo y las dependencias que ya se han validado. Los demás
   * campos permanecen sin señalar hasta que se intenta enviar el formulario.
   */
  const handleInput = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      const target = event.target as HTMLElement | null;
      const name = target && "name" in target ? (target as HTMLInputElement).name : "";
      if (!name) return;

      const form = formRef.current;
      if (!form) return;
      // Los selectores pueden cambiar controles o reglas condicionales en el
      // mismo evento. Esperar al commit permite leer esos atributos nuevos.
      queueMicrotask(() => {
        if (!form.isConnected) return;
        const latestRules = currentRules.current;
        const found = collectFormErrors(form, latestRules);
        const present = new Set(formControls(form).map((control) => control.name));
        setErrors((current) => {
          const next = { ...current };
          for (const checked of validatedFields.current) {
            const dependsOnTarget = latestRules[checked]?.some((rule) =>
              (rule.kind === "dateOrder" && rule.startField === name) ||
              (rule.kind === "matchesField" && rule.field === name) ||
              (rule.kind === "requiredWhen" && rule.field === name),
            );
            if (checked === name || dependsOnTarget || !present.has(checked)) {
              serverErrorNames.current.delete(checked);
            }
            if (serverErrorNames.current.has(checked)) continue;
            if (present.has(checked) && found[checked]) next[checked] = found[checked];
            else delete next[checked];
          }
          return Object.keys(current).length === Object.keys(next).length &&
            Object.entries(current).every(([key, value]) => next[key] === value)
            ? current : next;
        });
      });
    },
    [],
  );

  const contextValue = useMemo<FieldErrorContextValue>(
    () => ({
      errorFor: (name: string) => errors[name],
    }),
    [errors],
  );

  return (
    <FieldErrorContext.Provider value={contextValue}>
      <form
        action={action}
        aria-busy={ariaBusy}
        className={className}
        id={id}
        noValidate
        onChange={handleInput}
        onInput={handleInput}
        onResetCapture={(event) => {
          if (action && submissionState && !allowReset.current) {
            event.preventDefault();
          } else {
            validatedFields.current.clear();
            serverErrorNames.current.clear();
            setErrors({});
          }
        }}
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
    }),
    [errors],
  );

  return (
    <FieldErrorContext.Provider value={value}>
      {children}
    </FieldErrorContext.Provider>
  );
}
