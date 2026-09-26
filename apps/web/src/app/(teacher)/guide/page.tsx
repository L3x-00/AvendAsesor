import { GuideContent } from "@/components/teacher/guide-content";
import { resolveAuthorizedChatContext } from "@/lib/chat-api/authorized-client";

export default async function GuidePage() {
  // El marco lo aporta el layout del grupo. Aquí solo se revalida el acceso:
  // un layout no vuelve a ejecutarse al navegar entre sus hijos, así que la
  // autorización tiene que comprobarse en cada ruta.
  await resolveAuthorizedChatContext();

  return <GuideContent />;
}
