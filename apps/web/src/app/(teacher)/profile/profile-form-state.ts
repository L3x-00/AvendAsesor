import type { FieldErrors, FieldRules } from "@/lib/ui/field-validation";

/**
 * Estado y reglas que comparten el formulario de Mi perfil (navegador) y sus
 * acciones de servidor, para que el mensaje sea el mismo venga de donde venga.
 * Viven fuera de `actions.ts` porque un archivo "use server" solo debe
 * exportar funciones asíncronas.
 */
export interface ProfileActionState {
  fieldErrors?: FieldErrors;
  message?: string;
  status: "error" | "idle" | "success";
}

export const initialProfileActionState: ProfileActionState = { status: "idle" };

/**
 * Mismos límites que `public.update_own_profile` y las restricciones de
 * `profiles`. El celular usa la regla del alta administrativa (solo dígitos),
 * para que el panel no reciba un valor que su propio formulario rechazaría.
 */
export const CONTACT_DATA_RULES: FieldRules = {
  city: [
    { kind: "minLength", label: "La ciudad", min: 2 },
    { kind: "maxLength", label: "La ciudad", max: 120 },
  ],
  department: [
    { kind: "minLength", label: "El departamento", min: 2 },
    { kind: "maxLength", label: "El departamento", max: 120 },
  ],
  phone: [
    { kind: "phone", label: "El celular", optional: true },
    { kind: "maxLength", label: "El celular", max: 20 },
  ],
};

/** Docentes: además de los datos de contacto, pueden corregir su nombre. */
export const PERSONAL_DATA_RULES: FieldRules = {
  ...CONTACT_DATA_RULES,
  fullName: [
    { kind: "required", label: "El nombre completo" },
    { kind: "minLength", label: "El nombre completo", min: 2 },
    { kind: "maxLength", label: "El nombre completo", max: 160 },
  ],
};

export const EMAIL_CHANGE_RULES: FieldRules = {
  email: [
    { kind: "required", label: "El correo nuevo" },
    { kind: "email", label: "El correo nuevo" },
    { kind: "maxLength", label: "El correo nuevo", max: 254 },
  ],
};

/** Departamentos del Perú (y la Provincia Constitucional del Callao). */
export const PERU_DEPARTMENTS = [
  "Amazonas",
  "Áncash",
  "Apurímac",
  "Arequipa",
  "Ayacucho",
  "Cajamarca",
  "Callao",
  "Cusco",
  "Huancavelica",
  "Huánuco",
  "Ica",
  "Junín",
  "La Libertad",
  "Lambayeque",
  "Lima",
  "Loreto",
  "Madre de Dios",
  "Moquegua",
  "Pasco",
  "Piura",
  "Puno",
  "San Martín",
  "Tacna",
  "Tumbes",
  "Ucayali",
] as const;

/**
 * Opciones del selector. Un valor guardado antes de existir la lista (texto
 * libre) se conserva como primera opción para no borrarlo al guardar.
 */
export function departmentOptions(current: string | null): readonly string[] {
  if (!current || (PERU_DEPARTMENTS as readonly string[]).includes(current)) {
    return PERU_DEPARTMENTS;
  }
  return [current, ...PERU_DEPARTMENTS];
}
