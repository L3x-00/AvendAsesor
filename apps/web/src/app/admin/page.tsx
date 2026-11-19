import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { AdminCurrentTime } from "@/components/admin/admin-current-time";
import styles from "@/components/admin/admin-dashboard.module.css";
import { createAuthorizedAdminApiContext } from "@/lib/admin-api/authorized-client";

export default async function AdminHomePage() {
  const { client } = await createAuthorizedAdminApiContext();
  const dashboard = await client.getHomeDashboard();
  const initialNow = new Date().toISOString();

  return (
    <div className={styles.home}>
      <header className={styles.homeHeader}>
        <div className={styles.homeIntro}>
          <p className={styles.homeEyebrow}>Panel de administración</p>
          <h1>Bienvenido, Administrador</h1>
          <p>Resumen general del sistema y accesos principales.</p>
        </div>
        <div aria-hidden="true" className={styles.homeArt} />
        <AdminCurrentTime initialNow={initialNow} />
      </header>
      <AdminDashboard dashboard={dashboard} />
    </div>
  );
}
