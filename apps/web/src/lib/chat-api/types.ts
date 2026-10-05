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
  articleReference: z.string().max(500).nullable(),
  documentSituation: z.enum(["current", "replaced", "archived"]),
  documentTitle: z.string().min(1).max(500),
  documentType: z.string().max(64).nullish(),
  id: z.string().uuid(),
  issuanceYear: z.number().int().nullable().optional(),
  moduleName: z.string().max(255).nullable(),
  numeralReference: z.string().max(255).nullable(),
  pageEnd: z.number().int().min(1).max(300),
  pageStart: z.number().int().min(1).max(300),
  /** Total de páginas físicas del archivo; ausente en conversaciones antiguas. */
  pdfPageCount: z.number().int().min(1).max(300).optional(),
  rank: z.number().int().min(1).max(20),
  relevanceScore: z.number().min(0).max(1),
  relatedModuleName: z.string().max(255).nullable().optional(),
  relatedSubmoduleName: z.string().max(255).nullable().optional(),
  resolutionNumber: z.string().max(255).nullish(),
  sectionTitle: z.string().max(500).nullable(),
  versionNumber: z.number().int().positive(),
});
export type ChatSource = z.infer<typeof chatSourceSchema>;

const absoluteHttpUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "https:" || protocol === "http:";
  }, "Expected an absolute HTTP(S) URL.");

export const chatSourceDownloadSchema = z
  .object({
    expiresAt: timestampSchema,
    sourceId: z.string().uuid(),
    url: absoluteHttpUrlSchema,
  })
  .strict();
export type ChatSourceDownload = z.infer<typeof chatSourceDownloadSchema>;

export const chatConversationSchema = z.object({
  createdAt: timestampSchema,
  id: z.string().uuid(),
  /** Última pregunta; el título conserva la primera. */
  lastQuestion: z.string().max(8_000).nullable().optional(),
  selectedModuleId: z.string().uuid().nullable(),
  /** Snapshot del tema elegido (ausente en respuestas anteriores). */
  selectedModuleName: z.string().max(255).nullable().optional(),
  selectedModuleParentId: z.string().uuid().nullable().optional(),
  selectedModuleParentName: z.string().max(255).nullable().optional(),
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
  inReplyToMessageId: z.string().uuid().nullable(),
  role: z.enum(["user", "assistant", "clarification", "no_evidence"]),
  sources: z.array(chatSourceSchema).max(10),
});
export type ChatHistoryMessage = z.infer<typeof chatHistoryMessageSchema>;

export const chatConversationDetailSchema = z.object({
  conversation: chatConversationSchema,
  messages: z.array(chatHistoryMessageSchema).max(100),
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

/**
 * Módulo candidato de una aclaración. La API solo envía `{ id, name }`; exigir el
 * `ChatModule` completo hacía que TODA aclaración se descartara como «formato no
 * válido» (Hito 3, punto 5).
 */
export const clarificationModuleSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
});
export type ClarificationModule = z.infer<typeof clarificationModuleSchema>;

export const chatStreamPayloadSchemas = {
  clarification: z.object({
    message: z.string().min(1),
    modules: z.array(clarificationModuleSchema).max(10),
  }),
  conversation: z.object({
    conversationId: z.string().uuid(),
    moduleId: z.string().uuid().nullable().optional(),
    startedNewConversation: z.boolean().optional(),
    userMessageId: z.string().uuid(),
  }),
  conversational: z.object({
    message: z.string().min(1).max(20_000),
    startsNewTopic: z.boolean().optional(),
    /** Preguntas recomendadas de la respuesta de catálogo. */
    suggestions: z.array(z.string().min(1).max(200)).max(8).optional(),
  }),
  done: z.object({
    conversationId: z.string().uuid(),
    inReplyToMessageId: z.string().uuid(),
    messageId: z.string().uuid(),
    provider: z.enum(["openai", "rule"]),
  }),
  error: z.object({ code: z.string().min(1).max(100) }),
  no_evidence: z.object({ message: z.string().min(1) }),
  sources: z.object({ sources: z.array(chatSourceSchema).max(10) }),
  token: z.object({ text: z.string().min(1).max(20_000) }),
};

/** Panorama del tema abierto en el chat: documentos con un resumen corto. */
export const moduleOverviewSchema = z.object({
  documents: z
    .array(
      z.object({
        documentType: z.string().max(64),
        id: z.string().uuid(),
        issuanceYear: z.number().int().nullable(),
        resolutionNumber: z.string().max(255).nullable(),
        summary: z.string().max(1_000).nullable(),
        title: z.string().min(1).max(1_000),
      }),
    )
    .max(20),
  moduleId: z.string().uuid(),
  moduleName: z.string().min(1).max(255),
  scope: z.enum(["empty", "module", "parent"]),
  scopeName: z.string().min(1).max(255),
  total: z.number().int().nonnegative(),
});
export type ModuleOverview = z.infer<typeof moduleOverviewSchema>;

/** Consulta propia sin sustento que la administración ya resolvió. */
export const chatUpdateSchema = z.object({
  conversationId: z.string().uuid(),
  question: z.string().min(1).max(8_000).nullable(),
  resolvedAt: timestampSchema,
});
export type ChatUpdate = z.infer<typeof chatUpdateSchema>;
