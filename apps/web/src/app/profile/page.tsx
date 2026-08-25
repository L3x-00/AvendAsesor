import { redirect } from "next/navigation";
import { TeacherShell } from "@/components/teacher/teacher-shell";
import { resolveAuthorizedChatSession } from "@/lib/chat-api/authorized-client";
import { ChatApiClient } from "@/lib/chat-api/client";

export default async function ProfilePage() {
  const session = await resolveAuthorizedChatSession();

  if ("status" in session) {
    if (session.status === "unauthenticated") redirect("/auth/sign-in");
    redirect("/access-denied");
  }

  const modules = await new ChatApiClient(session.accessToken).listModules();

  return (
    <TeacherShell
      activeSection="profile"
      modules={modules}
      role={session.access.role}
    >
      <section aria-labelledby="profile-title" className="avend-content-page">
        <header className="avend-content-header">
          <p className="avend-eyebrow">Cuenta protegida</p>
          <h1 id="profile-title">Mi perfil</h1>
          <p>
            Tu cuenta tiene acceso activo a las funciones correspondientes a tu
            rol.
          </p>
        </header>
        <dl className="avend-profile-summary">
          <div>
            <dt>Rol de acceso</dt>
            <dd>{session.access.role}</dd>
          </div>
          <div>
            <dt>Estado de la cuenta</dt>
            <dd>Activa</dd>
          </div>
        </dl>
        <p className="avend-content-note">
          La actualización de información personal estará disponible cuando sea
          habilitada por la administración.
        </p>
      </section>
    </TeacherShell>
  );
}
