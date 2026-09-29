import Link from "next/link";
import { AccountBadge } from "@/components/teacher/account-badge";
import { ProfileForms } from "@/components/teacher/profile-forms";
import { formatUserRole } from "@/lib/admin-api/labels";
import { resolveAuthorizedChatContext } from "@/lib/chat-api/authorized-client";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const SHORTCUTS = [
  {
    description: "Empieza una consulta desde cero.",
    href: "/chat",
    icon: "chat",
    label: "Nueva consulta",
  },
  {
    description: "Retoma una conversación anterior.",
    href: "/history",
    icon: "history",
    label: "Mi historial",
  },
  {
    description: "Repasa cómo sacarle provecho al asistente.",
    href: "/guide",
    icon: "guide",
    label: "Guía de uso",
  },
] as const;

function ProfileShortcutIcon({ icon }: { icon: (typeof SHORTCUTS)[number]["icon"] }) {
  return (
    <span aria-hidden="true" className="avend-profile-shortcut-icon">
      <svg fill="none" viewBox="0 0 24 24">
        {icon === "chat" ? <path d="M5 18.5 3.5 21l3.1-1.1A8.5 8.5 0 1 0 5 18.5Z" /> : null}
        {icon === "history" ? (
          <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.5 2" /></>
        ) : null}
        {icon === "guide" ? (
          <><path d="M5.5 4.5A2.5 2.5 0 0 1 8 2h9.5v17H8a2.5 2.5 0 0 0-2.5 2.5" /><path d="M5.5 4.5v17M9 6h5M9 10h5" /></>
        ) : null}
      </svg>
    </span>
  );
}

export default async function ProfilePage() {
  // El marco lo aporta el layout del grupo. Esta ruta revalida su acceso y,
  // de paso, obtiene el nombre y el rol que muestra sin pedir nada más al API.
  const { fullName, role } = await resolveAuthorizedChatContext();
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("phone, department, city")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };

  return (
    <section aria-labelledby="profile-title" className="avend-content-page">
      <header className="avend-content-header avend-profile-header">
        <div>
          <p className="avend-eyebrow">Cuenta protegida</p>
          <h1 id="profile-title">Mi perfil</h1>
          <p>Administra tus datos y accede rápidamente a tus herramientas.</p>
        </div>
        <form action="/auth/sign-out" method="post">
          <button className="avend-button avend-button--secondary avend-profile-sign-out" type="submit">
            Cerrar sesión
          </button>
        </form>
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

      <ProfileForms
        city={typeof profile?.city === "string" ? profile.city : null}
        department={typeof profile?.department === "string" ? profile.department : null}
        email={user?.email ?? ""}
        fullName={fullName}
        phone={typeof profile?.phone === "string" ? profile.phone : null}
      />

      <h2 className="avend-profile-subtitle">Accesos rápidos</h2>
      <ul className="avend-profile-shortcuts">
        {SHORTCUTS.map((shortcut) => (
          <li key={shortcut.href}>
            <Link href={shortcut.href}>
              <ProfileShortcutIcon icon={shortcut.icon} />
              <span className="avend-profile-shortcut-copy">
                <strong>{shortcut.label}</strong>
                <span>{shortcut.description}</span>
              </span>
              <span aria-hidden="true" className="avend-profile-shortcut-arrow">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
