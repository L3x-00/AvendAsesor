import { ChatHistoryList } from "@/components/chat/chat-history-list";
import { TeacherShell } from "@/components/teacher/teacher-shell";
import { resolveAuthorizedChatContext } from "@/lib/chat-api/authorized-client";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string | string[] }>;
}) {
  const params = await searchParams;
  const cursor = typeof params.cursor === "string" ? params.cursor : undefined;
  const { client, role } = await resolveAuthorizedChatContext();
  const [conversationPage, modules] = await Promise.all([
    client.listConversations({ cursor }),
    client.listModules(),
  ]);

  return (
    <TeacherShell activeSection="history" modules={modules} role={role}>
      <section aria-labelledby="history-title" className="avend-content-page">
        <header className="avend-content-header">
          <p className="avend-eyebrow">Tu actividad</p>
          <h1 id="history-title">Historial de consultas</h1>
          <p>
            Retoma una conversación o retírala de tu propio historial cuando ya
            no la necesites.
          </p>
        </header>
        <ChatHistoryList
          conversations={conversationPage.items}
          nextCursor={conversationPage.nextCursor}
        />
      </section>
    </TeacherShell>
  );
}
