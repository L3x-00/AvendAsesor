import { notFound } from "next/navigation";
import { ChatPanel } from "@/components/chat/chat-panel";
import { createAuthorizedChatApiClient } from "@/lib/chat-api/authorized-client";
import { ChatApiError } from "@/lib/chat-api/client";
import type { ChatConversationDetail, ChatModule } from "@/lib/chat-api/types";

interface ConversationPageProps {
  params: Promise<{ conversationId: string }>;
}

export default async function ConversationPage({
  params,
}: ConversationPageProps) {
  const { conversationId } = await params;
  const client = await createAuthorizedChatApiClient();
  let conversation: ChatConversationDetail;
  let modules: ChatModule[];

  try {
    [conversation, modules] = await Promise.all([
      client.getConversation(conversationId),
      client.listModules(),
    ]);
  } catch (error) {
    if (error instanceof ChatApiError && error.status === 404) notFound();
    throw error;
  }

  return <ChatPanel initialConversation={conversation} modules={modules} />;
}
