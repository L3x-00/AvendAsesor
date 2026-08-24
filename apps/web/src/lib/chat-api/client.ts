import "server-only";
import { ZodError, type ZodType } from "zod";
import { getAdminApiUrl } from "@/lib/admin-api/config";
import {
  chatConversationDetailSchema,
  chatConversationPageSchema,
  chatModuleSchema,
  type ChatConversationPage,
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

  async deleteConversation(conversationId: string): Promise<void> {
    await this.send(`/chat/conversations/${conversationId}`, undefined, {
      method: "DELETE",
    });
  }

  listConversations(
    input: { cursor?: string } = {},
  ): Promise<ChatConversationPage> {
    const query = input.cursor
      ? `?${new URLSearchParams({ cursor: input.cursor }).toString()}`
      : "";
    return this.send(`/chat/conversations${query}`, chatConversationPageSchema);
  }

  listModules(): Promise<ChatModule[]> {
    return this.send("/chat/modules", chatModuleSchema.array());
  }

  private async send<T>(
    path: string,
    schema?: ZodType<T>,
    options: { method?: "DELETE" | "GET" } = {},
  ): Promise<T> {
    const response = await this.request(`${this.baseUrl}${path}`, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.accessToken}`,
      },
      method: options.method ?? "GET",
    });

    if (!response.ok) throw new ChatApiError(response.status);

    if (!schema) return undefined as T;

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
