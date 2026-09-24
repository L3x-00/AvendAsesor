import { ServiceUnavailableException } from '@nestjs/common';
import type { AuthorizationContext } from '../authorization';
import {
  MAX_RAG_ANSWER_CHARS,
  RAG_AMBIGUITY_MESSAGE,
  RAG_NO_EVIDENCE_MESSAGE,
} from '../rag/rag.constants';
import {
  ChatService,
  RAG_TRUNCATION_NOTE,
  evaluateAnswerCitationQuality,
  evaluateAnswerCitationQualityDetails,
  noEvidenceMessage,
  type ChatStreamEvent,
} from './chat.service';
import type { ChatHistoryGateway } from './chat-history.gateway';

/** Tope de la respuesta del modelo: se reserva espacio para el aviso de corte. */
const ANSWER_CAP = MAX_RAG_ANSWER_CHARS - `\n\n${RAG_TRUNCATION_NOTE}`.length;

const authorization: AuthorizationContext = {
  email: 'docente@example.com',
  emailConfirmedAt: '2026-08-22T00:00:00.000Z',
  role: 'docente',
  userId: '4c8b56af-6d0c-4fef-881e-7c00907540dd',
};

const source = {
  articleReference: 'Artículo 5',
  chunkContent: 'La licencia se solicita mediante procedimiento institucional.',
  chunkId: '5c8b56af-6d0c-4fef-881e-7c00907540dd',
  documentId: '6c8b56af-6d0c-4fef-881e-7c00907540dd',
  documentSituation: 'current' as const,
  documentTitle: 'Norma de licencias',
  documentVersionId: '7c8b56af-6d0c-4fef-881e-7c00907540dd',
  lexicalScore: 0.2,
  moduleIds: ['8c8b56af-6d0c-4fef-881e-7c00907540dd'],
  moduleNames: ['Licencias'],
  numeralReference: null,
  pageEnd: 1,
  pageStart: 1,
  sectionTitle: 'Licencias',
  semanticScore: 0.9,
  versionNumber: 1,
};

async function collect(
  service: ChatService,
  input: Partial<Parameters<ChatService['stream']>[0]> = {},
): Promise<ChatStreamEvent[]> {
  const events: ChatStreamEvent[] = [];
  for await (const event of service.stream({
    authorization,
    conversationId: null,
    question: '¿Cómo solicito una licencia?',
    selectedModuleId: null,
    ...input,
  })) {
    events.push(event);
  }
  return events;
}

describe('ChatService', () => {
  let answerGateway: { generate: jest.Mock };
  let historyGateway: {
    beginTurn: jest.Mock;
    completeTurn: jest.Mock;
    createSourceDownloadUrl: jest.Mock;
    deleteConversation: jest.Mock;
    getConversation: jest.Mock;
    getConversationContext: jest.Mock;
    listActiveModules: jest.Mock;
    listConversations: jest.Mock;
    recordTechnicalFailure: jest.Mock;
  };
  let ragService: { retrieve: jest.Mock };
  let configService: { get: jest.Mock };
  let faqMemoryService: { prepare: jest.Mock };
  let service: ChatService;

  beforeEach(() => {
    answerGateway = { generate: jest.fn() };
    historyGateway = {
      beginTurn: jest.fn().mockResolvedValue({
        conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
        userMessageId: 'ac8b56af-6d0c-4fef-881e-7c00907540dd',
      }),
      completeTurn: jest.fn().mockResolvedValue({
        answerMessageId: 'bc8b56af-6d0c-4fef-881e-7c00907540dd',
      }),
      recordTechnicalFailure: jest.fn().mockResolvedValue(undefined),
      createSourceDownloadUrl: jest.fn(),
      deleteConversation: jest.fn(),
      getConversation: jest.fn(),
      getConversationContext: jest.fn(),
      listActiveModules: jest.fn(),
      listConversations: jest.fn(),
    };
    ragService = { retrieve: jest.fn() };
    configService = { get: jest.fn().mockReturnValue(20) };
    faqMemoryService = {
      prepare: jest.fn().mockReturnValue({
        questionFingerprint:
          'd7d93628135348b418dccf36bcffca1b5484813982f4d4ca8dc4570d65e78f4d',
      }),
    };
    service = new ChatService(
      answerGateway,
      historyGateway,
      ragService as never,
      configService as never,
      faqMemoryService as never,
    );
  });

  it('records no-evidence without calling the answer provider', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'no_evidence',
      topRelevanceScore: null,
    });

    await expect(collect(service)).resolves.toEqual([
      {
        data: {
          conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
          moduleId: null,
          startedNewConversation: true,
          userMessageId: 'ac8b56af-6d0c-4fef-881e-7c00907540dd',
        },
        type: 'conversation',
      },
      { data: { message: noEvidenceMessage('current') }, type: 'no_evidence' },
      {
        data: {
          conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
          inReplyToMessageId: 'ac8b56af-6d0c-4fef-881e-7c00907540dd',
          messageId: 'bc8b56af-6d0c-4fef-881e-7c00907540dd',
          provider: 'rule',
        },
        type: 'done',
      },
    ]);
    expect(answerGateway.generate).not.toHaveBeenCalled();
    expect(historyGateway.completeTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        replyRole: 'no_evidence',
        sources: [],
        unansweredReason: 'insufficient_evidence',
      }),
    );
  });

  it('offers to check historical antecedents on a current-scope no-evidence', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'no_evidence',
      topRelevanceScore: null,
    });

    const events = await collect(service, {
      question: '¿Cuál es el plazo para presentar la solicitud de licencia?',
    });

    const noEvidence = events.find((event) => event.type === 'no_evidence');
    if (!noEvidence || noEvidence.type !== 'no_evidence') {
      throw new Error('Expected a no_evidence event.');
    }
    expect(noEvidence.data.message).toContain('antecedente');
  });

  it('does not repeat the antecedents offer when the scope is already historical', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'no_evidence',
      topRelevanceScore: null,
    });

    const events = await collect(service, {
      question: '¿Qué decía la norma anterior sobre el plazo de la licencia?',
    });

    const noEvidence = events.find((event) => event.type === 'no_evidence');
    if (!noEvidence || noEvidence.type !== 'no_evidence') {
      throw new Error('Expected a no_evidence event.');
    }
    expect(noEvidence.data.message).toBe(RAG_NO_EVIDENCE_MESSAGE);
  });

  it('answers a social greeting conversationally without RAG or persistence', async () => {
    const events = await collect(service, { question: 'Hola, buenos días' });

    expect(events).toHaveLength(1);
    const [event] = events;
    if (!event || event.type !== 'conversational') {
      throw new Error('Expected a conversational event.');
    }
    expect(event.data.message).toContain('AVEND ASESOR');
    expect(ragService.retrieve).not.toHaveBeenCalled();
    expect(historyGateway.beginTurn).not.toHaveBeenCalled();
    expect(answerGateway.generate).not.toHaveBeenCalled();
    expect(faqMemoryService.prepare).not.toHaveBeenCalled();
  });

  it('answers a capabilities question by explaining the educational scope', async () => {
    const events = await collect(service, { question: '¿Qué puedes hacer?' });

    expect(events).toHaveLength(1);
    const [event] = events;
    if (!event || event.type !== 'conversational') {
      throw new Error('Expected a conversational event.');
    }
    expect(event.data.message).toContain('docentes');
    expect(ragService.retrieve).not.toHaveBeenCalled();
  });

  it('declines an out-of-scope question and reorients without RAG (point 10)', async () => {
    const events = await collect(service, {
      question: '¿Qué tiempo hace hoy?',
    });

    expect(events).toHaveLength(1);
    const [event] = events;
    if (!event || event.type !== 'conversational') {
      throw new Error('Expected a conversational event.');
    }
    expect(event.data.message).toContain('educativo');
    expect(ragService.retrieve).not.toHaveBeenCalled();
    expect(historyGateway.beginTurn).not.toHaveBeenCalled();
    expect(faqMemoryService.prepare).not.toHaveBeenCalled();
  });

  it('routes a greeting that carries a query through the RAG (query prevails)', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'no_evidence',
      topRelevanceScore: null,
    });

    const events = await collect(service, {
      question: 'Hola, ¿cuál es el plazo para una reasignación?',
    });

    expect(ragService.retrieve).toHaveBeenCalledTimes(1);
    expect(events.some((event) => event.type === 'conversational')).toBe(false);
  });

  it('prioritizes the query over the greeting in the client point-11 example', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'no_evidence',
      topRelevanceScore: null,
    });
    const question =
      'Buenos días, quisiera saber cuánto tiempo tiene un director para responder esta solicitud.';

    const events = await collect(service, { question });

    expect(ragService.retrieve).toHaveBeenCalledWith(
      question,
      null,
      expect.any(Array),
      { forceContext: false },
    );
    expect(events.some((event) => event.type === 'conversational')).toBe(false);
  });

  it('keeps a social turn inside an existing conversation ephemeral', async () => {
    const events = await collect(service, {
      question: 'gracias',
      conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('conversational');
    expect(historyGateway.getConversationContext).not.toHaveBeenCalled();
    expect(historyGateway.beginTurn).not.toHaveBeenCalled();
    expect(historyGateway.completeTurn).not.toHaveBeenCalled();
  });

  it('reads a conversation scoped to the authenticated user (owner-only)', async () => {
    historyGateway.getConversation.mockResolvedValue({
      conversation: { id: '9c8b56af-6d0c-4fef-881e-7c00907540dd' },
      messages: [],
    });

    await service.getConversation(
      '9c8b56af-6d0c-4fef-881e-7c00907540dd',
      authorization,
    );

    expect(historyGateway.getConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
        userId: authorization.userId,
      }),
    );
  });

  it('lists conversations scoped to the authenticated user', async () => {
    historyGateway.listConversations.mockResolvedValue([]);

    await service.listConversations(10, undefined, authorization);

    expect(historyGateway.listConversations).toHaveBeenCalledWith(
      expect.objectContaining({ userId: authorization.userId }),
    );
  });

  it('records ambiguity without calling the answer provider', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'ambiguous',
      modules: [{ id: source.moduleIds[0], name: 'Licencias' }],
      sources: [source],
      topRelevanceScore: 0.9,
    });

    const events = await collect(service);

    expect(events.map((event) => event.type)).toEqual([
      'conversation',
      'sources',
      'clarification',
      'done',
    ]);
    const clarification = events[2];
    expect(clarification?.type).toBe('clarification');
    if (!clarification || clarification.type !== 'clarification') {
      throw new Error('Expected a clarification event.');
    }
    expect(clarification.data.message).toContain(RAG_AMBIGUITY_MESSAGE);
    expect(clarification.data.message).toContain(source.chunkContent);
    expect(clarification.data.message).toContain('[1]');
    expect(
      clarification.data.message.indexOf(source.chunkContent),
    ).toBeLessThan(
      clarification.data.message.indexOf(
        '¿Sobre cuál de ellos es tu consulta?',
      ),
    );
    // Sin frases duplicadas al concatenar la constante y la clarificación.
    expect(
      clarification.data.message.match(/orientarte con precisión/gu),
    ).toHaveLength(1);
    expect(
      clarification.data.message.match(/¿Sobre cuál de ellos/gu),
    ).toHaveLength(1);
    expect(clarification.data.modules).toEqual([
      { id: source.moduleIds[0], name: 'Licencias' },
    ]);
    expect(answerGateway.generate).not.toHaveBeenCalled();
    const completionCalls = historyGateway.completeTurn.mock.calls as Array<
      [Parameters<ChatHistoryGateway['completeTurn']>[0]]
    >;
    const completion = completionCalls[0]?.[0];
    expect(completion).toMatchObject({
      replyRole: 'clarification',
      unansweredReason: 'ambiguous_request',
    });
    expect(completion?.sources[0]?.chunkId).toBe(source.chunkId);
    expect(typeof completion?.sources[0]?.sourceId).toBe('string');
    expect(events.at(-1)).toEqual({
      data: {
        conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
        inReplyToMessageId: 'ac8b56af-6d0c-4fef-881e-7c00907540dd',
        messageId: 'bc8b56af-6d0c-4fef-881e-7c00907540dd',
        provider: 'rule',
      },
      type: 'done',
    });
  });

  it('streams evidence, then persists real sources only after completion', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      sources: [source],
      topRelevanceScore: 0.9,
    });
    answerGateway.generate.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        await Promise.resolve();
        yield 'La licencia ';
        yield 'se solicita conforme al procedimiento. [1]';
      },
    });

    const events = await collect(service);

    // Los fragmentos previos a la primera cita se entregan juntos (ventana
    // inicial que evita exhibir fuentes ante una negativa sin citas).
    expect(events.map((event) => event.type)).toEqual([
      'conversation',
      'sources',
      'token',
      'done',
    ]);
    const completionCalls = historyGateway.completeTurn.mock.calls as Array<
      [Parameters<ChatHistoryGateway['completeTurn']>[0]]
    >;
    const completion = completionCalls[0]?.[0];
    expect(completion).toMatchObject({
      answer: 'La licencia se solicita conforme al procedimiento. [1]',
      replyRole: 'assistant',
    });
    expect(completion?.sources[0]).toMatchObject({
      chunkId: source.chunkId,
      moduleId: source.moduleIds[0],
      relevanceScore: 0.9,
    });
    expect(typeof completion?.sources[0]?.sourceId).toBe('string');
    expect(events.at(-1)).toEqual({
      data: {
        conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
        inReplyToMessageId: 'ac8b56af-6d0c-4fef-881e-7c00907540dd',
        messageId: 'bc8b56af-6d0c-4fef-881e-7c00907540dd',
        provider: 'openai',
      },
      type: 'done',
    });
  });

  it('infers the module from an educational query that names no module (point 3)', async () => {
    const inferredModule = { id: source.moduleIds[0], name: 'Licencias' };
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      resolvedModule: inferredModule,
      sources: [source],
      topRelevanceScore: 0.9,
    });
    answerGateway.generate.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        await Promise.resolve();
        yield 'Respuesta con sustento. [1]';
      },
    });

    const events = await collect(service, {
      question: '¿Quién reemplaza al director cuando está de licencia?',
      selectedModuleId: null,
    });

    expect(ragService.retrieve).toHaveBeenCalledWith(
      '¿Quién reemplaza al director cuando está de licencia?',
      null,
      expect.any(Array),
      { forceContext: false },
    );
    const conversation = events[0];
    if (!conversation || conversation.type !== 'conversation') {
      throw new Error('Expected a conversation event.');
    }
    expect(conversation.data.moduleId).toBe(inferredModule.id);
    expect(conversation.data.startedNewConversation).toBe(true);
    expect(events.map((event) => event.type)).toEqual([
      'conversation',
      'sources',
      'token',
      'done',
    ]);
  });

  it('persists the exact unsupported answer fragment for administrator review', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      sources: [source],
      topRelevanceScore: 0.9,
    });
    answerGateway.generate.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        await Promise.resolve();
        yield 'La licencia se concede automáticamente durante treinta días sin condición.';
      },
    });
    configService.get.mockImplementation((key: string) =>
      key === 'RAG_MATCH_THRESHOLD' ? 0.7 : 20,
    );

    await collect(service);

    expect(historyGateway.completeTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        qualityExcerpts: {
          support_partial:
            'La licencia se concede automáticamente durante treinta días sin condición.',
        },
        qualitySignals: ['support_partial'],
      }),
    );
  });

  it('persists the real child association when a main module retrieves submodule evidence', async () => {
    const parentModuleId = 'dc8b56af-6d0c-4fef-881e-7c00907540dd';
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      resolvedModule: { id: parentModuleId, name: 'Evaluación docente' },
      sources: [source],
      topRelevanceScore: 0.9,
    });
    answerGateway.generate.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        await Promise.resolve();
        yield 'Respuesta fundada. [1]';
      },
    });

    await collect(service, { selectedModuleId: parentModuleId });

    expect(historyGateway.completeTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: [
          expect.objectContaining({
            moduleId: source.moduleIds[0],
          }),
        ],
      }),
    );
  });

  it('persists and emits the discretely detected root and submodule route', async () => {
    const rootModuleId = 'dc8b56af-6d0c-4fef-881e-7c00907540dd';
    const submoduleId = 'ec8b56af-6d0c-4fef-881e-7c00907540dd';
    const routedSource = {
      ...source,
      moduleAssociations: [
        {
          rootModuleId,
          rootModuleName: 'Situaciones administrativas',
          submoduleId,
          submoduleName: 'Licencias, permisos y vacaciones',
        },
      ],
      moduleIds: [rootModuleId],
      moduleNames: ['Situaciones administrativas'],
    };
    configService.get.mockImplementation((key: string) =>
      key === 'RAG_MATCH_THRESHOLD' ? 0.7 : 20,
    );
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      resolvedModule: {
        id: rootModuleId,
        name: 'Situaciones administrativas',
      },
      sources: [routedSource],
      topRelevanceScore: 0.72,
    });
    answerGateway.generate.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield await Promise.resolve(
          'La licencia se tramita conforme a la norma vigente. [1]',
        );
      },
    });

    const events = await collect(service);

    expect(events[1]).toEqual({
      data: {
        sources: [
          expect.objectContaining({
            relatedModuleName: 'Situaciones administrativas',
            relatedSubmoduleName: 'Licencias, permisos y vacaciones',
          }),
        ],
      },
      type: 'sources',
    });
    expect(historyGateway.completeTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        detectedModuleId: rootModuleId,
        detectedSubmoduleId: submoduleId,
        qualitySignals: ['low_confidence'],
      }),
    );
  });

  it('starts an unfiltered answer in the single module resolved by evidence', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      resolvedModule: { id: source.moduleIds[0], name: 'Licencias' },
      sources: [source],
      topRelevanceScore: 0.9,
    });
    answerGateway.generate.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        await Promise.resolve();
        yield 'Respuesta fundada. [1]';
      },
    });

    const events = await collect(service);

    expect(historyGateway.beginTurn).toHaveBeenCalledWith(
      expect.objectContaining({ selectedModuleId: source.moduleIds[0] }),
    );
    expect(events[0]).toEqual({
      data: {
        conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
        moduleId: source.moduleIds[0],
        startedNewConversation: true,
        userMessageId: 'ac8b56af-6d0c-4fef-881e-7c00907540dd',
      },
      type: 'conversation',
    });
  });

  it('does not persist a partial assistant reply after a disconnect', async () => {
    const controller = new AbortController();
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      sources: [source],
      topRelevanceScore: 0.9,
    });
    answerGateway.generate.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        await Promise.resolve();
        controller.abort();
        yield 'Texto parcial';
      },
    });

    const events = await collect(service, { abortSignal: controller.signal });

    // Las fuentes se emiten con el primer fragmento visible; si el cliente se
    // desconecta antes, no se transmiten ni se guarda nada.
    expect(events.map((event) => event.type)).toEqual(['conversation']);
    expect(historyGateway.completeTurn).not.toHaveBeenCalled();
  });

  it('does not decide an outcome when the caller disconnected during retrieval', async () => {
    const controller = new AbortController();
    controller.abort();
    ragService.retrieve.mockResolvedValue({
      kind: 'no_evidence',
      topRelevanceScore: null,
    });

    const events = await collect(service, { abortSignal: controller.signal });

    expect(events).toEqual([]);
    expect(historyGateway.beginTurn).not.toHaveBeenCalled();
    expect(historyGateway.completeTurn).not.toHaveBeenCalled();
  });

  it('fails closed when the provider produces only blank output', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      sources: [source],
      topRelevanceScore: 0.9,
    });
    answerGateway.generate.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        await Promise.resolve();
        yield '   ';
      },
    });

    await expect(collect(service)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(historyGateway.completeTurn).not.toHaveBeenCalled();
  });

  it('caps generated output gracefully and persists the truncated answer (M6)', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      sources: [source],
      topRelevanceScore: 0.9,
    });
    answerGateway.generate.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        await Promise.resolve();
        yield 'x'.repeat(MAX_RAG_ANSWER_CHARS + 1);
      },
    });

    const events = await collect(service);

    // Ya no lanza 503: termina en 'done' con la respuesta recortada al tope.
    expect(events.at(-1)?.type).toBe('done');
    const completionCalls = historyGateway.completeTurn.mock.calls as Array<
      [Parameters<ChatHistoryGateway['completeTurn']>[0]]
    >;
    const completion = completionCalls[0]?.[0];
    expect(completion?.answer.length).toBe(MAX_RAG_ANSWER_CHARS);
  });

  it('truncates the token that straddles the cap and keeps stream and persistence consistent (M6)', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      sources: [source],
      topRelevanceScore: 0.9,
    });
    let pulled = 0;
    answerGateway.generate.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        await Promise.resolve();
        pulled += 1;
        yield 'a'.repeat(ANSWER_CAP - 10);
        pulled += 1;
        yield 'b'.repeat(100); // cruza el tope: solo caben 10, luego se corta
        pulled += 1;
        yield 'c'.repeat(50); // no debe emitirse: el bucle se corta antes
      },
    });

    const events = await collect(service);

    expect(events.at(-1)?.type).toBe('done');
    const streamed = events
      .filter((event) => event.type === 'token')
      .map((event) => event.data.text)
      .join('');
    const completionCalls = historyGateway.completeTurn.mock.calls as Array<
      [Parameters<ChatHistoryGateway['completeTurn']>[0]]
    >;
    const completion = completionCalls[0]?.[0];
    // El tope se aplica al token que cruza el límite, no solo a uno gigante.
    expect(completion?.answer.length).toBe(MAX_RAG_ANSWER_CHARS);
    // Lo transmitido al cliente coincide EXACTAMENTE con lo persistido.
    expect(streamed).toBe(completion?.answer);
    // Tras cruzar el tope se corta el bucle: el token posterior no se transmite
    // y el generador ni siquiera se consume más allá del token que cruzó.
    expect(streamed).not.toContain('cc');
    expect(pulled).toBe(2);
    // El corte se avisa en lenguaje llano (y se guarda igual que se mostró).
    expect(streamed.endsWith(RAG_TRUNCATION_NOTE)).toBe(true);
  });

  it('retains only unambiguous source-module associations and bounds scores', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      sources: [
        {
          ...source,
          moduleIds: [
            source.moduleIds[0],
            '9c8b56af-6d0c-4fef-881e-7c00907540dd',
          ],
          moduleNames: ['Licencias', 'Permisos'],
          semanticScore: 1.5,
        },
      ],
      topRelevanceScore: 1.5,
    });
    answerGateway.generate.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        await Promise.resolve();
        yield 'Respuesta fundada. [1]';
      },
    });

    const events = await collect(service);

    expect(events[1]).toEqual({
      data: {
        sources: [
          expect.objectContaining({
            moduleName: null,
            relevanceScore: 1,
          }),
        ],
      },
      type: 'sources',
    });
    expect(historyGateway.completeTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: [
          expect.objectContaining({ moduleId: null, relevanceScore: 1 }),
        ],
      }),
    );
  });

  it('uses configured history bounds for owned reads and a safe default for lists', async () => {
    const conversationId = '9c8b56af-6d0c-4fef-881e-7c00907540dd';
    configService.get.mockReturnValue(undefined);
    historyGateway.getConversation.mockResolvedValue({ messages: [] });
    historyGateway.listConversations.mockResolvedValue([]);
    historyGateway.listActiveModules.mockResolvedValue([]);

    await expect(
      service.getConversation(conversationId, authorization),
    ).resolves.toEqual({
      messages: [],
    });
    await expect(
      service.listConversations(undefined, undefined, authorization),
    ).resolves.toEqual({ items: [], nextCursor: null });
    await expect(service.listModules()).resolves.toEqual([]);

    // Retomar una conversación carga hasta 100 mensajes (el listado sigue en 20).
    expect(historyGateway.getConversation).toHaveBeenCalledWith({
      conversationId,
      limit: 100,
      userId: authorization.userId,
    });
    expect(historyGateway.listConversations).toHaveBeenCalledWith({
      cursor: null,
      limit: 21,
      userId: authorization.userId,
    });
  });

  it('keeps deletion bound to the authenticated history owner', async () => {
    const conversationId = '9c8b56af-6d0c-4fef-881e-7c00907540dd';
    historyGateway.deleteConversation.mockResolvedValue({
      deletedAt: '2026-08-23T00:00:00.000Z',
      id: conversationId,
    });

    await expect(
      service.deleteConversation(conversationId, authorization),
    ).resolves.toEqual({
      deletedAt: '2026-08-23T00:00:00.000Z',
      id: conversationId,
    });
    expect(historyGateway.deleteConversation).toHaveBeenCalledWith({
      conversationId,
      userId: authorization.userId,
    });
  });

  it('records a technical failure only against the authenticated turn owner', async () => {
    await service.recordTechnicalFailure(
      {
        conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
        errorCode: 'PROVIDER_UNAVAILABLE',
        userMessageId: 'ac8b56af-6d0c-4fef-881e-7c00907540dd',
      },
      authorization,
    );

    expect(historyGateway.recordTechnicalFailure).toHaveBeenCalledWith({
      conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
      errorCode: 'PROVIDER_UNAVAILABLE',
      userId: authorization.userId,
      userMessageId: 'ac8b56af-6d0c-4fef-881e-7c00907540dd',
    });
  });

  it('loads bounded owned history and passes it to retrieval and generation', async () => {
    const conversationId = '9c8b56af-6d0c-4fef-881e-7c00907540dd';
    historyGateway.getConversationContext.mockResolvedValue({
      conversationId,
      messages: [
        { content: 'Necesito una licencia por salud.', role: 'user' },
        { content: 'Respuesta anterior fundada. [1]', role: 'assistant' },
      ],
      selectedModuleId: source.moduleIds[0],
    });
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      resolvedModule: {
        id: source.moduleIds[0],
        name: 'Licencias',
      },
      sources: [source],
      topRelevanceScore: 0.9,
    });
    answerGateway.generate.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        await Promise.resolve();
        yield 'El plazo aplicable está sustentado. [1]';
      },
    });

    await collect(service, {
      conversationId,
      question: '¿Y cuál es el plazo?',
      selectedModuleId: source.moduleIds[0],
    });

    expect(historyGateway.getConversationContext).toHaveBeenCalledWith({
      characterLimit: 10_000,
      conversationId,
      messageLimit: 12,
      userId: authorization.userId,
    });
    expect(ragService.retrieve).toHaveBeenCalledWith(
      '¿Y cuál es el plazo?',
      source.moduleIds[0],
      ['Necesito una licencia por salud.'],
      { forceContext: false },
    );
    expect(answerGateway.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationContext: [
          { content: 'Necesito una licencia por salud.', role: 'user' },
          { content: 'Respuesta anterior fundada. [1]', role: 'assistant' },
        ],
      }),
    );
  });

  it('keeps the stored module when a continuation omits the optional module id', async () => {
    const conversationId = '9c8b56af-6d0c-4fef-881e-7c00907540dd';
    historyGateway.getConversationContext.mockResolvedValue({
      conversationId,
      messages: [{ content: 'Consulta anterior', role: 'user' }],
      selectedModuleId: source.moduleIds[0],
    });
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      resolvedModule: { id: source.moduleIds[0], name: 'Licencias' },
      sources: [source],
      topRelevanceScore: 0.9,
    });
    answerGateway.generate.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        await Promise.resolve();
        yield 'Continuación fundada. [1]';
      },
    });

    await collect(service, {
      conversationId,
      selectedModuleId: null,
    });

    expect(ragService.retrieve).toHaveBeenCalledWith(
      expect.any(String),
      source.moduleIds[0],
      ['Consulta anterior'],
      { forceContext: false },
    );
    expect(historyGateway.beginTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId,
        selectedModuleId: source.moduleIds[0],
      }),
    );
  });

  it('starts a separate conversation when the current question changes modules', async () => {
    const conversationId = '9c8b56af-6d0c-4fef-881e-7c00907540dd';
    const newModuleId = 'dc8b56af-6d0c-4fef-881e-7c00907540dd';
    const newSubmoduleId = 'ec8b56af-6d0c-4fef-881e-7c00907540dd';
    historyGateway.getConversationContext.mockResolvedValue({
      conversationId,
      messages: [{ content: 'Consulta anterior', role: 'user' }],
      selectedModuleId: source.moduleIds[0],
    });
    ragService.retrieve.mockResolvedValue({
      kind: 'topic_change',
      resolvedModule: { id: newModuleId, name: 'Vacaciones' },
      sources: [
        {
          ...source,
          moduleAssociations: [
            {
              rootModuleId: newModuleId,
              rootModuleName: 'Situaciones administrativas',
              submoduleId: newSubmoduleId,
              submoduleName: 'Vacaciones',
            },
          ],
          moduleIds: [newModuleId],
          moduleNames: ['Vacaciones'],
        },
      ],
      topRelevanceScore: 0.92,
    });
    answerGateway.generate.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        await Promise.resolve();
        yield 'Nueva respuesta. [1]';
      },
    });

    const events = await collect(service, {
      conversationId,
      selectedModuleId: source.moduleIds[0],
    });

    expect(historyGateway.beginTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: null,
        selectedModuleId: newModuleId,
      }),
    );
    expect(events[0]).toEqual({
      data: {
        conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
        moduleId: newModuleId,
        startedNewConversation: true,
        userMessageId: 'ac8b56af-6d0c-4fef-881e-7c00907540dd',
      },
      type: 'conversation',
    });
    expect(answerGateway.generate).toHaveBeenCalledWith(
      expect.objectContaining({ conversationContext: [] }),
    );
    expect(historyGateway.completeTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        detectedModuleId: newModuleId,
        detectedSubmoduleId: newSubmoduleId,
      }),
    );
  });

  it('moves an ambiguous topic away from the prior selected-module conversation', async () => {
    const conversationId = '9c8b56af-6d0c-4fef-881e-7c00907540dd';
    historyGateway.getConversationContext.mockResolvedValue({
      conversationId,
      messages: [{ content: 'Consulta anterior', role: 'user' }],
      selectedModuleId: source.moduleIds[0],
    });
    ragService.retrieve.mockResolvedValue({
      kind: 'ambiguous',
      modules: [
        { id: 'module-b', name: 'Nombramiento' },
        { id: 'module-c', name: 'Vacaciones' },
      ],
      sources: [
        {
          ...source,
          moduleIds: ['module-b'],
          moduleNames: ['Nombramiento'],
        },
      ],
      topRelevanceScore: 0.88,
    });

    await collect(service, {
      conversationId,
      selectedModuleId: source.moduleIds[0],
    });

    expect(historyGateway.beginTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: null,
        selectedModuleId: null,
      }),
    );
    expect(answerGateway.generate).not.toHaveBeenCalled();
  });

  it('delegates a citation download with an exact sixty-second TTL', async () => {
    const sourceId = 'cc8b56af-6d0c-4fef-881e-7c00907540dd';
    historyGateway.createSourceDownloadUrl.mockResolvedValue({
      expiresAt: '2026-08-27T12:01:00.000Z',
      sourceId,
      url: 'https://storage.example/signed',
    });

    await expect(
      service.createSourceDownloadUrl(sourceId, authorization),
    ).resolves.toEqual(expect.objectContaining({ sourceId }));
    expect(historyGateway.createSourceDownloadUrl).toHaveBeenCalledWith({
      sourceId,
      ttlSeconds: 60,
      userId: authorization.userId,
    });
  });

  it('propagates an unavailable provider rather than inventing an answer', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      sources: [source],
      topRelevanceScore: 0.9,
    });
    answerGateway.generate.mockImplementation(() => {
      throw new ServiceUnavailableException();
    });

    await expect(collect(service)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(historyGateway.completeTurn).not.toHaveBeenCalled();
  });
});

describe('evaluateAnswerCitationQuality', () => {
  it('flags no evidence, unsupported claims and mismatched citations for review', () => {
    expect(
      evaluateAnswerCitationQuality(
        'La licencia se solicita mediante procedimiento institucional vigente. [1]',
        [source],
      ),
    ).toEqual([]);
    expect(
      evaluateAnswerCitationQuality(
        'La licencia se concede automáticamente durante treinta días sin condición.',
        [source],
      ),
    ).toEqual(['support_partial']);
    expect(
      evaluateAnswerCitationQuality(
        'La remuneración aumenta por completo en todos los supuestos. [2]',
        [source],
      ),
    ).toEqual(['citation_insufficient']);
    expect(
      evaluateAnswerCitationQuality('No existe sustento disponible.', []),
    ).toEqual(['support_insufficient']);
    expect(
      evaluateAnswerCitationQualityDetails(
        'La licencia se concede automáticamente durante treinta días sin condición.',
        [source],
      ),
    ).toEqual({
      excerpts: {
        support_partial:
          'La licencia se concede automáticamente durante treinta días sin condición.',
      },
      signals: ['support_partial'],
    });
  });
});
