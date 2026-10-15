import type { AuthorizationContext } from '../authorization';
import type { EmbeddingsGateway } from '../ingestion/embeddings.gateway';
import type { AnswerGateway, AnswerGatewayInput } from '../rag/answer.gateway';
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
import { buildConversationalReply } from './intent/conversational-replies';

const authorization: AuthorizationContext = {
  email: 'docente@example.com',
  emailConfirmedAt: '2026-08-28T00:00:00.000Z',
  role: 'docente',
  userId: '00000000-0000-0000-0000-000000000901',
};

const LICENSES_MODULE_ID = '00000000-0000-0000-0000-000000000101';
const CONTRACTS_MODULE_ID = '00000000-0000-0000-0000-000000000102';
const AUXILIARIES_MODULE_ID = '00000000-0000-0000-0000-000000000103';
const REMUNERATIONS_MODULE_ID = '00000000-0000-0000-0000-000000000104';

function source(input: {
  articleReference?: string | null;
  chunkId: string;
  content: string;
  documentId: string;
  documentSituation?: RetrievedChunk['documentSituation'];
  documentTitle: string;
  documentType?: string;
  issuanceYear?: number;
  moduleId: string;
  moduleName: string;
  pageEnd?: number;
  pageStart?: number;
  resolutionNumber?: string;
  score: number;
  versionId: string;
  versionNumber: number;
}): RetrievedChunk {
  return {
    articleReference:
      input.articleReference === undefined
        ? 'Artículo 5'
        : input.articleReference,
    chunkContent: input.content,
    chunkId: input.chunkId,
    documentId: input.documentId,
    documentSituation: input.documentSituation ?? 'current',
    documentTitle: input.documentTitle,
    documentType: input.documentType ?? null,
    documentVersionId: input.versionId,
    issuanceYear: input.issuanceYear ?? null,
    lexicalScore: 0.5,
    moduleIds: [input.moduleId],
    moduleNames: [input.moduleName],
    numeralReference: null,
    pageEnd: input.pageEnd ?? 1,
    pageStart: input.pageStart ?? 1,
    sectionTitle: 'Regla aplicable',
    resolutionNumber: input.resolutionNumber ?? null,
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

const exactResolution = source({
  chunkId: '00000000-0000-0000-0000-000000000205',
  content: 'La norma contiene una regla comprobable para el caso consultado.',
  documentId: '00000000-0000-0000-0000-000000000305',
  documentTitle: 'Resolución de Secretaría General N.° 326-2017-MINEDU',
  documentType: 'OTRO',
  moduleId: CONTRACTS_MODULE_ID,
  moduleName: 'Contrato docente',
  resolutionNumber: '326-2017-MINEDU',
  score: 0.9,
  versionId: '00000000-0000-0000-0000-000000000405',
  versionNumber: 1,
});

/**
 * Tres fragmentos contiguos del mismo archivo (páginas 2, 3 y 4 de la misma
 * versión): la respuesta debe llevar UNA referencia visible del documento, con
 * la ubicación real del fragmento conservado, y la cita persistida debe seguir
 * apuntando a ese fragmento real (el de mayor relevancia, página 3).
 */
const remunerationDocument = {
  documentId: '00000000-0000-0000-0000-000000000306',
  documentTitle: 'Norma de remuneraciones del sector docente',
  moduleId: REMUNERATIONS_MODULE_ID,
  moduleName: 'Remuneraciones',
  versionId: '00000000-0000-0000-0000-000000000406',
  versionNumber: 1,
} as const;

function remunerationChunk(input: {
  articleReference: string | null;
  chunkId: string;
  content: string;
  page: number;
  score: number;
}): RetrievedChunk {
  return source({
    ...remunerationDocument,
    articleReference: input.articleReference,
    chunkId: input.chunkId,
    content: input.content,
    pageEnd: input.page,
    pageStart: input.page,
    score: input.score,
  });
}

const remunerationPage2 = remunerationChunk({
  articleReference: null,
  chunkId: '00000000-0000-0000-0000-000000000206',
  content:
    'La remuneración mensual se abona mediante la planilla única de pagos.',
  page: 2,
  score: 0.88,
});

const remunerationPage3 = remunerationChunk({
  articleReference: 'Artículo 12',
  chunkId: '00000000-0000-0000-0000-000000000207',
  content:
    'Artículo 12.- La remuneración mensual del docente corresponde a su escala y a su jornada.',
  page: 3,
  score: 0.93,
});

const remunerationPage4 = remunerationChunk({
  articleReference: null,
  chunkId: '00000000-0000-0000-0000-000000000208',
  content:
    'El pago de la remuneración mensual se registra en la planilla del pliego.',
  page: 4,
  score: 0.86,
});

/**
 * Pie de firma digital: el puntaje más alto del lote, sin contenido normativo.
 * La sanitización lo descarta antes de consolidar, así que no puede ocupar una
 * referencia ni desplazar a un fragmento que sí aporta algo.
 */
const remunerationSignatureFooter = remunerationChunk({
  articleReference: null,
  chunkId: '00000000-0000-0000-0000-000000000209',
  content:
    'Documento electrónico firmado digitalmente. Verifique su autenticidad.',
  page: 90,
  score: 0.97,
});

class InMemoryRetrievalGateway implements RetrievalGateway {
  private sources = [
    licenseV1,
    contractV1,
    auxiliariesV1,
    remunerationPage2,
    remunerationPage3,
    remunerationPage4,
    remunerationSignatureFooter,
  ];

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
    if (query.includes('remuneraci')) {
      return Promise.resolve(
        ranked.filter((item) =>
          item.moduleIds.includes(REMUNERATIONS_MODULE_ID),
        ),
      );
    }
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

  searchExactReferences(input: {
    referenceKeys: string[];
  }): Promise<RetrievedChunk[]> {
    const normalize = (value: string) =>
      value
        .normalize('NFD')
        .replace(/[^a-z0-9]+/giu, '')
        .toUpperCase();
    return Promise.resolve(
      [...this.sources, exactResolution].filter((item) =>
        input.referenceKeys.some((lookupKey) => {
          const [code, identifier] = lookupKey.split(':');
          if (!identifier) return false;
          const expectedType =
            code === 'RSG' ? 'OTRO' : 'UNUSED_IN_THIS_INTEGRATION_DOUBLE';
          const identity = normalize(
            `${item.resolutionNumber ?? ''} ${item.documentTitle}`,
          );
          return (
            item.documentType === expectedType &&
            identity.includes(identifier) &&
            (code !== 'RSG' ||
              identity.includes('RSG') ||
              identity.includes('RESOLUCIONDESECRETARIAGENERAL'))
          );
        }),
      ),
    );
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

  recordTechnicalFailure(): Promise<void> {
    return Promise.resolve();
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

  createCatalogDocumentDownloadUrl(): Promise<never> {
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
    if (input.mode === 'advisory') {
      // El modelo real abre con la marca un pedido ajeno al ámbito.
      if (input.question.includes('sembrar papa')) {
        yield '[[FUERA_DE_AMBITO]] Qué interesante lo de la papa, pero mi objetivo es orientarte en temas educativos.';
        return;
      }
      yield 'Suele corresponder presentar la solicitud ante tu UGEL.';
      return;
    }
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

  it('responde una norma exacta solo con el documento de esa identidad', async () => {
    const events = await collect(service, {
      question: '¿Qué dispone la RSG N.° 326-2017-MINEDU?',
    });

    expect(events.find((event) => event.type === 'sources')).toMatchObject({
      data: {
        sources: [
          expect.objectContaining({
            documentTitle:
              'Resolución de Secretaría General N.° 326-2017-MINEDU',
          }),
        ],
      },
    });
    expect(history.completions[0]?.sources).toEqual([
      expect.objectContaining({ chunkId: exactResolution.chunkId }),
    ]);
  });

  it('rechaza una norma exacta ausente sin sustituirla por otra parecida', async () => {
    const events = await collect(service, {
      question: '¿Qué dispone la RSG N.° 121-2026-MINEDU?',
    });

    expect(events.map((event) => event.type)).toEqual([
      'conversation',
      'no_evidence',
      'done',
    ]);
    const noEvidence = events[1];
    if (noEvidence?.type !== 'no_evidence') {
      throw new Error('Expected a no_evidence event.');
    }
    expect(noEvidence.data.message).toContain(
      'Resolución de Secretaría General N.° 121-2026-MINEDU',
    );
    expect(history.completions[0]).toMatchObject({
      replyRole: 'no_evidence',
      sources: [],
    });
    expect(answers.inputs).toHaveLength(0);
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

  it('returns a professional ambiguity clarification without invoking the provider', async () => {
    const events = await collect(service, {
      question: 'Tengo requisitos ambiguos de licencia y de permuta.',
    });
    const clarification = events.find(
      (event) => event.type === 'clarification',
    );

    expect(clarification?.type).toBe('clarification');
    if (clarification?.type !== 'clarification') {
      throw new Error('EXPECTED_CLARIFICATION');
    }
    expect(events.map((event) => event.type)).toEqual([
      'conversation',
      'clarification',
      'done',
    ]);
    expect(clarification.data.message).toContain('identificar el trámite');
    expect(clarification.data.message.match(/\?/gu)).toHaveLength(1);
    expect(clarification.data.message).toContain(
      'Contratación de Auxiliares de Educación',
    );
    expect(clarification.data.message).toContain('Contrato docente');
    expect(clarification.data.message).not.toContain(licenseV1.chunkContent);
    expect(clarification.data.message).not.toMatch(/\[\d+\]/u);
    expect(history.completions[0]).toMatchObject({
      replyRole: 'clarification',
      sources: [],
      unansweredReason: 'ambiguous_request',
    });
    expect(answers.inputs).toHaveLength(0);
  });

  it('sin señal educativa responde con amabilidad lo que pidió y lo registra', async () => {
    const events = await collect(service, {
      question: '¿Cuál es la mejor época para sembrar papa?',
    });

    expect(events).toContainEqual({
      data: {
        message: buildConversationalReply('unrelated_no_evidence'),
      },
      type: 'no_evidence',
    });
    expect(history.completions[0]).toMatchObject({
      qualitySignals: [],
      replyRole: 'no_evidence',
      sources: [],
      unansweredReason: 'insufficient_evidence',
    });
    expect(answers.inputs).toHaveLength(0);
    expect(events.at(-1)).toMatchObject({ data: { provider: 'rule' } });
  });

  it('sin sustento en el corpus responde sin generar hechos y registra el hueco', async () => {
    const events = await collect(service, {
      question: '¿Cuáles son los requisitos de un trámite fuera del corpus?',
    });

    expect(events.map((event) => event.type)).toEqual([
      'conversation',
      'no_evidence',
      'done',
    ]);
    const noEvidence = events[1] as { data: { message: string } };
    expect(noEvidence.data.message).toContain(
      'no encontré información suficiente',
    );
    expect(noEvidence.data.message).not.toContain('UGEL');
    expect(noEvidence.data.message).not.toMatch(/\[\d+\]/u);
    expect(answers.inputs).toHaveLength(0);
    expect(history.completions[0]).toMatchObject({
      qualitySignals: [],
      replyRole: 'no_evidence',
      sources: [],
      unansweredReason: 'insufficient_evidence',
    });
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

  it('entrega una referencia por documento y la cita apunta al fragmento real', async () => {
    const events = await collect(service, {
      question: '¿Cuánto es la remuneración mensual de un docente?',
    });

    const sources = events.find((event) => event.type === 'sources')?.data
      .sources;
    // Tres fragmentos contiguos del mismo archivo (páginas 2, 3 y 4) son una
    // sola ubicación: el documento no ocupa tres referencias visibles. El pie
    // de firma digital, que puntuó más alto, se descarta en la sanitización y
    // tampoco ocupa plaza.
    expect(sources).toEqual([
      expect.objectContaining({
        documentVersionId: remunerationDocument.versionId,
        pageEnd: 3,
        pageStart: 3,
        rank: 1,
      }),
    ]);
    // La cita [1] persistida es el fragmento real conservado —el de mayor
    // relevancia, en la página 3—, no una fila fusionada: la ubicación que ve
    // la persona se puede verificar contra el PDF de esa versión.
    expect(history.completions[0]?.sources).toEqual([
      expect.objectContaining({ chunkId: remunerationPage3.chunkId }),
    ]);
    expect(events.find((event) => event.type === 'conversation')).toMatchObject(
      {
        data: { moduleId: REMUNERATIONS_MODULE_ID },
      },
    );
    expect(history.completions[0]).toMatchObject({
      qualitySignals: [],
      replyRole: 'assistant',
    });
  });
});
