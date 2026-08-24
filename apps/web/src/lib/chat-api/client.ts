import "server-only";
import { ZodError, type ZodType } from "zod";
import { getAdminApiUrl } from "@/lib/admin-api/config";
import {
  chatConversationDetailSchema,
  chatConversationSchema,
  chatModuleSchema,
  type ChatConversation,
  type ChatConversationDetail,
  type ChatModule,
} from "./types";

export class ChatApiError extends Error {
  constructor(readonly status: number) {
    super("Chat API request failed.");
  }
}

export class ChatApiResponseError extends Error {
  constructor() {
    super("Chat API returned an invalid response.");
  }
}

export class ChatApiClient {
  constructor(
    private readonly accessToken: string,
    private readonly baseUrl = getAdminApiUrl(),
    private readonly request: typeof fetch = fetch,
  ) {}

  getConversation(conversationId: string): Promise<ChatConversationDetail> {
    return this.send(
      `/chat/conversations/${conversationId}`,
      chatConversationDetailSchema,
    );
  }

  listConversations(): Promise<ChatConversation[]> {
    return this.send("/chat/conversations", chatConversationSchema.array());
  }

  listModules(): Promise<ChatModule[]> {
    return this.send("/chat/modules", chatModuleSchema.array());
  }

  private async send<T>(path: string, schema: ZodType<T>): Promise<T> {
    const response = await this.request(`${this.baseUrl}${path}`, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) throw new ChatApiError(response.status);

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ChatApiResponseError();
    }

    try {
      return schema.parse(payload);
    } catch (error) {
      if (error instanceof ZodError) throw new ChatApiResponseError();
      throw error;
    }
  }
}
