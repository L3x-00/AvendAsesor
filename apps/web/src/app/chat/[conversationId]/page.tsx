import { notFound } from "next/navigation";
import { ChatPanel } from "@/components/chat/chat-panel";
import { resolveAuthorizedChatContext } from "@/lib/chat-api/authorized-client";
import { ChatApiError } from "@/lib/chat-api/client";
import type {
  ChatConversationDetail,
  ChatModule,
  ChatUpdate,
} from "@/lib/chat-api/types";

interface ConversationPageProps {
  params: Promise<{ conversationId: string }>;
}

/**
 * Aviso de información nueva, solo si la persona no volvió a preguntar
 * después de que se resolvió su consulta.
 */
function pendingUpdate(
  conversation: ChatConversationDetail,
  updates: ChatUpdate[],
): ChatUpdate | undefined {
  const update = updates.find(
    (item) => item.conversationId === conversation.conversation.id,
  );
  if (!update) return undefined;
  const askedAgain = conversation.messages.some(
    (message) =>
      message.role === "user" &&
      Date.parse(message.createdAt) > Date.parse(update.resolvedAt),
  );
  return askedAgain ? undefined : update;
}

export default async function ConversationPage({
  params,
}: ConversationPageProps) {
  const { conversationId } = await params;
  const { client, fullName, role } = await resolveAuthorizedChatContext();
  let conversation: ChatConversationDetail;
  let modules: ChatModule[];
  let updates: ChatUpdate[];

  try {
    [conversation, modules, updates] = await Promise.all([
      client.getConversation(conversationId),
      client.listModules(),
      client.listUpdates(),
    ]);
  } catch (error) {
    if (error instanceof ChatApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <ChatPanel
      initialConversation={conversation}
      fullName={fullName}
      modules={modules}
      resolvedUpdate={pendingUpdate(conversation, updates)}
      role={role}
    />
  );
}
