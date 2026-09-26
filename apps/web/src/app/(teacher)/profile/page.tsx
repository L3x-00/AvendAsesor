import Link from "next/link";
import { AccountBadge } from "@/components/teacher/account-badge";
import { formatUserRole } from "@/lib/admin-api/labels";
import { resolveAuthorizedChatContext } from "@/lib/chat-api/authorized-client";

const SHORTCUTS = [
  {
    description: "Empieza una consulta desde cero.",
    href: "/chat",
    label: "Nueva consulta",
  },
  {
    description: "Retoma una conversación anterior.",
    href: "/history",
    label: "Mi historial",
  },
  {
    description: "Repasa cómo sacarle provecho al asistente.",
    href: "/guide",
    label: "Guía de uso",
  },
] as const;

export default async function ProfilePage() {
  // El marco lo aporta el layout del grupo. Esta ruta revalida su acceso y,
  // de paso, obtiene el nombre y el rol que muestra sin pedir nada más al API.
  const { fullName, role } = await resolveAuthorizedChatContext();

  return (
    <section aria-labelledby="profile-title" className="avend-content-page">
      <header className="avend-content-header">
        <p className="avend-eyebrow">Cuenta protegida</p>
        <h1 id="profile-title">Mi perfil</h1>
        <p>
          Aquí ves con qué cuenta estás trabajando y a qué funciones tienes
          acceso.
        </p>
      </header>

      <div className="avend-profile-card">
        <AccountBadge fullName={fullName} role={role} size="large" />
        <dl className="avend-profile-facts">
          <div>
            <dt>Rol de acceso</dt>
            <dd>{formatUserRole(role)}</dd>
          </div>
          <div>
            <dt>Estado de la cuenta</dt>
            <dd>
              <span aria-hidden="true" className="avend-status-dot" />
              Activa
            </dd>
          </div>
        </dl>
      </div>

      <h2 className="avend-profile-subtitle">Accesos rápidos</h2>
      <ul className="avend-profile-shortcuts">
        {SHORTCUTS.map((shortcut) => (
          <li key={shortcut.href}>
            <Link href={shortcut.href}>
              <strong>{shortcut.label}</strong>
              <span>{shortcut.description}</span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="avend-content-note">
        La actualización de información personal estará disponible cuando sea
        habilitada por la administración.
      </p>
    </section>
  );
}
