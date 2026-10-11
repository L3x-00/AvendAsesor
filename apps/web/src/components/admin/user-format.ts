const accessDateTimeFormatter = new Intl.DateTimeFormat("es-PE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Lima",
});

const accessDayFormatter = new Intl.DateTimeFormat("es-PE", {
  dateStyle: "medium",
  timeZone: "America/Lima",
});

/** Fecha y hora del último acceso en hora de Lima. */
export function formatAccess(value: string | null): string {
  if (!value) return "Sin acceso registrado";
  return accessDateTimeFormatter.format(new Date(value));
}

/** Día (sin hora) en Lima; `emptyLabel` explica el dato ausente. */
export function formatDay(value: string | null, emptyLabel: string): string {
  if (!value) return emptyLabel;
  return accessDayFormatter.format(new Date(value));
}

/** Iniciales para el avatar de la tabla (máximo dos palabras). */
export function userInitials(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("es-PE") ?? "")
    .join("");
}
