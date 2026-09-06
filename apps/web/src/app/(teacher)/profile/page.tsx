import { resolveAuthorizedChatContext } from "@/lib/chat-api/authorized-client";

export default async function ProfilePage() {
  // El marco lo aporta el layout del grupo. Esta ruta revalida su acceso y,
  // de paso, obtiene el rol que muestra abajo sin pedir nada más al API.
  const { role } = await resolveAuthorizedChatContext();

  return (
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
          <dd>{role}</dd>
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
  );
}
