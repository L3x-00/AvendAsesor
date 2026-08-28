import { notFound } from "next/navigation";
import { OrientationPreview } from "@/components/orientation/orientation-preview";
import { TeacherShell } from "@/components/teacher/teacher-shell";
import { resolveAuthorizedChatContext } from "@/lib/chat-api/authorized-client";
import { ChatApiError } from "@/lib/chat-api/client";
import type { ChatConversationDetail, ChatModule } from "@/lib/chat-api/types";
import {
  orientationRouteParamsSchema,
  resolveOrientationContext,
} from "@/lib/orientation-document/model";

interface OrientationPageProps {
  params: Promise<{ conversationId: string; messageId: string }>;
}

export default async function OrientationPage({
  params,
}: OrientationPageProps) {
  const { client, fullName, role } = await resolveAuthorizedChatContext();
  const parsedParams = orientationRouteParamsSchema.safeParse(await params);
  if (!parsedParams.success) notFound();

  const { conversationId, messageId } = parsedParams.data;
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

  const context = resolveOrientationContext(
    conversation,
    conversationId,
    messageId,
  );
  if (!context) notFound();

  return (
    <TeacherShell activeSection="chat" modules={modules} role={role}>
      <OrientationPreview context={context} initialTeacherName={fullName} />
    </TeacherShell>
  );
}
