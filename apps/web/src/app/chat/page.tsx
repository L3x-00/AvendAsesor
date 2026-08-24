import { ChatPanel } from "@/components/chat/chat-panel";
import { createAuthorizedChatApiClient } from "@/lib/chat-api/authorized-client";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ module?: string | string[] }>;
}) {
  const client = await createAuthorizedChatApiClient();
  const modules = await client.listModules();
  const { module } = await searchParams;
  const initialModuleId = typeof module === "string" ? module : undefined;

  return <ChatPanel initialModuleId={initialModuleId} modules={modules} />;
}
