import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { AdminCurrentTime } from "@/components/admin/admin-current-time";
import { AdminShell } from "@/components/admin/admin-shell";
import { createAuthorizedAdminApiContext } from "@/lib/admin-api/authorized-client";

export default async function AdminPage() {
  const { access, client } = await createAuthorizedAdminApiContext();
  const dashboard = await client.getHomeDashboard();
  const initialNow = new Date().toISOString();

  return (
    <AdminShell
      activeSection="home"
      description="Resumen general del sistema y accesos principales."
      eyebrow={null}
      headerAside={<AdminCurrentTime initialNow={initialNow} />}
      title="PANEL DE ADMINISTRACIÓN AVEND ASESOR"
      userName={access.fullName}
      userRole={access.role}
      welcome="¡Bienvenido de nuevo, Administrador!"
    >
      <AdminDashboard dashboard={dashboard} />
    </AdminShell>
  );
}
