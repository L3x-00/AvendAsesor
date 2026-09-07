import type { ReactNode } from "react";
import { AdminShellFrame } from "@/components/admin/admin-shell";
import { createAuthorizedAdminApiContext } from "@/lib/admin-api/authorized-client";

/**
 * Marco compartido del panel administrativo. Al vivir aquí, la barra lateral se
 * monta una sola vez: cambiar de sección solo sustituye el contenido.
 *
 * La autorización NO se delega a este layout. Un layout no vuelve a ejecutarse
 * al navegar entre sus hijos, así que cada página conserva su propia
 * comprobación, incluidas las que exigen SUPERADMIN o permiso de módulos. Lo
 * que se resuelve aquí es únicamente lo que la barra lateral necesita para
 * decidir qué enlaces mostrar; dentro de una misma petición esa resolución se
 * comparte con la de la página (ver `resolveAuthorizedAdminApiSession`).
 */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { access } = await createAuthorizedAdminApiContext();

  return (
    <AdminShellFrame
      modulesAccess={access.modulesAccess}
      userName={access.fullName}
      userRole={access.role}
    >
      {children}
    </AdminShellFrame>
  );
}
