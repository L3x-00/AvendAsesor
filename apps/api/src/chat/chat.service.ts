import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthorizationContext } from '../authorization';
import { FaqMemoryService } from '../learning/faq-memory.service';
import type { AnswerGateway } from '../rag/answer.gateway';
import {
  MAX_CHAT_CONTEXT_CHARS,
  MAX_CHAT_CONTEXT_MESSAGES,
  MAX_RAG_ANSWER_CHARS,
  RAG_AMBIGUITY_MESSAGE,
  RAG_NO_EVIDENCE_MESSAGE,
} from '../rag/rag.constants';
import { RagService, type ResolvedModule } from '../rag/rag.service';
import { RAG_ANSWER_GATEWAY } from '../rag/rag.tokens';
import type { RetrievedChunk } from '../rag/retrieval.gateway';
import { SUPABASE_CHAT_GATEWAY } from '../supabase/supabase.constants';
import type {
  ActiveChatModule,
  ChatCitationInput,
  ChatContextMessage,
  ChatConversationSummary,
  ChatHistoryGateway,
  ChatSourceDownload,
  DeletedChatConversation,
} from './chat-history.gateway';
import {
  decodeChatHistoryCursor,
  encodeChatHistoryCursor,
} from './chat-history-cursor';

export interface ChatSource {
  articleReference: string | null;
  documentTitle: string;
  id: string;
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
  | {
      data: {
        conversationId: string;
        moduleId: string | null;
        startedNewConversation: boolean;
        userMessageId: string;
      };
      type: 'conversation';
    }
  | { data: { sources: ChatSource[] }; type: 'sources' }
  | { data: { text: string }; type: 'token' }
  | {
      data: { message: string; modules: ResolvedModule[] };
      type: 'clarification';
    }
  | { data: { message: string }; type: 'no_evidence' }
  | {
      data: {
        conversationId: string;
        inReplyToMessageId: string;
        messageId: string;
        provider: 'openai' | 'rule';
      };
      type: 'done';
    };

export interface ChatConversationPage {
  items: ChatConversationSummary[];
  nextCursor: string | null;
}

interface CitationBundle {
  inputs: ChatCitationInput[];
  sources: ChatSource[];
}

const MAX_AMBIGUITY_EXCERPT_CHARS = 280;

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

function toCitationBundle(
  retrieved: RetrievedChunk[],
  selectedModuleId: string | null,
): CitationBundle {
  const inputs: ChatCitationInput[] = [];
  const sources: ChatSource[] = [];

  retrieved.forEach((source, index) => {
    const sourceId = randomUUID();
    const relevanceScore = clampScore(source.semanticScore);
    inputs.push({
      chunkId: source.chunkId,
      moduleId: selectCitationModule(source, selectedModuleId),
      relevanceScore,
      sourceId,
    });
    sources.push({
      articleReference: source.articleReference,
      documentTitle: source.documentTitle,
      id: sourceId,
      moduleName:
        source.moduleNames.length === 1
          ? (source.moduleNames[0] ?? null)
          : null,
      numeralReference: source.numeralReference,
      pageEnd: source.pageEnd,
      pageStart: source.pageStart,
      rank: index + 1,
      relevanceScore,
      sectionTitle: source.sectionTitle,
      versionNumber: source.versionNumber,
    });
  });

  return { inputs, sources };
}

function evidenceExcerpt(source: RetrievedChunk): string {
  const normalized = [...source.chunkContent]
    .map((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint <= 31 || codePoint === 127)
        ? ' '
        : character;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  const firstSentence = normalized.match(/^.*?[.!?](?=\s|$)/u)?.[0];
  const excerpt = (firstSentence ?? normalized).slice(
    0,
    MAX_AMBIGUITY_EXCERPT_CHARS,
  );

  return excerpt.length < (firstSentence ?? normalized).length
    ? `${excerpt.trimEnd()}…`
    : excerpt;
}

function evidenceOrientation(sources: RetrievedChunk[]): string {
  return sources
    .slice(0, 2)
    .map((source, index) => {
      const excerpt = evidenceExcerpt(source);
      if (!excerpt) return null;
      const reference =
        source.articleReference ??
        source.numeralReference ??
        source.sectionTitle ??
        source.documentTitle;
      return `Como orientación inicial, ${reference} señala: “${excerpt}” [${index + 1}].`;
    })
    .filter((orientation): orientation is string => Boolean(orientation))
    .join(' ');
}

function ambiguityMessage(
  modules: ResolvedModule[],
  sources: RetrievedChunk[],
): string {
  const names = modules
    .slice(0, 4)
    .map((module) => module.name)
    .join(', ');
  const orientation = evidenceOrientation(sources);
  const clarification = names
    ? `Los documentos recuperados se relacionan con: ${names}. ¿A cuál de estos temas corresponde tu consulta?`
    : '¿Qué tema específico deseas consultar?';

  return [RAG_AMBIGUITY_MESSAGE, orientation, clarification]
    .filter(Boolean)
    .join(' ');
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

  createSourceDownloadUrl(
    sourceId: string,
    authorization: AuthorizationContext,
  ): Promise<ChatSourceDownload> {
    return this.historyGateway.createSourceDownloadUrl({
      sourceId,
      ttlSeconds: 60,
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
    const storedContext = input.conversationId
      ? await this.historyGateway.getConversationContext({
          characterLimit: MAX_CHAT_CONTEXT_CHARS,
          conversationId: input.conversationId,
          messageLimit: MAX_CHAT_CONTEXT_MESSAGES,
          userId: input.authorization.userId,
        })
      : null;
    const manuallyChangedModule = Boolean(
      storedContext &&
      input.selectedModuleId !== null &&
      input.selectedModuleId !== storedContext.selectedModuleId,
    );
    let startedNewConversation = !input.conversationId || manuallyChangedModule;
    let conversationContext: ChatContextMessage[] = manuallyChangedModule
      ? []
      : (storedContext?.messages ?? []);
    let selectedModuleId = manuallyChangedModule
      ? input.selectedModuleId
      : (storedContext?.selectedModuleId ?? input.selectedModuleId);
    let conversationId = manuallyChangedModule ? null : input.conversationId;
    const priorUserQuestions = conversationContext
      .filter((message) => message.role === 'user')
      .map((message) => message.content);
    const retrieval = await this.ragService.retrieve(
      input.question,
      selectedModuleId,
      priorUserQuestions,
    );

    if (input.abortSignal?.aborted) return;

    if (retrieval.kind === 'topic_change') {
      conversationId = null;
      conversationContext = [];
      selectedModuleId = retrieval.resolvedModule.id;
      startedNewConversation = true;
    } else if (retrieval.kind === 'ambiguous' && selectedModuleId) {
      conversationId = null;
      conversationContext = [];
      selectedModuleId = null;
      startedNewConversation = true;
    } else if (
      retrieval.kind === 'evidence' &&
      !selectedModuleId &&
      retrieval.resolvedModule
    ) {
      if (storedContext) {
        conversationId = null;
        conversationContext = [];
        startedNewConversation = true;
      }
      selectedModuleId = retrieval.resolvedModule.id;
    }

    const turn = await this.historyGateway.beginTurn({
      conversationId,
      question: input.question,
      selectedModuleId,
      userId: input.authorization.userId,
    });

    yield {
      data: {
        conversationId: turn.conversationId,
        moduleId: selectedModuleId,
        startedNewConversation,
        userMessageId: turn.userMessageId,
      },
      type: 'conversation',
    };

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
          inReplyToMessageId: turn.userMessageId,
          messageId: completed.answerMessageId,
          provider: 'rule',
        },
        type: 'done',
      };
      return;
    }

    if (retrieval.kind === 'ambiguous') {
      const citations = toCitationBundle(retrieval.sources, null);
      const message = ambiguityMessage(retrieval.modules, retrieval.sources);
      yield { data: { sources: citations.sources }, type: 'sources' };
      if (input.abortSignal?.aborted) return;
      const completed = await this.historyGateway.completeTurn({
        answer: message,
        conversationId: turn.conversationId,
        faqMemory,
        replyRole: 'clarification',
        sources: citations.inputs,
        topRelevanceScore: retrieval.topRelevanceScore,
        unansweredReason: 'ambiguous_request',
        userId: input.authorization.userId,
        userMessageId: turn.userMessageId,
      });
      yield {
        data: { message, modules: retrieval.modules },
        type: 'clarification',
      };
      yield {
        data: {
          conversationId: turn.conversationId,
          inReplyToMessageId: turn.userMessageId,
          messageId: completed.answerMessageId,
          provider: 'rule',
        },
        type: 'done',
      };
      return;
    }

    const citations = toCitationBundle(retrieval.sources, selectedModuleId);
    yield { data: { sources: citations.sources }, type: 'sources' };

    let answer = '';
    for await (const token of this.answerGateway.generate({
      abortSignal: input.abortSignal,
      conversationContext,
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
      sources: citations.inputs,
      topRelevanceScore: retrieval.topRelevanceScore,
      unansweredReason: null,
      userId: input.authorization.userId,
      userMessageId: turn.userMessageId,
    });
    yield {
      data: {
        conversationId: turn.conversationId,
        inReplyToMessageId: turn.userMessageId,
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
