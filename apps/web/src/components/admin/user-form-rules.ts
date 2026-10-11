import type { FieldRules } from "@/lib/ui/field-validation";

/**
 * Reglas compartidas por los formularios de Usuarios (altas, edición de
 * acceso y vigencia). La fecha de fin se compara con la de inicio para que el
 * error salga en el campo que hay que corregir, no en un aviso general.
 */
export const ACCESS_WINDOW_RULES: FieldRules = {
  accessExpiresAt: [
    {
      kind: "dateOrder",
      label: "La fecha de fin",
      startField: "accessStartAt",
      startLabel: "la fecha de inicio",
    },
  ],
};

export const USER_EDIT_RULES: FieldRules = {
  reason: [
    { kind: "required", label: "El motivo" },
    { kind: "minLength", label: "El motivo", min: 4 },
  ],
};

export const CREATE_USER_RULES: FieldRules = {
  ...ACCESS_WINDOW_RULES,
  email: [
    { kind: "required", label: "El correo electrónico" },
    { kind: "email", label: "El correo electrónico" },
  ],
  fullName: [
    { kind: "required", label: "El nombre y apellidos" },
    { kind: "minLength", label: "El nombre y apellidos", min: 2 },
    { kind: "maxLength", label: "El nombre y apellidos", max: 160 },
  ],
  phone: [{ kind: "phone", label: "El celular" }],
};
