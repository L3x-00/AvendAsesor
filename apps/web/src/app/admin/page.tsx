import Link from "next/link";
import { AdminShell } from "@/components/admin/admin-shell";
import { createAuthorizedAdminApiContext } from "@/lib/admin-api/authorized-client";
import { formatUserRole } from "@/lib/admin-api/labels";

export default async function AdminPage() {
  const { access, client } = await createAuthorizedAdminApiContext();
  const metrics = await client.getOperationalMetrics();

  return (
    <AdminShell
      activeSection="home"
      description="Consulta el estado operativo y accede a las herramientas autorizadas para tu rol. Cada cambio se vuelve a validar en la API."
      title="Panel administrativo"
      userName={access.fullName}
      userRole={access.role}
    >
      <section
        aria-labelledby="admin-entry-title"
        className="avend-admin-dashboard"
      >
        <p className="avend-eyebrow">Área protegida</p>
        <h2 id="admin-entry-title">Resumen operativo</h2>
        <p className="avend-admin-entry-role">
          Rol de acceso: <strong>{formatUserRole(access.role)}</strong>
        </p>
        <dl className="avend-operation-metrics">
          <div>
            <dt>Usuarios registrados</dt>
            <dd>{metrics.totalUsers}</dd>
          </div>
          <div>
            <dt>Módulos activos</dt>
            <dd>{metrics.activeModules}</dd>
          </div>
          <div>
            <dt>Documentos activos</dt>
            <dd>{metrics.activeDocuments}</dd>
          </div>
          <div>
            <dt>Consultas pendientes</dt>
            <dd>{metrics.pendingUnansweredQuestions}</dd>
          </div>
        </dl>
        <p className="avend-admin-entry-description">
          El costo del proveedor IA no está configurado y no se muestra como
          indicador operativo.
        </p>
        <nav
          aria-label="Operaciones administrativas"
          className="avend-admin-entry-nav"
        >
          <Link className="avend-admin-entry-link" href="/admin/operations">
            Revisar consultas y reportes
          </Link>
          <Link className="avend-admin-entry-link" href="/admin/modules">
            Gestionar módulos
          </Link>
          <Link className="avend-admin-entry-link" href="/admin/documents">
            Gestionar documentos PDF
          </Link>
          {access.role === "superadmin" ? (
            <Link className="avend-admin-entry-link" href="/admin/users">
              Usuarios y auditoría
            </Link>
          ) : null}
        </nav>
      </section>
    </AdminShell>
  );
}
