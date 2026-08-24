import { ChatPanel } from "@/components/chat/chat-panel";
import { createAuthorizedChatApiClient } from "@/lib/chat-api/authorized-client";

export default async function ChatPage() {
  const client = await createAuthorizedChatApiClient();
  const modules = await client.listModules();

  return <ChatPanel modules={modules} />;
}
