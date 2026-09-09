/**
 * Validación de formularios campo por campo.
 *
 * Antes, un formulario con varios errores mostraba un único mensaje general y
 * el administrador tenía que adivinar qué campo lo causaba. Aquí cada regla
 * devuelve el nombre del campo y un texto explícito, de modo que el error se
 * pinta debajo del campo que lo produjo.
 *
 * Las reglas son datos, no componentes: las usan tanto la validación inmediata
 * del navegador como las Server Actions, para que el mensaje sea el mismo venga
 * de donde venga.
 */

export type FieldErrors = Record<string, string>;

export type FieldRule =
  | { kind: "required"; label: string }
  | { kind: "email"; label: string; optional?: boolean }
  | { kind: "phone"; label: string; optional?: boolean }
  | { kind: "minLength"; label: string; min: number; optional?: boolean; trim?: boolean }
  | { kind: "maxLength"; label: string; max: number }
  | { kind: "pattern"; label: string; regexp: RegExp; message: string; optional?: boolean }
  | { kind: "dateOrder"; label: string; startField: string; startLabel: string }
  | { kind: "matchesField"; field: string; message: string }
  | { kind: "requiredWhen"; field: string; value: string; label: string }
  | { kind: "jsonObject"; label: string }
  | { kind: "file"; label: string; accept: string[]; maxBytes: number; optional?: boolean };

export type FieldRules = Record<string, FieldRule[]>;

/** Valor de un campo tal y como llega de un formulario. */
export type FieldValue = File | string | null | undefined;

/**
 * Acepta números peruanos con o sin prefijo internacional y con los separadores
 * que la gente escribe de forma natural: "987 654 321", "+51 987-654-321".
 */
const PHONE_PATTERN = /^\+?\d[\d\s-]{6,19}$/u;

/**
 * Deliberadamente permisivo. Rechazar direcciones válidas y poco comunes es
 * peor que aceptar una con errata: el servidor y el correo de confirmación
 * tienen la última palabra.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u;

function asText(value: FieldValue): string {
  return typeof value === "string" ? value.trim() : "";
}

function isEmpty(value: FieldValue): boolean {
  if (value instanceof File) return value.size === 0 && value.name === "";
  return asText(value).length === 0;
}

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    const megabytes = bytes / (1024 * 1024);
    return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

function checkRule(
  rule: FieldRule,
  value: FieldValue,
  values: Record<string, FieldValue>,
): string | null {
  const empty = isEmpty(value);

  if (rule.kind === "required") {
    return empty ? `${rule.label} es obligatorio.` : null;
  }

  if (rule.kind === "requiredWhen") {
    return values[rule.field] === rule.value && empty ? `${rule.label} es obligatorio.` : null;
  }

  // El resto de reglas solo se aplican cuando hay algo que validar: la
  // obligatoriedad es una regla aparte, para no repetir dos mensajes sobre el
  // mismo campo vacío.
  if (empty) return null;

  switch (rule.kind) {
    case "email":
      return EMAIL_PATTERN.test(asText(value))
        ? null
        : "El correo electrónico no es válido.";

    case "phone":
      return PHONE_PATTERN.test(asText(value)) && asText(value).replace(/\D/g, "").length >= 7
        ? null
        : "El número de celular no es válido. Usa solo dígitos, por ejemplo 987654321.";

    case "minLength":
      return (rule.trim === false && typeof value === "string" ? value : asText(value)).length >= rule.min
        ? null
        : `${rule.label} debe tener al menos ${rule.min} caracteres.`;

    case "maxLength":
      return asText(value).length <= rule.max
        ? null
        : `${rule.label} no puede superar ${rule.max} caracteres.`;

    case "pattern":
      // Las expresiones globales conservan lastIndex entre validaciones.
      return new RegExp(rule.regexp.source, rule.regexp.flags).test(asText(value))
        ? null
        : rule.message;

    case "matchesField":
      return value === values[rule.field] ? null : rule.message;

    case "jsonObject": {
      try {
        const parsed: unknown = JSON.parse(asText(value));
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return null;
      } catch {
        // El texto del error identifica el campo sin revelar datos ingresados.
      }
      return `${rule.label}: ingresa un objeto JSON válido.`;
    }

    case "dateOrder": {
      const start = asText(values[rule.startField]);
      if (!start) return null;
      return asText(value) >= start
        ? null
        : `${rule.label} debe ser igual o posterior a ${rule.startLabel.toLocaleLowerCase("es-PE")}.`;
    }

    case "file": {
      if (!(value instanceof File)) return null;
      if (value.size === 0) return "El archivo está vacío. Selecciona un archivo con contenido.";
      const extension = fileExtension(value.name);
      if (!rule.accept.includes(extension)) {
        const readable = rule.accept
          .map((item) => item.replace(".", "").toUpperCase())
          .join(" o ");
        return `El archivo debe ser un ${readable} válido.`;
      }
      if (value.size > rule.maxBytes) {
        return `El archivo supera el máximo de ${formatFileSize(rule.maxBytes)}.`;
      }
      return null;
    }

    default:
      return null;
  }
}

/** Primer error de un campo. Se detiene en el primero para no apilar mensajes. */
export function validateField(
  rules: FieldRule[] | undefined,
  value: FieldValue,
  values: Record<string, FieldValue> = {},
): string | null {
  if (!rules) return null;
  for (const rule of rules) {
    const error = checkRule(rule, value, values);
    if (error) return error;
  }
  return null;
}

export function validateValues(
  rules: FieldRules,
  values: Record<string, FieldValue>,
): FieldErrors {
  const errors: FieldErrors = {};
  for (const [name, fieldRules] of Object.entries(rules)) {
    const error = validateField(fieldRules, values[name], values);
    if (error) errors[name] = error;
  }
  return errors;
}

/** Los `File` vacíos que envía un input de archivo sin selección se descartan. */
export function valuesFromFormData(
  formData: FormData,
): Record<string, FieldValue> {
  const values: Record<string, FieldValue> = {};
  for (const [name, value] of formData.entries()) {
    values[name] = value instanceof File && value.size === 0 && !value.name
      ? null
      : (value as FieldValue);
  }
  return values;
}

export function validateFormData(
  rules: FieldRules,
  formData: FormData,
): FieldErrors {
  const values = valuesFromFormData(formData);
  const errors = validateValues(rules, values);
  for (const [name, fieldRules] of Object.entries(rules)) {
    if (!fieldRules.some((rule) => rule.kind === "file")) continue;
    for (const file of formData.getAll(name)) {
      const error = validateField(fieldRules, file, values);
      if (error) {
        errors[name] = error;
        break;
      }
    }
  }
  return errors;
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}
