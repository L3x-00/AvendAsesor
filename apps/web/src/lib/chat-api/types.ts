import { z } from "zod";

const timestampSchema = z
  .string()
  .refine(
    (value) => !Number.isNaN(Date.parse(value)),
    "Expected an ISO-compatible timestamp.",
  );

export const chatModuleSchema = z.object({
  code: z.string().min(1).max(64),
  description: z.string().max(2_000).nullish(),
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  parentModuleId: z.string().uuid().nullable(),
  sortOrder: z.number().int().nonnegative(),
});
export type ChatModule = z.infer<typeof chatModuleSchema>;

export const chatSourceSchema = z.object({
  articleReference: z.string().nullable(),
  documentTitle: z.string().min(1).max(500),
  moduleName: z.string().nullable(),
  numeralReference: z.string().nullable(),
  pageEnd: z.number().int().min(1).max(300),
  pageStart: z.number().int().min(1).max(300),
  rank: z.number().int().min(1).max(20),
  relevanceScore: z.number().min(0).max(1),
  sectionTitle: z.string().nullable(),
  versionNumber: z.number().int().positive(),
});
export type ChatSource = z.infer<typeof chatSourceSchema>;

export const chatConversationSchema = z.object({
  createdAt: timestampSchema,
  id: z.string().uuid(),
  selectedModuleId: z.string().uuid().nullable(),
  title: z.string().nullable(),
  updatedAt: timestampSchema,
});
export type ChatConversation = z.infer<typeof chatConversationSchema>;

export const chatConversationPageSchema = z.object({
  items: z.array(chatConversationSchema),
  nextCursor: z.string().min(1).max(256).nullable(),
});
export type ChatConversationPage = z.infer<typeof chatConversationPageSchema>;

export const chatHistoryMessageSchema = z.object({
  content: z.string().min(1).max(20_000),
  createdAt: timestampSchema,
  id: z.string().uuid(),
  role: z.enum(["user", "assistant", "clarification", "no_evidence"]),
  sources: z.array(chatSourceSchema),
});
export type ChatHistoryMessage = z.infer<typeof chatHistoryMessageSchema>;

export const chatConversationDetailSchema = z.object({
  conversation: chatConversationSchema,
  messages: z.array(chatHistoryMessageSchema),
});
export type ChatConversationDetail = z.infer<
  typeof chatConversationDetailSchema
>;

export const chatRequestSchema = z.object({
  conversationId: z.string().uuid().optional(),
  moduleId: z.string().uuid().optional(),
  question: z.string().trim().min(1).max(8_000),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const chatStreamPayloadSchemas = {
  clarification: z.object({
    message: z.string().min(1),
    modules: z.array(chatModuleSchema),
  }),
  conversation: z.object({ conversationId: z.string().uuid() }),
  done: z.object({
    conversationId: z.string().uuid(),
    messageId: z.string().uuid(),
    provider: z.enum(["openai", "rule"]),
  }),
  error: z.object({ code: z.string().min(1).max(100) }),
  no_evidence: z.object({ message: z.string().min(1) }),
  sources: z.object({ sources: z.array(chatSourceSchema).max(10) }),
  token: z.object({ text: z.string().min(1).max(20_000) }),
};
