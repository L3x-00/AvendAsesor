import { unstable_rethrow } from "next/navigation";
import { ChatHistoryList } from "@/components/chat/chat-history-list";
import { resolveAuthorizedChatContext } from "@/lib/chat-api/authorized-client";
import type { ChatConversationPage } from "@/lib/chat-api/types";

/**
 * Instante de esta petición. Es a propósito un valor "impuro": el servidor lo
 * fija UNA vez y viaja al cliente como prop, así la hidratación usa el mismo.
 */
function requestTime(): number {
  return Date.now();
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string | string[] }>;
}) {
  const params = await searchParams;
  const cursor = typeof params.cursor === "string" ? params.cursor : undefined;
  // El marco y los módulos los aporta el layout del grupo; esta ruta revalida
  // su propio acceso y pide solo lo suyo. Una sesión caducada o un acceso
  // revocado redirigen desde aquí, fuera de cualquier captura.
  const { client } = await resolveAuthorizedChatContext();
  const [conversationPage, updates] = await Promise.all([
    // Una falla momentánea del API (arranque en frío, límite de peticiones,
    // 5xx) no debe llevar al límite de error de la sección: la lista muestra
    // un aviso en línea con «Actualizar» y, si ya tenía datos, los conserva.
    client
      .listConversations({ cursor })
      .catch((error: unknown): ChatConversationPage | null => {
        unstable_rethrow(error);
        return null;
      }),
    client.listUpdates(),
  ]);

  return (
    <section aria-labelledby="history-title" className="avend-content-page">
      <header className="avend-content-header">
        <p className="avend-eyebrow">Tu actividad</p>
        {/* tabIndex=-1: destino del foco al quitar la última consulta visible
            o al cerrar el aviso de confirmación. */}
        <h1 id="history-title" tabIndex={-1}>
          Historial de consultas
        </h1>
        <p>
          Retoma una conversación o retírala de tu propio historial cuando ya no
          la necesites.
        </p>
      </header>
      <ChatHistoryList
        conversations={conversationPage?.items ?? []}
        loadFailed={conversationPage === null}
        nextCursor={conversationPage?.nextCursor ?? null}
        now={requestTime()}
        updates={updates}
      />
    </section>
  );
}
