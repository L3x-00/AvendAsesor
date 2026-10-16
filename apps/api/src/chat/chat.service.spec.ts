import { ServiceUnavailableException } from '@nestjs/common';
import type { AuthorizationContext } from '../authorization';
import {
  MAX_RAG_ANSWER_CHARS,
  RAG_NO_EVIDENCE_MESSAGE,
} from '../rag/rag.constants';
import {
  ChatService,
  RAG_TRUNCATION_NOTE,
  evaluateAnswerCitationQuality,
  evaluateAnswerCitationQualityDetails,
  incompleteExactReferencesMessage,
  missingExactReferencesMessage,
  noEvidenceMessage,
  type ChatStreamEvent,
} from './chat.service';
import type { ChatHistoryGateway } from './chat-history.gateway';
import { buildConversationalReply } from './intent/conversational-replies';

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
    createCatalogDocumentDownloadUrl: jest.Mock;
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
      createCatalogDocumentDownloadUrl: jest.fn(),
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

  it('sin señal educativa y sin proveedor responde con la plantilla del alcance', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'no_evidence',
      topRelevanceScore: null,
    });

    await expect(
      collect(service, {
        question: '¿Cuál es la mejor época para sembrar papa?',
      }),
    ).resolves.toEqual([
      {
        data: {
          conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
          moduleId: null,
          startedNewConversation: true,
          userMessageId: 'ac8b56af-6d0c-4fef-881e-7c00907540dd',
        },
        type: 'conversation',
      },
      {
        data: { message: buildConversationalReply('unrelated_no_evidence') },
        type: 'no_evidence',
      },
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

  it('un pedido aparentemente ajeno usa una plantilla segura sin consultar al modelo', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'no_evidence',
      topRelevanceScore: null,
    });
    answerGateway.generate.mockReturnValue(
      (async function* () {
        await Promise.resolve();
        yield '[[FUERA_DE_AMBITO]] Me parece divertido que quieras preparar un ';
        yield 'arroz chaufa, pero mi objetivo es orientarte en temas del ámbito educativo.';
      })(),
    );

    // El clasificador no lo reconoce como ajeno. La ruta sin evidencia no
    // permite que el modelo complete una respuesta factual sin fuentes.
    const events = await collect(service, {
      question: '¿Qué opinas del arroz chaufa con harto sillao?',
    });

    const reply = events.find((event) => event.type === 'no_evidence');
    expect(reply?.data.message).toBe(
      buildConversationalReply('unrelated_no_evidence'),
    );
    expect(events.at(-1)).toMatchObject({
      data: { provider: 'rule' },
      type: 'done',
    });
    expect(answerGateway.generate).not.toHaveBeenCalled();
    expect(historyGateway.completeTurn).toHaveBeenCalledWith(
      expect.objectContaining({ qualitySignals: [], replyRole: 'no_evidence' }),
    );
  });

  it('ignora cualquier respuesta preparada por el proveedor en no_evidence', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'no_evidence',
      topRelevanceScore: null,
    });
    answerGateway.generate.mockReturnValue(
      (async function* () {
        await Promise.resolve();
        yield 'Según el artículo 49, tienes 5 días. [1]';
      })(),
    );

    const events = await collect(service, {
      question: '¿Qué opinas del arroz chaufa con harto sillao?',
    });

    const reply = events.find((event) => event.type === 'no_evidence');
    expect(reply?.data.message).toBe(
      buildConversationalReply('unrelated_no_evidence'),
    );
    expect(reply?.data.message).not.toContain('artículo 49');
    expect(answerGateway.generate).not.toHaveBeenCalled();
  });

  it('un pedido ajeno detectado por el clasificador recibe la respuesta amable sin turno', async () => {
    answerGateway.generate.mockReturnValue(
      (async function* () {
        await Promise.resolve();
        yield '[[FUERA_DE_AMBITO]] ¡Qué rico suena un arroz chaufa! Pero mi objetivo es orientarte en temas educativos.';
      })(),
    );

    const events = await collect(service, {
      question: '¿Cómo puedo preparar un arroz chaufa?',
    });

    expect(events).toEqual([
      {
        data: {
          message:
            '¡Qué rico suena un arroz chaufa! Pero mi objetivo es orientarte en temas educativos.',
        },
        type: 'conversational',
      },
    ]);
    expect(ragService.retrieve).not.toHaveBeenCalled();
    expect(historyGateway.beginTurn).not.toHaveBeenCalled();
  });

  it('si el proveedor falla, un pedido ajeno recibe la plantilla amable', async () => {
    answerGateway.generate.mockImplementation(() => {
      throw new Error('provider down');
    });

    const events = await collect(service, {
      question: '¿Cómo puedo preparar un arroz chaufa?',
    });

    expect(events).toEqual([
      {
        data: { message: buildConversationalReply('out_of_domain') },
        type: 'conversational',
      },
    ]);
  });

  it('sin sustento responde de forma determinística y no genera hechos', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'no_evidence',
      topRelevanceScore: null,
    });
    answerGateway.generate.mockReturnValue(
      (async function* () {
        await Promise.resolve();
        yield 'Suele corresponder presentar la solicitud por mesa de partes.';
      })(),
    );

    const events = await collect(service);

    expect(events.map((event) => event.type)).toEqual([
      'conversation',
      'no_evidence',
      'done',
    ]);
    const noEvidence = events[1] as { data: { message: string } };
    expect(noEvidence.data.message).toBe(noEvidenceMessage('current'));
    expect(noEvidence.data.message).not.toContain('mesa de partes');
    expect(answerGateway.generate).not.toHaveBeenCalled();
    expect(historyGateway.completeTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        qualitySignals: [],
        replyRole: 'no_evidence',
        sources: [],
        unansweredReason: 'insufficient_evidence',
      }),
    );
  });

  it('no invoca al proveedor cuando falta evidencia', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'no_evidence',
      topRelevanceScore: null,
    });
    answerGateway.generate.mockImplementation(() => {
      throw new Error('provider down');
    });

    const events = await collect(service);

    expect(events.map((event) => event.type)).toEqual([
      'conversation',
      'no_evidence',
      'done',
    ]);
    expect(historyGateway.completeTurn).toHaveBeenCalledWith(
      expect.objectContaining({ replyRole: 'no_evidence' }),
    );
    expect(answerGateway.generate).not.toHaveBeenCalled();
  });

  it('no permite cifras ni citas preparadas por el proveedor sin fuentes', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'no_evidence',
      topRelevanceScore: null,
    });
    answerGateway.generate.mockReturnValue(
      (async function* () {
        await Promise.resolve();
        yield 'Según el artículo 49, tienes 5 días. [1]';
      })(),
    );

    const events = await collect(service);
    const reply = events.find((event) => event.type === 'no_evidence');
    expect(reply?.data.message).toContain('no encontré información suficiente');
    expect(reply?.data.message).not.toContain('artículo 49');
    expect(historyGateway.completeTurn).toHaveBeenCalledWith(
      expect.objectContaining({ replyRole: 'no_evidence', sources: [] }),
    );
    expect(answerGateway.generate).not.toHaveBeenCalled();
  });

  it('explica sin sustituir cuando falta una norma nombrada exactamente', async () => {
    const missing = [
      { display: 'RSG N.° 326-2017-MINEDU', key: '3262017MINEDU' },
    ];
    ragService.retrieve.mockResolvedValue({
      kind: 'no_evidence',
      missingExactReferences: missing,
      topRelevanceScore: null,
    });

    const events = await collect(service, {
      question: '¿Qué dispone la RSG N.° 326-2017-MINEDU?',
    });

    const reply = events.find((event) => event.type === 'no_evidence');
    expect(reply?.data.message).toBe(missingExactReferencesMessage(missing));
    expect(reply?.data.message).toContain('no usaré documentos parecidos');
    expect(answerGateway.generate).not.toHaveBeenCalled();
    expect(events.at(-1)).toMatchObject({
      data: { provider: 'rule' },
      type: 'done',
    });
  });

  it('pide completar una referencia normativa sin consultar al proveedor', async () => {
    const incomplete = [
      {
        complete: false,
        display: 'DS N.° 074-2019',
        documentType: 'DECRETO_SUPREMO',
        key: '0742019',
        lookupKey: 'DS:0742019',
      },
    ];
    ragService.retrieve.mockResolvedValue({
      incompleteExactReferences: incomplete,
      kind: 'no_evidence',
      topRelevanceScore: null,
    });

    const events = await collect(service, {
      question: '¿Qué dispone el DS 074-2019?',
    });

    const reply = events.find((event) => event.type === 'no_evidence');
    expect(reply?.data.message).toBe(
      incompleteExactReferencesMessage(incomplete),
    );
    expect(reply?.data.message).toContain('año y la entidad emisora');
    expect(answerGateway.generate).not.toHaveBeenCalled();
    expect(events.at(-1)).toMatchObject({
      data: { provider: 'rule' },
      type: 'done',
    });
  });

  it('no divulga el inventario de documentos cuando falta evidencia', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'no_evidence',
      topRelevanceScore: null,
    });
    const withCatalog = new ChatService(
      answerGateway,
      historyGateway,
      ragService as never,
      configService as never,
      faqMemoryService as never,
      undefined,
    );
    const messageOf = async () => {
      const event = (
        await collect(withCatalog, {
          question:
            '¿Cuál es el plazo para presentar la solicitud de licencia?',
        })
      ).find((item) => item.type === 'no_evidence');
      if (!event || event.type !== 'no_evidence') {
        throw new Error('Expected a no_evidence event.');
      }
      return event.data.message;
    };

    const withCoverage = await messageOf();
    expect(withCoverage).toContain('antecedente');
    expect(withCoverage).not.toContain('Remuneraciones');
    expect(historyGateway.completeTurn).toHaveBeenCalledWith(
      expect.objectContaining({ answer: withCoverage }),
    );
    expect(await messageOf()).toBe(noEvidenceMessage('current'));
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

  it('answers «¿puedo saber la página del minedu?» with the official link, without RAG', async () => {
    // Observación del PO (2026-10-08): dentro de una conversación sobre
    // auxiliares, la pregunta llegaba al RAG y solo aparecía enlazada la UGEL.
    const events = await collect(service, {
      conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
      question: 'puedo saber la pagina del minedu',
    });

    expect(events).toHaveLength(1);
    const [event] = events;
    if (!event || event.type !== 'conversational') {
      throw new Error('Expected a conversational event.');
    }
    expect(event.data.message).toContain(
      '[Página oficial del Ministerio de Educación (MINEDU)](https://www.gob.pe/minedu)',
    );
    expect(event.data.message).not.toMatch(/ugel/iu);
    expect(event.data.message).not.toContain('bit.ly');
    expect(ragService.retrieve).not.toHaveBeenCalled();
    expect(historyGateway.beginTurn).not.toHaveBeenCalled();
    expect(answerGateway.generate).not.toHaveBeenCalled();
  });

  it('answers «¿de qué tienes información?» with the document catalog and suggestions', async () => {
    const catalogService = {
      reply: jest.fn().mockResolvedValue({
        documents: [
          {
            documentType: 'ANEXO',
            id: '1c8b56af-6d0c-4fef-881e-7c00907540dd',
            issuanceYear: 2026,
            mimeType: 'application/pdf',
            moduleIds: ['cargos'],
            moduleNames: ['Cargos y plazas'],
            originalFileName: 'anexo.pdf',
            pageCount: 2,
            resolutionNumber: null,
            sectionTitles: [],
            title: 'Anexo de cargos',
            versionId: '2c8b56af-6d0c-4fef-881e-7c00907540dd',
          },
        ],
        message: '¡Claro! Hoy puedo responderte con este documento…',
        suggestions: ['¿Qué funciones tiene el Coordinador Pedagógico?'],
      }),
    };
    const withCatalog = new ChatService(
      answerGateway,
      historyGateway,
      ragService as never,
      configService as never,
      faqMemoryService as never,
      catalogService as never,
    );

    const events = await collect(withCatalog, {
      question: '¿De qué tienes información?',
    });

    expect(events).toEqual([
      {
        data: {
          documents: [
            {
              documentId: '1c8b56af-6d0c-4fef-881e-7c00907540dd',
              documentType: 'ANEXO',
              issuanceYear: 2026,
              mimeType: 'application/pdf',
              originalFileName: 'anexo.pdf',
              pageCount: 2,
              resolutionNumber: null,
              title: 'Anexo de cargos',
              versionId: '2c8b56af-6d0c-4fef-881e-7c00907540dd',
            },
          ],
          message: '¡Claro! Hoy puedo responderte con este documento…',
          suggestions: ['¿Qué funciones tiene el Coordinador Pedagógico?'],
        },
        type: 'conversational',
      },
    ]);
    expect(ragService.retrieve).not.toHaveBeenCalled();
    expect(historyGateway.beginTurn).not.toHaveBeenCalled();
    expect(catalogService.reply).toHaveBeenCalledWith(undefined, {
      question: '¿De qué tienes información?',
      selectedModuleId: null,
    });
  });

  it('resuelve archivos por categoría contra el catálogo y no contra el RAG', async () => {
    const catalogService = {
      reply: jest.fn().mockResolvedValue({
        documents: [],
        message: 'Encontré los anexos disponibles.',
        suggestions: [],
      }),
    };
    const withCatalog = new ChatService(
      answerGateway,
      historyGateway,
      ragService as never,
      configService as never,
      faqMemoryService as never,
      catalogService as never,
    );
    const selectedModuleId = '3c8b56af-6d0c-4fef-881e-7c00907540dd';

    const events = await collect(withCatalog, {
      question: 'Descárgame los anexos',
      selectedModuleId,
    });

    expect(events).toEqual([
      {
        data: { documents: [], message: 'Encontré los anexos disponibles.' },
        type: 'conversational',
      },
    ]);
    expect(catalogService.reply).toHaveBeenCalledWith(undefined, {
      question: 'Descárgame los anexos',
      selectedModuleId,
    });
    expect(ragService.retrieve).not.toHaveBeenCalled();
  });

  it('falls back to the topics reply if the catalog cannot be read', async () => {
    historyGateway.listActiveModules.mockResolvedValue([]);
    const withCatalog = new ChatService(
      answerGateway,
      historyGateway,
      ragService as never,
      configService as never,
      faqMemoryService as never,
      { reply: jest.fn().mockRejectedValue(new Error('db down')) } as never,
    );

    const [event] = await collect(withCatalog, {
      question: '¿Qué documentos tienes?',
    });

    if (!event || event.type !== 'conversational') {
      throw new Error('Expected a conversational event.');
    }
    expect(event.data.message).toContain('documentos oficiales');
    expect(event.data.suggestions).toBeUndefined();
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

  it('records a professional ambiguity clarification without exposing raw citations', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'ambiguous',
      modules: [{ id: source.moduleIds[0], name: 'Licencias' }],
      sources: [source],
      topRelevanceScore: 0.9,
    });

    const events = await collect(service);

    expect(events.map((event) => event.type)).toEqual([
      'conversation',
      'clarification',
      'done',
    ]);
    const clarification = events[1];
    expect(clarification?.type).toBe('clarification');
    if (!clarification || clarification.type !== 'clarification') {
      throw new Error('Expected a clarification event.');
    }
    expect(clarification.data.message).toContain('identificar el trámite');
    expect(clarification.data.message).toContain('Licencias');
    expect(clarification.data.message).not.toContain(source.chunkContent);
    expect(clarification.data.message).not.toMatch(/\[\d+\]/u);
    expect(clarification.data.message.match(/\?/gu)).toHaveLength(1);
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
    expect(completion?.sources).toEqual([]);
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

  it('pide un único dato en una ambigüedad salarial sin acumular condiciones', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'ambiguous',
      modules: [{ id: source.moduleIds[0], name: 'Remuneraciones' }],
      sources: [source],
      topRelevanceScore: 0.9,
    });

    const events = await collect(service, {
      question: '¿Cuánto gana un profesor en Perú?',
    });
    const clarification = events.find(
      (event) => event.type === 'clarification',
    );
    if (!clarification || clarification.type !== 'clarification') {
      throw new Error('Expected a clarification event.');
    }

    expect(clarification.data.message).toContain('sector público o privado');
    expect(clarification.data.message.match(/\?/gu)).toHaveLength(1);
    expect(clarification.data.message).not.toContain('nombrado o contratado');
  });

  describe('aclaración de una sola condición en la ruta de ambigüedad y de cambio de tema', () => {
    const causalSources = [
      {
        ...source,
        chunkContent:
          'La reasignación por salud requiere el informe médico del establecimiento.',
        chunkId: 'cc8b56af-6d0c-4fef-881e-7c00907540dd',
        documentVersionId: 'dc8b56af-6d0c-4fef-881e-7c00907540dd',
      },
      {
        ...source,
        chunkContent:
          'La reasignación por emergencia se acredita con la declaratoria correspondiente.',
        chunkId: 'ec8b56af-6d0c-4fef-881e-7c00907540dd',
        documentVersionId: 'fc8b56af-6d0c-4fef-881e-7c00907540dd',
      },
    ];

    it('en una ambigüedad pide la causal en vez del mensaje genérico', async () => {
      ragService.retrieve.mockResolvedValue({
        kind: 'ambiguous',
        modules: [{ id: source.moduleIds[0], name: 'Desplazamientos' }],
        sources: causalSources,
        topRelevanceScore: 0.9,
      });

      const events = await collect(service, {
        question: '¿Cuáles son los requisitos de la reasignación?',
      });
      const clarification = events.find(
        (event) => event.type === 'clarification',
      );
      if (!clarification || clarification.type !== 'clarification') {
        throw new Error('Expected a clarification event.');
      }

      expect(clarification.data.message).toContain('causal');
      expect(clarification.data.message).not.toContain(
        'identificar el trámite',
      );
      expect(clarification.data.message.match(/\?/gu)).toHaveLength(1);
      expect(clarification.data.message).not.toMatch(/\[\d+\]/u);
      expect(answerGateway.generate).not.toHaveBeenCalled();
      const completionCalls = historyGateway.completeTurn.mock.calls as Array<
        [Parameters<ChatHistoryGateway['completeTurn']>[0]]
      >;
      expect(completionCalls[0]?.[0].sources).toEqual([]);
    });

    it('en un cambio de tema pide la causal sin mostrar fuentes ni generar', async () => {
      ragService.retrieve.mockResolvedValue({
        kind: 'topic_change',
        resolvedModule: { id: source.moduleIds[0], name: 'Desplazamientos' },
        sources: causalSources,
        topRelevanceScore: 0.9,
      });

      const events = await collect(service, {
        question: '¿Cuáles son los requisitos de la reasignación?',
      });

      expect(events.map((event) => event.type)).not.toContain('sources');
      const clarification = events.find(
        (event) => event.type === 'clarification',
      );
      if (!clarification || clarification.type !== 'clarification') {
        throw new Error('Expected a clarification event.');
      }
      expect(clarification.data.message).toContain('causal');
      expect(answerGateway.generate).not.toHaveBeenCalled();
    });

    // H-3: la respuesta a una aclaración no repite la consulta salarial; el
    // siguiente dato que decide la cifra se pide con los factores heredados.
    it('tras responder «Sector público» pide la jornada de la consulta salarial previa', async () => {
      const conversationId = '9c8b56af-6d0c-4fef-881e-7c00907540dd';
      historyGateway.getConversationContext.mockResolvedValue({
        conversationId,
        messages: [
          { content: '¿Cuánto gana un profesor en el Perú?', role: 'user' },
          {
            content: 'Necesito un solo dato: ¿es del sector público o privado?',
            role: 'clarification',
          },
        ],
        selectedModuleId: null,
      });
      ragService.retrieve.mockResolvedValue({
        kind: 'evidence',
        sources: [30, 40].map((hours) => ({
          ...source,
          chunkContent: `La remuneración mensual del profesor de jornada de ${hours} horas es de S/ ${hours} 000,00.`,
          chunkId: `${hours}c8b56af-6d0c-4fef-881e-7c00907540dd`,
          documentVersionId: `${hours}d8b56af-6d0c-4fef-881e-7c00907540dd`,
        })),
        topRelevanceScore: 0.9,
      });

      const events = await collect(service, {
        conversationId,
        question: 'Sector público',
      });
      const clarification = events.find(
        (event) => event.type === 'clarification',
      );
      if (!clarification || clarification.type !== 'clarification') {
        throw new Error('Expected a clarification event.');
      }

      expect(clarification.data.message).toContain('jornada');
      expect(answerGateway.generate).not.toHaveBeenCalled();
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
        yield 'La licencia se solicita mediante procedimiento institucional [1]. ';
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

  it('corrige «renumeración» solo para buscar y conserva el texto original en el historial', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      sources: [source],
      topRelevanceScore: 0.9,
    });
    answerGateway.generate.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        await Promise.resolve();
        yield 'Tu remuneración mensual está sustentada. [1]';
      },
    });

    await collect(service, { question: '¿Cuánto es mi renumeración mensual?' });

    // La búsqueda usa la palabra corregida…
    expect(ragService.retrieve).toHaveBeenCalledWith(
      '¿Cuánto es mi remuneración mensual?',
      null,
      [],
      { forceContext: false },
    );
    // …y el historial conserva exactamente lo que escribió la persona.
    expect(historyGateway.beginTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        question: '¿Cuánto es mi renumeración mensual?',
      }),
    );
  });

  it('no reescribe un término jurídico válido por similitud con el catálogo', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'no_evidence',
      topRelevanceScore: null,
    });

    await collect(service, {
      question: '¿Cómo solicito la rectificación del acto?',
    });

    expect(ragService.retrieve).toHaveBeenCalledWith(
      '¿Cómo solicito la rectificación del acto?',
      null,
      [],
      { forceContext: false },
    );
  });

  it('pide la causal de la reasignación con una sola pregunta y sin generar la respuesta', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      sources: [
        {
          ...source,
          chunkContent:
            'La reasignación por salud requiere el informe médico del establecimiento.',
          chunkId: 'cc8b56af-6d0c-4fef-881e-7c00907540dd',
          documentVersionId: 'dc8b56af-6d0c-4fef-881e-7c00907540dd',
        },
        {
          ...source,
          chunkContent:
            'La reasignación por emergencia se acredita con la declaratoria correspondiente.',
          chunkId: 'ec8b56af-6d0c-4fef-881e-7c00907540dd',
          documentVersionId: 'fc8b56af-6d0c-4fef-881e-7c00907540dd',
        },
      ],
      topRelevanceScore: 0.9,
    });

    const events = await collect(service, {
      question: '¿Cuáles son los requisitos de la reasignación?',
    });

    expect(events.map((event) => event.type)).toEqual([
      'conversation',
      'clarification',
      'done',
    ]);
    const clarification = events.find(
      (event) => event.type === 'clarification',
    );
    if (!clarification || clarification.type !== 'clarification') {
      throw new Error('Expected a clarification event.');
    }
    expect(clarification.data.message).toContain('motivo');
    expect(clarification.data.message).toContain('salud');
    expect(clarification.data.message).toContain('emergencia');
    expect(clarification.data.message.match(/\?/gu)).toHaveLength(1);
    expect(clarification.data.modules).toEqual([]);
    expect(answerGateway.generate).not.toHaveBeenCalled();
    expect(historyGateway.completeTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        qualitySignals: [],
        replyRole: 'clarification',
        sources: [],
        unansweredReason: 'ambiguous_request',
      }),
    );
    // La pregunta original queda en el historial para recuperar el contexto.
    expect(historyGateway.beginTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        question: '¿Cuáles son los requisitos de la reasignación?',
      }),
    );
  });

  it('pide la jornada cuando la evidencia vigente tiene dos montos incompatibles', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      sources: [
        {
          ...source,
          chunkContent:
            'La remuneración mensual del docente con jornada de 30 horas es de S/ 3 300,60.',
          chunkId: 'cc8b56af-6d0c-4fef-881e-7c00907540dd',
          documentVersionId: 'dc8b56af-6d0c-4fef-881e-7c00907540dd',
        },
        {
          ...source,
          chunkContent:
            'La remuneración mensual del docente con jornada de 40 horas es de S/ 4 400,80.',
          chunkId: 'ec8b56af-6d0c-4fef-881e-7c00907540dd',
          documentVersionId: 'fc8b56af-6d0c-4fef-881e-7c00907540dd',
        },
      ],
      topRelevanceScore: 0.9,
    });

    const events = await collect(service, {
      question: '¿Cuánto gana un docente?',
    });

    const clarification = events.find(
      (event) => event.type === 'clarification',
    );
    if (!clarification || clarification.type !== 'clarification') {
      throw new Error('Expected a clarification event.');
    }
    expect(clarification.data.message).toContain('30');
    expect(clarification.data.message).toContain('40');
    expect(
      events.some(
        (event) => event.type === 'token' || event.type === 'sources',
      ),
    ).toBe(false);
    expect(answerGateway.generate).not.toHaveBeenCalled();
  });

  it('marca para revisión una respuesta salarial que cita solo un concepto adicional', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      sources: [
        {
          ...source,
          chunkContent:
            'Artículo 5. La remuneración mensual del docente es de S/ 3 300,60.',
          chunkId: 'cc8b56af-6d0c-4fef-881e-7c00907540dd',
          documentVersionId: 'dc8b56af-6d0c-4fef-881e-7c00907540dd',
        },
        {
          ...source,
          chunkContent:
            'Artículo 5. La asignación por tiempo de servicio es de S/ 2 666,80.',
          chunkId: 'ec8b56af-6d0c-4fef-881e-7c00907540dd',
          documentVersionId: 'fc8b56af-6d0c-4fef-881e-7c00907540dd',
        },
      ],
      topRelevanceScore: 0.9,
    });
    answerGateway.generate.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        await Promise.resolve();
        yield 'Tu remuneración mensual es de S/ 2 666,80. [2]';
      },
    });

    await collect(service, { question: '¿Cuánto es mi remuneración mensual?' });

    const completionCalls = historyGateway.completeTurn.mock.calls as Array<
      [Parameters<ChatHistoryGateway['completeTurn']>[0]]
    >;
    const completion = completionCalls[0]?.[0];
    expect(completion?.qualitySignals).toContain('support_partial');
    expect(completion?.qualityExcerpts?.support_partial).toBe(
      'Tu remuneración mensual es de S/ 2 666,80. [2]',
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
        yield `[1] ${'x'.repeat(MAX_RAG_ANSWER_CHARS + 1)}`;
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
        yield `[1] ${'a'.repeat(ANSWER_CAP - 14)}`;
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

  it.each(['Quiero descargar el primer documento', 'Quiero descargarlos'])(
    'usa el documento de la respuesta anterior al pedir «%s»',
    async (question) => {
      const conversationId = '9c8b56af-6d0c-4fef-881e-7c00907540dd';
      historyGateway.getConversationContext.mockResolvedValue({
        conversationId,
        messages: [
          { content: '¿Qué documentos tienes sobre cargos?', role: 'user' },
          {
            content:
              'El primer documento es Resolución de cargos docentes. [1]',
            role: 'assistant',
          },
          { content: 'Con gusto, dime qué necesitas.', role: 'assistant' },
        ],
        selectedModuleId: null,
      });
      ragService.retrieve.mockResolvedValue({
        kind: 'no_evidence',
        topRelevanceScore: null,
      });

      await collect(service, {
        conversationId,
        question,
      });

      expect(ragService.retrieve).toHaveBeenCalledWith(
        question,
        null,
        [
          '¿Qué documentos tienes sobre cargos?',
          'Respuesta anterior: El primer documento es Resolución de cargos docentes. [1]',
        ],
        { forceContext: true },
      );
    },
  );

  it('no arrastra documentos anteriores al pedir una resolución con número propio', async () => {
    const conversationId = '9c8b56af-6d0c-4fef-881e-7c00907540dd';
    historyGateway.getConversationContext.mockResolvedValue({
      conversationId,
      messages: [
        { content: '¿Qué documentos tienes sobre cargos?', role: 'user' },
        { content: 'Resolución de cargos docentes. [1]', role: 'assistant' },
      ],
      selectedModuleId: null,
    });
    ragService.retrieve.mockResolvedValue({
      kind: 'no_evidence',
      topRelevanceScore: null,
    });

    await collect(service, {
      conversationId,
      question: 'Quiero ver esa RM 123',
    });

    expect(ragService.retrieve).toHaveBeenCalledWith(
      'Quiero ver esa resolución ministerial 123',
      null,
      ['¿Qué documentos tienes sobre cargos?'],
      { forceContext: false },
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

  it('pide la causal en la conversación nueva cuando el cambio de módulo solo recupera una regla especial', async () => {
    const conversationId = '9c8b56af-6d0c-4fef-881e-7c00907540dd';
    const newModuleId = 'dc8b56af-6d0c-4fef-881e-7c00907540dd';
    historyGateway.getConversationContext.mockResolvedValue({
      conversationId,
      messages: [{ content: 'Consulta anterior', role: 'user' }],
      selectedModuleId: source.moduleIds[0],
    });
    ragService.retrieve.mockResolvedValue({
      kind: 'topic_change',
      resolvedModule: { id: newModuleId, name: 'Reasignación' },
      sources: [
        {
          ...source,
          chunkContent:
            'La reasignación por salud requiere el informe médico del establecimiento.',
          moduleIds: [newModuleId],
          moduleNames: ['Reasignación'],
        },
      ],
      topRelevanceScore: 0.92,
    });

    const events = await collect(service, {
      conversationId,
      question: '¿Cuáles son los requisitos de la reasignación?',
      selectedModuleId: source.moduleIds[0],
    });

    expect(historyGateway.beginTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: null,
        selectedModuleId: newModuleId,
      }),
    );
    expect(events.map((event) => event.type)).toEqual([
      'conversation',
      'clarification',
      'done',
    ]);
    const clarification = events.find(
      (event) => event.type === 'clarification',
    );
    if (!clarification || clarification.type !== 'clarification') {
      throw new Error('Expected a clarification event.');
    }
    expect(clarification.data.message).toContain('salud');
    expect(clarification.data.message.match(/\?/gu)).toHaveLength(1);
    expect(answerGateway.generate).not.toHaveBeenCalled();
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
      disposition: 'inline',
      sourceId,
      ttlSeconds: 60,
      userId: authorization.userId,
    });

    await service.createSourceDownloadUrl(
      sourceId,
      authorization,
      'attachment',
    );
    expect(historyGateway.createSourceDownloadUrl).toHaveBeenLastCalledWith({
      disposition: 'attachment',
      sourceId,
      ttlSeconds: 60,
      userId: authorization.userId,
    });
  });

  it('delega una descarga del catálogo con TTL de sesenta segundos', async () => {
    const versionId = 'dc8b56af-6d0c-4fef-881e-7c00907540dd';
    historyGateway.createCatalogDocumentDownloadUrl.mockResolvedValue({
      expiresAt: '2026-10-05T20:01:00.000Z',
      url: 'https://storage.example/signed',
      versionId,
    });

    await expect(
      service.createCatalogDocumentDownloadUrl(versionId, authorization),
    ).resolves.toEqual(expect.objectContaining({ versionId }));
    expect(
      historyGateway.createCatalogDocumentDownloadUrl,
    ).toHaveBeenCalledWith({
      documentVersionId: versionId,
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
    // Una cita agrupada tras el punto pertenece a esa frase (revisión 3).
    expect(
      evaluateAnswerCitationQuality(
        'La licencia se solicita mediante procedimiento institucional vigente. [1, 1]',
        [source],
      ),
    ).toEqual([]);
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

  it('cubre una lista con la cita de bloque aunque el modelo separe los elementos', () => {
    const requisitosSource = {
      ...source,
      chunkContent:
        'Para postular como auxiliar de educación debes cumplir los requisitos generales de estudios, salud y edad que exige la norma.',
    };
    const answer = [
      'Para postular como auxiliar de educación debes cumplir los requisitos generales. [1]',
      '',
      '1. Acreditar estudios superiores: debes presentar un título o certificado que demuestre que culminaste el sexto ciclo de estudios pedagógicos.',
      '',
      '1. Salud física y mental: es necesario gozar de buena salud y presentar una declaración jurada original.',
      '',
      '1. Edad: debes tener menos de 70 años al momento de postular y presentar una declaración jurada.',
    ].join('\n');

    expect(evaluateAnswerCitationQuality(answer, [requisitosSource])).toEqual(
      [],
    );
  });

  it('mantiene la exigencia de cita en la prosa fuera de las listas', () => {
    const answer =
      'La licencia se solicita mediante procedimiento institucional vigente. Además, el trámite demora treinta días calendario en total. [1]';

    expect(evaluateAnswerCitationQuality(answer, [source])).toContain(
      'support_partial',
    );
  });

  it('no cubre la prosa pegada a una lista: solo los ítems de la misma fuente', () => {
    const answer = [
      'La licencia se concede automáticamente durante treinta días sin condición.',
      '',
      '1. Presenta la solicitud de licencia por procedimiento institucional. [1]',
    ].join('\n');

    expect(evaluateAnswerCitationQuality(answer, [source])).toEqual([
      'support_partial',
    ]);
  });

  it('no marca una oración envuelta partida por un salto de línea', () => {
    const answer =
      'La licencia se solicita mediante procedimiento\ninstitucional vigente. [1]';

    expect(evaluateAnswerCitationQuality(answer, [source])).toEqual([]);
  });

  it('acepta la corroboración de dos documentos citados juntos', () => {
    const corroboratingSource = {
      ...source,
      chunkId: '6c8b56af-6d0c-4fef-881e-7c00907540dd',
      documentId: '8c8b56af-6d0c-4fef-881e-7c00907540dd',
      documentTitle: 'Resolución Viceministerial de licencias',
      documentVersionId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
    };
    const answer =
      'La licencia se solicita mediante procedimiento institucional vigente. [1][2]';

    expect(
      evaluateAnswerCitationQuality(answer, [source, corroboratingSource]),
    ).toEqual([]);
  });

  it('no exige cita para una pregunta de cierre', () => {
    const answer =
      'La licencia se solicita mediante procedimiento institucional vigente. [1]\n\n¿Te gustaría saber qué documentos debes presentar?';

    expect(evaluateAnswerCitationQuality(answer, [source])).toEqual([]);
  });
});
