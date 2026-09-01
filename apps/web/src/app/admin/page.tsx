import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { AdminShell } from "@/components/admin/admin-shell";
import { createAuthorizedAdminApiContext } from "@/lib/admin-api/authorized-client";

export default async function AdminPage() {
  const { access, client } = await createAuthorizedAdminApiContext();
  const metrics = await client.getOperationalMetrics();

  return (
    <AdminShell
      activeSection="home"
      description="Consulta el estado operativo y accede a las herramientas autorizadas para tu rol. Cada cambio se vuelve a validar en la API."
      title="Inicio"
      userName={access.fullName}
      userRole={access.role}
    >
      <AdminDashboard metrics={metrics} role={access.role} />
    </AdminShell>
  );
}
