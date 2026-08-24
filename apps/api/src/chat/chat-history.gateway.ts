export type ChatReplyRole = 'assistant' | 'clarification' | 'no_evidence';

export interface ActiveChatModule {
  code: string;
  id: string;
  name: string;
  parentModuleId: string | null;
  sortOrder: number;
}

export interface ChatCitationInput {
  chunkId: string;
  moduleId: string | null;
  relevanceScore: number;
}

export interface FaqMemoryObservationInput {
  questionFingerprint: string;
}

export interface ChatConversationSummary {
  createdAt: string;
  id: string;
  selectedModuleId: string | null;
  title: string | null;
  updatedAt: string;
}

export interface DeletedChatConversation {
  deletedAt: string;
  id: string;
}

export interface ChatTurnStart {
  conversationId: string;
  userMessageId: string;
}

export interface ChatTurnCompletion {
  answerMessageId: string;
}

export interface ChatHistoryGateway {
  beginTurn(input: {
    conversationId: string | null;
    question: string;
    selectedModuleId: string | null;
    userId: string;
  }): Promise<ChatTurnStart>;
  completeTurn(input: {
    answer: string;
    conversationId: string;
    faqMemory: FaqMemoryObservationInput | null;
    replyRole: ChatReplyRole;
    sources: ChatCitationInput[];
    topRelevanceScore: number | null;
    unansweredReason: 'ambiguous_request' | 'insufficient_evidence' | null;
    userId: string;
    userMessageId: string;
  }): Promise<ChatTurnCompletion>;
  getConversation(input: {
    conversationId: string;
    limit: number;
    userId: string;
  }): Promise<unknown>;
  deleteConversation(input: {
    conversationId: string;
    userId: string;
  }): Promise<DeletedChatConversation>;
  listActiveModules(): Promise<ActiveChatModule[]>;
  listConversations(input: {
    cursor: { id: string; updatedAt: string } | null;
    limit: number;
    userId: string;
  }): Promise<ChatConversationSummary[]>;
}
