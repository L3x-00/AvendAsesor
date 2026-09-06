import type { ReactNode } from "react";
import { TeacherShell } from "@/components/teacher/teacher-shell";
import { resolveAuthorizedChatContext } from "@/lib/chat-api/authorized-client";

/**
 * Marco compartido de las secciones del docente.
 *
 * Antes cada página renderizaba su propio `TeacherShell` y pedía la lista de
 * módulos por su cuenta. Como eran rutas hermanas sin segmento común, cambiar
 * de sección desmontaba la pantalla entera —barra lateral incluida— y repetía
 * la llamada al API. Al vivir el marco en un layout, Next.js solo sustituye el
 * contenido: la barra lateral permanece montada y los módulos se piden una vez.
 *
 * La autorización NO se delega aquí. Un layout no se vuelve a ejecutar al
 * navegar entre sus hijos, así que cada página revalida su propio acceso.
 */
export default async function TeacherLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { client, role } = await resolveAuthorizedChatContext();
  const modules = await client.listModules();

  return (
    <TeacherShell modules={modules} role={role}>
      {children}
    </TeacherShell>
  );
}
