import { ChatHistoryList } from "@/components/chat/chat-history-list";
import { resolveAuthorizedChatContext } from "@/lib/chat-api/authorized-client";

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
  // su propio acceso y pide solo lo suyo.
  const { client } = await resolveAuthorizedChatContext();
  const conversationPage = await client.listConversations({ cursor });

  return (
    <section aria-labelledby="history-title" className="avend-content-page">
      <header className="avend-content-header">
        <p className="avend-eyebrow">Tu actividad</p>
        <h1 id="history-title">Historial de consultas</h1>
        <p>
          Retoma una conversación o retírala de tu propio historial cuando ya no
          la necesites.
        </p>
      </header>
      <ChatHistoryList
        conversations={conversationPage.items}
        nextCursor={conversationPage.nextCursor}
        now={requestTime()}
      />
    </section>
  );
}
