import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthorizationContext } from '../authorization';
import { FaqMemoryService } from '../learning/faq-memory.service';
import type {
  ActiveChatModule,
  ChatCitationInput,
  DeletedChatConversation,
  ChatConversationSummary,
  ChatHistoryGateway,
} from './chat-history.gateway';
import {
  decodeChatHistoryCursor,
  encodeChatHistoryCursor,
} from './chat-history-cursor';
import {
  RAG_AMBIGUITY_MESSAGE,
  MAX_RAG_ANSWER_CHARS,
  RAG_NO_EVIDENCE_MESSAGE,
} from '../rag/rag.constants';
import type { AnswerGateway } from '../rag/answer.gateway';
import { RagService } from '../rag/rag.service';
import { RAG_ANSWER_GATEWAY } from '../rag/rag.tokens';
import type { RetrievedChunk } from '../rag/retrieval.gateway';
import { SUPABASE_CHAT_GATEWAY } from '../supabase/supabase.constants';

export interface ChatSource {
  articleReference: string | null;
  documentTitle: string;
  moduleName: string | null;
  numeralReference: string | null;
  pageEnd: number;
  pageStart: number;
  rank: number;
  relevanceScore: number;
  sectionTitle: string | null;
  versionNumber: number;
}

export type ChatStreamEvent =
  | { data: { conversationId: string }; type: 'conversation' }
  | { data: { sources: ChatSource[] }; type: 'sources' }
  | { data: { text: string }; type: 'token' }
  | {
      data: { message: string; modules: { id: string; name: string }[] };
      type: 'clarification';
    }
  | { data: { message: string }; type: 'no_evidence' }
  | {
      data: {
        conversationId: string;
        messageId: string;
        provider: 'openai' | 'rule';
      };
      type: 'done';
    };

export interface ChatConversationPage {
  items: ChatConversationSummary[];
  nextCursor: string | null;
}

function clampScore(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function selectCitationModule(
  source: RetrievedChunk,
  selectedModuleId: string | null,
): string | null {
  if (selectedModuleId) return selectedModuleId;
  return source.moduleIds.length === 1 ? (source.moduleIds[0] ?? null) : null;
}

function toSources(sources: RetrievedChunk[]): ChatSource[] {
  return sources.map((source, index) => ({
    articleReference: source.articleReference,
    documentTitle: source.documentTitle,
    moduleName:
      source.moduleNames.length === 1 ? (source.moduleNames[0] ?? null) : null,
    numeralReference: source.numeralReference,
    pageEnd: source.pageEnd,
    pageStart: source.pageStart,
    rank: index + 1,
    relevanceScore: clampScore(source.semanticScore),
    sectionTitle: source.sectionTitle,
    versionNumber: source.versionNumber,
  }));
}

function toCitationInputs(
  sources: RetrievedChunk[],
  selectedModuleId: string | null,
): ChatCitationInput[] {
  return sources.map((source) => ({
    chunkId: source.chunkId,
    moduleId: selectCitationModule(source, selectedModuleId),
    relevanceScore: clampScore(source.semanticScore),
  }));
}

@Injectable()
export class ChatService {
  constructor(
    @Inject(RAG_ANSWER_GATEWAY) private readonly answerGateway: AnswerGateway,
    @Inject(SUPABASE_CHAT_GATEWAY)
    private readonly historyGateway: ChatHistoryGateway,
    private readonly ragService: RagService,
    private readonly configService: ConfigService,
    private readonly faqMemoryService: FaqMemoryService,
  ) {}

  getConversation(
    conversationId: string,
    authorization: AuthorizationContext,
  ): Promise<unknown> {
    return this.historyGateway.getConversation({
      conversationId,
      limit: this.historyLimit(),
      userId: authorization.userId,
    });
  }

  async listConversations(
    limit: number | undefined,
    cursor: string | undefined,
    authorization: AuthorizationContext,
  ): Promise<ChatConversationPage> {
    const pageLimit = limit ?? this.historyLimit();
    const page = await this.historyGateway.listConversations({
      cursor: decodeChatHistoryCursor(cursor),
      limit: pageLimit + 1,
      userId: authorization.userId,
    });

    const items = page.slice(0, pageLimit);
    const lastItem = items.at(-1);
    return {
      items,
      nextCursor:
        page.length > pageLimit && lastItem
          ? encodeChatHistoryCursor({
              id: lastItem.id,
              updatedAt: lastItem.updatedAt,
            })
          : null,
    };
  }

  deleteConversation(
    conversationId: string,
    authorization: AuthorizationContext,
  ): Promise<DeletedChatConversation> {
    return this.historyGateway.deleteConversation({
      conversationId,
      userId: authorization.userId,
    });
  }

  listModules(): Promise<ActiveChatModule[]> {
    return this.historyGateway.listActiveModules();
  }

  async *stream(input: {
    abortSignal?: AbortSignal;
    authorization: AuthorizationContext;
    conversationId: string | null;
    question: string;
    selectedModuleId: string | null;
  }): AsyncIterable<ChatStreamEvent> {
    const faqMemory = this.faqMemoryService.prepare(input.question);
    const turn = await this.historyGateway.beginTurn({
      conversationId: input.conversationId,
      question: input.question,
      selectedModuleId: input.selectedModuleId,
      userId: input.authorization.userId,
    });

    yield {
      data: { conversationId: turn.conversationId },
      type: 'conversation',
    };

    const retrieval = await this.ragService.retrieve(
      input.question,
      input.selectedModuleId,
    );

    if (input.abortSignal?.aborted) return;

    if (retrieval.kind === 'no_evidence') {
      const completed = await this.historyGateway.completeTurn({
        answer: RAG_NO_EVIDENCE_MESSAGE,
        conversationId: turn.conversationId,
        faqMemory,
        replyRole: 'no_evidence',
        sources: [],
        topRelevanceScore: retrieval.topRelevanceScore,
        unansweredReason: 'insufficient_evidence',
        userId: input.authorization.userId,
        userMessageId: turn.userMessageId,
      });
      yield { data: { message: RAG_NO_EVIDENCE_MESSAGE }, type: 'no_evidence' };
      yield {
        data: {
          conversationId: turn.conversationId,
          messageId: completed.answerMessageId,
          provider: 'rule',
        },
        type: 'done',
      };
      return;
    }

    if (retrieval.kind === 'ambiguous') {
      const completed = await this.historyGateway.completeTurn({
        answer: RAG_AMBIGUITY_MESSAGE,
        conversationId: turn.conversationId,
        faqMemory,
        replyRole: 'clarification',
        sources: [],
        topRelevanceScore: retrieval.topRelevanceScore,
        unansweredReason: 'ambiguous_request',
        userId: input.authorization.userId,
        userMessageId: turn.userMessageId,
      });
      yield {
        data: { message: RAG_AMBIGUITY_MESSAGE, modules: retrieval.modules },
        type: 'clarification',
      };
      yield {
        data: {
          conversationId: turn.conversationId,
          messageId: completed.answerMessageId,
          provider: 'rule',
        },
        type: 'done',
      };
      return;
    }

    const sources = toSources(retrieval.sources);
    yield { data: { sources }, type: 'sources' };

    let answer = '';
    for await (const token of this.answerGateway.generate({
      abortSignal: input.abortSignal,
      question: input.question,
      sources: retrieval.sources,
    })) {
      if (input.abortSignal?.aborted) return;

      answer += token;
      if (answer.length > MAX_RAG_ANSWER_CHARS) {
        throw new ServiceUnavailableException(
          'The generated answer is too long.',
        );
      }
      yield { data: { text: token }, type: 'token' };
    }

    if (input.abortSignal?.aborted) return;

    const normalizedAnswer = answer.trim();
    if (!normalizedAnswer) {
      throw new ServiceUnavailableException(
        'The RAG answer provider returned no answer.',
      );
    }

    const completed = await this.historyGateway.completeTurn({
      answer: normalizedAnswer,
      conversationId: turn.conversationId,
      faqMemory,
      replyRole: 'assistant',
      sources: toCitationInputs(retrieval.sources, input.selectedModuleId),
      topRelevanceScore: retrieval.topRelevanceScore,
      unansweredReason: null,
      userId: input.authorization.userId,
      userMessageId: turn.userMessageId,
    });
    yield {
      data: {
        conversationId: turn.conversationId,
        messageId: completed.answerMessageId,
        provider: 'openai',
      },
      type: 'done',
    };
  }

  private historyLimit(): number {
    return this.configService.get<number>('CHAT_HISTORY_LIMIT') ?? 20;
  }
}
