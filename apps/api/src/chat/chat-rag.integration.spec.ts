import type { AuthorizationContext } from '../authorization';
import type { EmbeddingsGateway } from '../ingestion/embeddings.gateway';
import type { AnswerGateway, AnswerGatewayInput } from '../rag/answer.gateway';
import { RAG_NO_EVIDENCE_MESSAGE } from '../rag/rag.constants';
import { RagService } from '../rag/rag.service';
import type {
  RetrievalGateway,
  RetrievedChunk,
} from '../rag/retrieval.gateway';
import type {
  ChatContextMessage,
  ChatHistoryGateway,
  ChatTurnCompletion,
  ChatTurnStart,
} from './chat-history.gateway';
import { ChatService, type ChatStreamEvent } from './chat.service';

const authorization: AuthorizationContext = {
  email: 'docente@example.com',
  emailConfirmedAt: '2026-08-28T00:00:00.000Z',
  role: 'docente',
  userId: '00000000-0000-0000-0000-000000000901',
};

const LICENSES_MODULE_ID = '00000000-0000-0000-0000-000000000101';
const CONTRACTS_MODULE_ID = '00000000-0000-0000-0000-000000000102';
const AUXILIARIES_MODULE_ID = '00000000-0000-0000-0000-000000000103';

function source(input: {
  chunkId: string;
  content: string;
  documentId: string;
  documentTitle: string;
  moduleId: string;
  moduleName: string;
  score: number;
  versionId: string;
  versionNumber: number;
}): RetrievedChunk {
  return {
    articleReference: 'Artículo 5',
    chunkContent: input.content,
    chunkId: input.chunkId,
    documentId: input.documentId,
    documentSituation: 'current',
    documentTitle: input.documentTitle,
    documentVersionId: input.versionId,
    lexicalScore: 0.5,
    moduleIds: [input.moduleId],
    moduleNames: [input.moduleName],
    numeralReference: null,
    pageEnd: 1,
    pageStart: 1,
    sectionTitle: 'Regla aplicable',
    semanticScore: input.score,
    versionNumber: input.versionNumber,
  };
}

const licenseV1 = source({
  chunkId: '00000000-0000-0000-0000-000000000201',
  content: 'La licencia por salud se solicita ante la institución educativa.',
  documentId: '00000000-0000-0000-0000-000000000301',
  documentTitle: 'Norma de licencias',
  moduleId: LICENSES_MODULE_ID,
  moduleName: 'Licencias',
  score: 0.82,
  versionId: '00000000-0000-0000-0000-000000000401',
  versionNumber: 1,
});

const contractV1 = source({
  chunkId: '00000000-0000-0000-0000-000000000202',
  content: 'La convocatoria de contrato docente establece sus propias etapas.',
  documentId: '00000000-0000-0000-0000-000000000302',
  documentTitle: 'Norma de contrato docente',
  moduleId: CONTRACTS_MODULE_ID,
  moduleName: 'Contrato docente',
  score: 0.96,
  versionId: '00000000-0000-0000-0000-000000000402',
  versionNumber: 1,
});

const auxiliariesV1 = source({
  chunkId: '00000000-0000-0000-0000-000000000204',
  content:
    'La contratación de auxiliares de educación exige acreditar los requisitos de la convocatoria correspondiente.',
  documentId: '00000000-0000-0000-0000-000000000304',
  documentTitle: 'Norma de contratación de auxiliares de educación',
  moduleId: AUXILIARIES_MODULE_ID,
  moduleName: 'Contratación de Auxiliares de Educación',
  score: 0.97,
  versionId: '00000000-0000-0000-0000-000000000404',
  versionNumber: 1,
});

class InMemoryRetrievalGateway implements RetrievalGateway {
  private sources = [licenseV1, contractV1, auxiliariesV1];

  add(sourceToAdd: RetrievedChunk): void {
    this.sources.push(sourceToAdd);
  }

  search(input: {
    query: string;
    selectedModuleId: string | null;
  }): Promise<RetrievedChunk[]> {
    const query = input.query.toLocaleLowerCase('es');
    const scoped = input.selectedModuleId
      ? this.sources.filter((item) =>
          item.moduleIds.includes(input.selectedModuleId!),
        )
      : this.sources;
    const ranked = [...scoped].sort(
      (left, right) => right.semanticScore - left.semanticScore,
    );

    if (input.selectedModuleId) return Promise.resolve(ranked);
    if (query.includes('reintegro extraordinario')) {
      return Promise.resolve(ranked.filter((item) => item.versionNumber === 2));
    }
    if (query.includes('requisitos ambiguos')) return Promise.resolve(ranked);
    if (query.includes('auxiliar')) {
      return Promise.resolve(
        ranked.filter((item) => item.moduleIds.includes(AUXILIARIES_MODULE_ID)),
      );
    }
    if (query.includes('contrato') || query.includes('convocatoria')) {
      return Promise.resolve(
        ranked.filter((item) => item.moduleIds.includes(CONTRACTS_MODULE_ID)),
      );
    }
    if (query.includes('licencia') || query.includes('salud')) {
      return Promise.resolve(
        ranked.filter((item) => item.moduleIds.includes(LICENSES_MODULE_ID)),
      );
    }
    return Promise.resolve([]);
  }
}

interface StoredConversation {
  messages: ChatContextMessage[];
  selectedModuleId: string | null;
}

class InMemoryChatHistoryGateway implements ChatHistoryGateway {
  readonly completions: Array<
    Parameters<ChatHistoryGateway['completeTurn']>[0]
  > = [];
  readonly conversations = new Map<string, StoredConversation>();
  private conversationSequence = 500;
  private messageSequence = 600;

  beginTurn(input: {
    conversationId: string | null;
    question: string;
    selectedModuleId: string | null;
  }): Promise<ChatTurnStart> {
    const conversationId =
      input.conversationId ?? this.uuid(++this.conversationSequence);
    const conversation = this.conversations.get(conversationId) ?? {
      messages: [],
      selectedModuleId: input.selectedModuleId,
    };
    conversation.messages.push({ content: input.question, role: 'user' });
    conversation.selectedModuleId = input.selectedModuleId;
    this.conversations.set(conversationId, conversation);
    return Promise.resolve({
      conversationId,
      userMessageId: this.uuid(++this.messageSequence),
    });
  }

  completeTurn(
    input: Parameters<ChatHistoryGateway['completeTurn']>[0],
  ): Promise<ChatTurnCompletion> {
    this.completions.push(input);
    this.conversations.get(input.conversationId)?.messages.push({
      content: input.answer,
      role: input.replyRole,
    });
    return Promise.resolve({
      answerMessageId: this.uuid(++this.messageSequence),
    });
  }

  getConversationContext(input: { conversationId: string }): Promise<{
    conversationId: string;
    messages: ChatContextMessage[];
    selectedModuleId: string | null;
  }> {
    const conversation = this.conversations.get(input.conversationId);
    if (!conversation)
      return Promise.reject(new Error('CONVERSATION_NOT_FOUND'));
    return Promise.resolve({
      conversationId: input.conversationId,
      messages: conversation.messages.map((message) => ({ ...message })),
      selectedModuleId: conversation.selectedModuleId,
    });
  }

  getConversation(): Promise<unknown> {
    return Promise.resolve({});
  }

  createSourceDownloadUrl(): Promise<never> {
    return Promise.reject(new Error('NOT_USED'));
  }

  deleteConversation(): Promise<never> {
    return Promise.reject(new Error('NOT_USED'));
  }

  listActiveModules(): Promise<[]> {
    return Promise.resolve([]);
  }

  listConversations(): Promise<[]> {
    return Promise.resolve([]);
  }

  private uuid(sequence: number): string {
    return `00000000-0000-0000-0000-${sequence.toString().padStart(12, '0')}`;
  }
}

class RecordingAnswerGateway implements AnswerGateway {
  readonly inputs: AnswerGatewayInput[] = [];

  async *generate(input: AnswerGatewayInput): AsyncIterable<string> {
    await Promise.resolve();
    this.inputs.push(input);
    yield `Orientación sustentada en ${input.sources[0]?.documentTitle}. [1]`;
  }
}

function embeddings(): EmbeddingsGateway {
  return {
    embed: (queries: string[]) =>
      Promise.resolve(
        queries.map((_query, index) =>
          Array.from({ length: 1536 }, () => 0.1 + index / 100),
        ),
      ),
  };
}

async function collect(
  service: ChatService,
  input: {
    conversationId?: string | null;
    question: string;
    selectedModuleId?: string | null;
  },
): Promise<ChatStreamEvent[]> {
  const events: ChatStreamEvent[] = [];
  for await (const event of service.stream({
    authorization,
    conversationId: input.conversationId ?? null,
    question: input.question,
    selectedModuleId: input.selectedModuleId ?? null,
  })) {
    events.push(event);
  }
  return events;
}

describe('ChatService + RagService integration', () => {
  let retrieval: InMemoryRetrievalGateway;
  let history: InMemoryChatHistoryGateway;
  let answers: RecordingAnswerGateway;
  let service: ChatService;

  beforeEach(() => {
    retrieval = new InMemoryRetrievalGateway();
    history = new InMemoryChatHistoryGateway();
    answers = new RecordingAnswerGateway();
    const rag = new RagService(embeddings(), retrieval, {
      get: jest.fn((key: string) => (key === 'RAG_MATCH_COUNT' ? 5 : 0.7)),
    } as never);
    service = new ChatService(
      answers,
      history,
      rag,
      { get: jest.fn().mockReturnValue(20) } as never,
      { prepare: jest.fn().mockReturnValue(null) } as never,
    );
  });

  it('resolves a free query to one module and persists its exact source citation', async () => {
    const events = await collect(service, {
      question: '¿Cómo solicito una licencia por salud?',
    });

    expect(events[0]).toMatchObject({
      data: { moduleId: LICENSES_MODULE_ID, startedNewConversation: true },
      type: 'conversation',
    });
    expect(events.find((event) => event.type === 'sources')).toMatchObject({
      data: {
        sources: [
          expect.objectContaining({ documentTitle: 'Norma de licencias' }),
        ],
      },
    });
    expect(history.completions[0]?.sources).toEqual([
      expect.objectContaining({
        chunkId: licenseV1.chunkId,
        moduleId: LICENSES_MODULE_ID,
      }),
    ]);
  });

  it('reuses persisted context for a follow-up in the same conversation', async () => {
    const first = await collect(service, {
      question: 'Necesito una licencia por salud.',
    });
    const conversationId = (
      first[0] as Extract<ChatStreamEvent, { type: 'conversation' }>
    ).data.conversationId;
    await collect(service, { conversationId, question: '¿Y cuánto demora?' });

    expect(answers.inputs[1]?.conversationContext).toEqual([
      { content: 'Necesito una licencia por salud.', role: 'user' },
      expect.objectContaining({ role: 'assistant' }),
    ]);
    expect(history.completions[1]?.sources[0]?.chunkId).toBe(licenseV1.chunkId);
  });

  it('starts a new topic conversation and never mixes former-module sources', async () => {
    const first = await collect(service, {
      question: 'Necesito una licencia por salud.',
    });
    const priorConversationId = (
      first[0] as Extract<ChatStreamEvent, { type: 'conversation' }>
    ).data.conversationId;
    const switched = await collect(service, {
      conversationId: priorConversationId,
      question: '¿Cuáles son las etapas del contrato docente?',
    });
    const conversation = switched[0] as Extract<
      ChatStreamEvent,
      { type: 'conversation' }
    >;

    expect(conversation.data).toMatchObject({
      moduleId: CONTRACTS_MODULE_ID,
      startedNewConversation: true,
    });
    expect(conversation.data.conversationId).not.toBe(priorConversationId);
    expect(history.completions[1]?.sources).toEqual([
      expect.objectContaining({
        chunkId: contractV1.chunkId,
        moduleId: CONTRACTS_MODULE_ID,
      }),
    ]);
  });

  it('distinguishes Contrato Docente from Auxiliares without mixing their sources', async () => {
    const contractEvents = await collect(service, {
      question: '¿Cuáles son los requisitos del contrato docente?',
    });
    const auxiliaryEvents = await collect(service, {
      question:
        '¿Cuáles son los requisitos para postular como auxiliar de educación?',
    });

    expect(contractEvents[0]).toMatchObject({
      data: { moduleId: CONTRACTS_MODULE_ID },
      type: 'conversation',
    });
    expect(auxiliaryEvents[0]).toMatchObject({
      data: { moduleId: AUXILIARIES_MODULE_ID },
      type: 'conversation',
    });
    expect(history.completions[0]?.sources).toEqual([
      expect.objectContaining({ moduleId: CONTRACTS_MODULE_ID }),
    ]);
    expect(history.completions[1]?.sources).toEqual([
      expect.objectContaining({ moduleId: AUXILIARIES_MODULE_ID }),
    ]);
  });

  it('returns evidence-backed ambiguity guidance without invoking the provider', async () => {
    const events = await collect(service, {
      question: 'Tengo requisitos ambiguos.',
    });
    const clarification = events.find(
      (event) => event.type === 'clarification',
    );

    expect(clarification?.type).toBe('clarification');
    if (clarification?.type !== 'clarification') {
      throw new Error('EXPECTED_CLARIFICATION');
    }
    expect(clarification.data.message).toContain('Como orientación inicial');
    expect(history.completions[0]).toMatchObject({
      replyRole: 'clarification',
      unansweredReason: 'ambiguous_request',
    });
    expect(answers.inputs).toHaveLength(0);
  });

  it('registers no evidence and does not invoke the provider', async () => {
    const events = await collect(service, {
      question: 'Pregunta fuera del corpus.',
    });

    expect(events).toContainEqual({
      data: { message: RAG_NO_EVIDENCE_MESSAGE },
      type: 'no_evidence',
    });
    expect(history.completions[0]).toMatchObject({
      replyRole: 'no_evidence',
      sources: [],
      unansweredReason: 'insufficient_evidence',
    });
    expect(answers.inputs).toHaveLength(0);
  });

  it('retrieves a newly incorporated version without losing the prior document', async () => {
    await collect(service, { question: '¿Cómo solicito una licencia?' });
    const licenseV2 = source({
      chunkId: '00000000-0000-0000-0000-000000000203',
      content: 'La versión nueva regula el reintegro extraordinario.',
      documentId: '00000000-0000-0000-0000-000000000303',
      documentTitle: 'Norma complementaria de reintegro',
      moduleId: LICENSES_MODULE_ID,
      moduleName: 'Licencias',
      score: 0.94,
      versionId: '00000000-0000-0000-0000-000000000403',
      versionNumber: 2,
    });
    retrieval.add(licenseV2);

    await collect(service, {
      question: '¿Qué dice sobre reintegro extraordinario?',
    });
    await collect(service, { question: '¿Cómo solicito una licencia?' });
    await collect(service, {
      question: '¿Cuáles son las etapas del contrato docente?',
    });

    expect(history.completions[1]?.sources[0]?.chunkId).toBe(licenseV2.chunkId);
    expect(history.completions[2]?.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ chunkId: licenseV1.chunkId }),
      ]),
    );
    expect(history.completions[3]?.sources).toEqual([
      expect.objectContaining({
        chunkId: contractV1.chunkId,
        moduleId: CONTRACTS_MODULE_ID,
      }),
    ]);
  });
});
