"use server";

import { revalidatePath } from "next/cache";
import { createAuthorizedChatApiClient } from "@/lib/chat-api/authorized-client";
import { ChatApiError } from "@/lib/chat-api/client";

export interface HistoryActionState {
  message: string | null;
  status: "error" | "idle" | "success";
}

export const initialHistoryActionState: HistoryActionState = {
  message: null,
  status: "idle",
};

export async function deleteConversationAction(
  _previousState: HistoryActionState,
  formData: FormData,
): Promise<HistoryActionState> {
  const conversationId = formData.get("conversationId");

  if (typeof conversationId !== "string" || !conversationId) {
    return {
      message: "La conversación ya no está disponible.",
      status: "error",
    };
  }

  try {
    const client = await createAuthorizedChatApiClient();
    await client.deleteConversation(conversationId);
    revalidatePath("/history");
    return {
      message: "La conversación fue retirada de tu historial.",
      status: "success",
    };
  } catch (error) {
    if (error instanceof ChatApiError && error.status === 404) {
      return {
        message: "La conversación ya no está disponible. Actualiza la página.",
        status: "error",
      };
    }

    if (error instanceof ChatApiError && error.status === 403) {
      return {
        message: "No tienes permiso para modificar esta conversación.",
        status: "error",
      };
    }

    return {
      message: "No fue posible actualizar tu historial. Inténtalo nuevamente.",
      status: "error",
    };
  }
}
