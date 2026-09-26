import { formatUserRole } from "@/lib/admin-api/labels";

type TeacherRole = "docente" | "admin" | "superadmin";

/** Iniciales de hasta dos palabras ("María Pérez" → "MP"). */
export function initialsOf(fullName: string | null | undefined): string {
  const words = (fullName ?? "").trim().split(/\s+/u).filter(Boolean);
  const initials = words
    .slice(0, 2)
    .map((word) => word.charAt(0).toLocaleUpperCase("es"))
    .join("");
  return initials || "?";
}

interface AccountBadgeProps {
  fullName?: string | null;
  role?: TeacherRole;
  size?: "compact" | "large";
}

/**
 * Identidad visible de la cuenta: iniciales, nombre y rol en lenguaje llano.
 * Ayuda a confirmar con qué cuenta se está trabajando (computadoras
 * compartidas en la institución).
 */
export function AccountBadge({
  fullName,
  role,
  size = "compact",
}: AccountBadgeProps) {
  const name = fullName?.trim() || "Tu cuenta";

  return (
    <div className={`avend-account-badge avend-account-badge--${size}`}>
      <span aria-hidden="true" className="avend-account-avatar">
        {initialsOf(fullName)}
      </span>
      <span className="avend-account-text">
        <span className="avend-account-name">{name}</span>
        {role ? (
          <span className="avend-account-role">{formatUserRole(role)}</span>
        ) : null}
      </span>
    </div>
  );
}
