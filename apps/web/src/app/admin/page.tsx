import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { AdminCurrentTime } from "@/components/admin/admin-current-time";
import { AdminPage } from "@/components/admin/admin-page";
import { createAuthorizedAdminApiContext } from "@/lib/admin-api/authorized-client";

export default async function AdminHomePage() {
  const { client } = await createAuthorizedAdminApiContext();
  const dashboard = await client.getHomeDashboard();
  const initialNow = new Date().toISOString();

  return (
    <AdminPage
      description="Resumen general del sistema y accesos principales."
      eyebrow={null}
      headerAside={<AdminCurrentTime initialNow={initialNow} />}
      title="PANEL DE ADMINISTRACIÓN AVEND ASESOR"
      welcome="¡Bienvenido de nuevo, Administrador!"
    >
      <AdminDashboard dashboard={dashboard} />
    </AdminPage>
  );
}
