import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountBadge } from "@/components/teacher/account-badge";
import { ProfileForms } from "@/components/teacher/profile-forms";
import { formatUserRole } from "@/lib/admin-api/labels";
import { resolveSignInPath } from "@/lib/auth/session-redirect";
import { parseEmailChangeOutcome } from "@/lib/auth/site-url";
import { resolveAuthorizedChatContext } from "@/lib/chat-api/authorized-client";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EmailChangeNotice } from "./email-change-notice";
import { ProfileLoadError } from "./profile-load-error";
import { ProfileSignOutButton } from "./profile-sign-out-button";

/** Mismos rótulos que la barra lateral, para no nombrar dos veces lo mismo. */
const SHORTCUTS = [
  {
    description: "Empieza una consulta desde cero.",
    href: "/chat",
    icon: "chat",
    label: "Nuevo chat",
  },
  {
    description: "Retoma una conversación anterior.",
    href: "/history",
    icon: "history",
    label: "Historial",
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

interface ContactData {
  city: string | null;
  department: string | null;
  phone: string | null;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * Lee los datos de contacto del propio perfil. Devuelve null si la lectura
 * falla: la página no debe pintar el formulario vacío como si no existieran.
 */
async function readContactData(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
): Promise<ContactData | null> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("phone, department, city")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data || typeof data !== "object") return null;
    const row = data as Record<string, unknown>;
    return {
      city: optionalString(row.city),
      department: optionalString(row.department),
      phone: optionalString(row.phone),
    };
  } catch {
    return null;
  }
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  // El marco lo aporta el layout del grupo. Esta ruta revalida su acceso y,
  // de paso, obtiene el nombre y el rol que muestra sin pedir nada más al API.
  const { fullName, role } = await resolveAuthorizedChatContext();
  const params = (await searchParams) ?? {};
  const emailOutcome = parseEmailChangeOutcome(params.correo);

  const supabase = await createServerSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData?.user;
  if (userError || !user) redirect(await resolveSignInPath());

  const contact = await readContactData(supabase, user.id);
  const email = user.email ?? "";
  const pendingEmail =
    typeof user.new_email === "string" && user.new_email && user.new_email !== email
      ? user.new_email
      : null;

  return (
    <section aria-labelledby="profile-title" className="avend-content-page">
      <header className="avend-content-header avend-profile-header">
        <div className="avend-profile-header-copy">
          <p className="avend-eyebrow">Cuenta protegida</p>
          <h1 id="profile-title">Mi perfil</h1>
          <p className="avend-profile-lead">
            Administra tus datos y accede rápidamente a tus herramientas.
          </p>
        </div>
        <ProfileSignOutButton />
      </header>

      <EmailChangeNotice email={email} outcome={emailOutcome} />

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

      {contact ? (
        <ProfileForms
          city={contact.city}
          department={contact.department}
          email={email}
          fullName={fullName}
          pendingEmail={pendingEmail}
          phone={contact.phone}
          role={role}
        />
      ) : (
        <ProfileLoadError />
      )}

      <h2 className="avend-profile-subtitle">Accesos rápidos</h2>
      <ul className="avend-profile-shortcuts">
        {SHORTCUTS.map((shortcut) => (
          <li key={shortcut.href}>
            <Link href={shortcut.href}>
              <ProfileShortcutIcon icon={shortcut.icon} />
              <span className="avend-profile-shortcut-copy">
                <strong>{shortcut.label}</strong>
                <span className="avend-profile-shortcut-description">{shortcut.description}</span>
              </span>
              <span aria-hidden="true" className="avend-profile-shortcut-arrow">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
