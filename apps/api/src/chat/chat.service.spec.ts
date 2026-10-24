import { ServiceUnavailableException } from '@nestjs/common';
import type { AuthorizationContext } from '../authorization';
import {
  MAX_CHAT_CONTEXT_MESSAGES,
  MAX_RAG_ANSWER_CHARS,
  RAG_NO_EVIDENCE_MESSAGE,
} from '../rag/rag.constants';
import {
  ChatService,
  CHAT_CONVERSATION_MESSAGE_LIMIT,
  RAG_TRUNCATION_NOTE,
  evaluateAnswerCitationQuality,
  evaluateAnswerCitationQualityDetails,
  incompleteExactReferencesMessage,
  missingExactReferencesMessage,
  noEvidenceMessage,
  salaryQuestionsForTurn,
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

  it('acepta con «sí» la propuesta pendiente y la busca como consulta', async () => {
    historyGateway.getConversationContext.mockResolvedValue({
      conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
      messages: [
        { content: '¿Cuánto gana un docente contratado?', role: 'user' },
        {
          content:
            'La remuneración es S/ 3,500.70. [1]\n\nSugerencias: ¿Te gustaría saber qué documentos debes presentar para acceder a estos cargos?',
          role: 'assistant',
        },
      ],
      selectedModuleId: null,
    });
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      resolvedModule: { id: source.moduleIds[0], name: 'Remuneraciones' },
      sources: [source],
      topRelevanceScore: 0.9,
    });
    answerGateway.generate.mockReturnValue(
      (async function* () {
        await Promise.resolve();
        yield 'Los documentos exigidos son el DNI y el título profesional. [1]';
      })(),
    );

    const events = await collect(service, {
      conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
      question: 'sí',
    });

    expect(ragService.retrieve).toHaveBeenCalledWith(
      '¿Qué documentos debo presentar para acceder a estos cargos?',
      null,
      [expect.stringContaining('Propuesta aceptada:')],
      { forceContext: true, salaryContextQuestions: [] },
    );
    expect(answerGateway.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        question: '¿Qué documentos debo presentar para acceder a estos cargos?',
        sources: [source],
      }),
    );
    expect(historyGateway.beginTurn).toHaveBeenCalledWith(
      expect.objectContaining({ question: 'sí' }),
    );
    expect(historyGateway.getConversationContext).toHaveBeenCalledTimes(1);
    expect(events.map((event) => event.type)).toEqual([
      'conversation',
      'sources',
      'token',
      'done',
    ]);
  });

  it('acepta la sugerencia de requisitos y la busca como pregunta directa', async () => {
    historyGateway.getConversationContext.mockResolvedValue({
      conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
      messages: [
        { content: '¿Cuánto gana un docente?', role: 'user' },
        {
          content:
            'La remuneración es S/ 3,500.70. [1]\n\nSugerencias: ¿Te gustaría saber más sobre los requisitos para ser docente contratado?',
          role: 'assistant',
        },
      ],
      selectedModuleId: null,
    });
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      resolvedModule: { id: source.moduleIds[0], name: 'Contratación' },
      sources: [source],
      topRelevanceScore: 0.9,
    });
    answerGateway.generate.mockReturnValue(
      (async function* () {
        await Promise.resolve();
        yield 'Los requisitos son el título y la solicitud. [1]';
      })(),
    );

    await collect(service, {
      conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
      question: 'si',
    });

    expect(ragService.retrieve).toHaveBeenCalledWith(
      '¿Cuáles son los requisitos para ser docente contratado?',
      null,
      [],
      { forceContext: true, salaryContextQuestions: [] },
    );
  });

  it('hereda factores salariales si la propuesta aceptada sigue siendo salarial', async () => {
    historyGateway.getConversationContext.mockResolvedValue({
      conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
      messages: [
        { content: '¿Cuánto gana un docente de 30 horas?', role: 'user' },
        {
          content:
            'La remuneración es S/ 3,500.70. [1]\n\nSugerencias: ¿Quieres saber cuánto ganas con 40 horas?',
          role: 'assistant',
        },
      ],
      selectedModuleId: null,
    });
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      resolvedModule: { id: source.moduleIds[0], name: 'Remuneraciones' },
      sources: [source],
      topRelevanceScore: 0.9,
    });
    answerGateway.generate.mockReturnValue(
      (async function* () {
        await Promise.resolve();
        yield 'Con 40 horas la remuneración es mayor. [1]';
      })(),
    );

    await collect(service, {
      conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
      question: 'sí',
    });

    expect(ragService.retrieve).toHaveBeenCalledWith(
      '¿Cuánto gano con 40 horas?',
      null,
      ['¿Cuánto gana un docente de 30 horas?'],
      {
        forceContext: true,
        personalSalary: true,
        salaryContextQuestions: ['¿Cuánto gana un docente de 30 horas?'],
      },
    );
  });

  it('al aceptar una propuesta que cambia de tema abre una conversación nueva con la pregunta efectiva', async () => {
    const selectedModuleId = source.moduleIds[0];
    const newModuleId = '9c8b56af-6d0c-4fef-881e-7c00907540dd';
    historyGateway.getConversationContext.mockResolvedValue({
      conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
      messages: [
        { content: '¿Cuáles son los requisitos?', role: 'user' },
        {
          content:
            'La norma regula el procedimiento. [1]\n\n¿Quieres que te explique los requisitos?',
          role: 'assistant',
        },
      ],
      selectedModuleId,
    });
    ragService.retrieve.mockResolvedValue({
      kind: 'topic_change',
      resolvedModule: { id: newModuleId, name: 'Otro tema' },
      sources: [source],
      topRelevanceScore: 0.9,
    });
    answerGateway.generate.mockReturnValue(
      (async function* () {
        await Promise.resolve();
        yield 'Los requisitos son el título. [1]';
      })(),
    );

    await collect(service, {
      conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
      question: 'sí',
      selectedModuleId,
    });

    expect(historyGateway.beginTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: null,
        question: 'Explícame los requisitos.',
        selectedModuleId: newModuleId,
      }),
    );
  });

  it('no pasa al RAG un año previo si la propuesta aceptada cambia de cargo', async () => {
    historyGateway.getConversationContext.mockResolvedValue({
      conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
      messages: [
        { content: '¿Cuánto gana un docente en 2024?', role: 'user' },
        {
          content:
            'La remuneración docente en 2024 era S/ 3,500.70. [1]\n\n¿Quieres saber cuánto gana un director?',
          role: 'assistant',
        },
      ],
      selectedModuleId: null,
    });
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      resolvedModule: { id: source.moduleIds[0], name: 'Remuneraciones' },
      sources: [source],
      topRelevanceScore: 0.9,
    });
    answerGateway.generate.mockReturnValue(
      (async function* () {
        await Promise.resolve();
        yield 'La remuneración del director es distinta. [1]';
      })(),
    );

    await collect(service, {
      conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
      question: 'sí',
    });

    expect(ragService.retrieve).toHaveBeenCalledWith(
      '¿Cuánto gana un director?',
      null,
      ['¿Cuánto gana un docente en 2024?'],
      { forceContext: true, salaryContextQuestions: [] },
    );
  });

  it('no busca en el RAG un «sí» tras un cierre genérico', async () => {
    historyGateway.getConversationContext.mockResolvedValue({
      conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
      messages: [
        { content: '¿Cuánto gana un docente?', role: 'user' },
        {
          content:
            'La remuneración es S/ 3,500.70. [1]\n\n¿Necesitas algo más?',
          role: 'assistant',
        },
      ],
      selectedModuleId: null,
    });

    const events = await collect(service, {
      conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
      question: 'sí',
    });

    expect(events).toEqual([
      {
        data: { message: buildConversationalReply('acknowledgment') },
        type: 'conversational',
      },
    ]);
    expect(ragService.retrieve).not.toHaveBeenCalled();
    expect(historyGateway.beginTurn).not.toHaveBeenCalled();
  });

  it('no acepta con «sí» una aclaración que pide un dato: invita a elegir', async () => {
    historyGateway.getConversationContext.mockResolvedValue({
      conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
      messages: [
        { content: '¿Cuánto gana un docente?', role: 'user' },
        {
          content:
            'Para darte la cifra correcta necesito un solo dato: ¿tu vínculo es contratado o nombrado?',
          role: 'clarification',
        },
      ],
      selectedModuleId: null,
    });

    const events = await collect(service, {
      conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
      question: 'sí',
    });

    // No se usa la pregunta de la aclaración como si fuera una propuesta
    // aceptada ni se busca «sí» en el corpus: se invita a usar las opciones.
    expect(events).toEqual([
      {
        data: {
          message:
            'Para continuar, elige uno de los temas que te mostré en los botones o escríbeme el trámite o proceso concreto que quieres consultar.',
        },
        type: 'conversational',
      },
    ]);
    expect(ragService.retrieve).not.toHaveBeenCalled();
    expect(historyGateway.beginTurn).not.toHaveBeenCalled();
  });

  it('lee la propuesta del final de una respuesta larga sin el recorte de 2.000', async () => {
    const longAnswer = `Según la RM N.° 123-2024-MINEDU, el plazo es de cinco días. ${'Texto de la respuesta. '.repeat(200)}\n\nSugerencias: ¿Quieres que te explique los requisitos?`;
    const snapshotGateway = {
      ...historyGateway,
      getConversationSnapshot: jest.fn().mockResolvedValue({
        conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
        messages: [
          { content: '¿Cuáles son los requisitos?', role: 'user' as const },
          { content: longAnswer, role: 'assistant' as const },
        ],
        selectedModuleId: null,
      }),
    };
    const snapshotService = new ChatService(
      answerGateway,
      snapshotGateway,
      ragService as never,
      configService as never,
      faqMemoryService as never,
    );
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      resolvedModule: { id: source.moduleIds[0], name: 'Requisitos' },
      sources: [source],
      topRelevanceScore: 0.9,
    });
    answerGateway.generate.mockReturnValue(
      (async function* () {
        await Promise.resolve();
        yield 'Los requisitos son el título y la solicitud. [1]';
      })(),
    );

    await collect(snapshotService, {
      conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
      question: 'sí',
    });

    expect(snapshotGateway.getConversationSnapshot).toHaveBeenCalledWith({
      conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
      limit: MAX_CHAT_CONTEXT_MESSAGES,
      userId: authorization.userId,
    });
    expect(ragService.retrieve).toHaveBeenCalledWith(
      'Explícame los requisitos.',
      null,
      ['¿Cuáles son los requisitos?'],
      { forceContext: true, salaryContextQuestions: [] },
    );
    expect(snapshotGateway.getConversationContext).not.toHaveBeenCalled();
  });

  it('busca por sí sola una propuesta de documentos sin arrastrar la respuesta salarial', async () => {
    const suggestion =
      'Según la norma, la remuneración mensual es S/ 3,300.60. [1]\n\n' +
      'Sugerencias: ¿Te gustaría saber qué documentos debes presentar para obtener más información sobre tu situación laboral?';
    const snapshotGateway = {
      ...historyGateway,
      getConversationSnapshot: jest.fn().mockResolvedValue({
        conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
        messages: [
          { content: 'cuanto gana un docente?', role: 'user' as const },
          { content: suggestion, role: 'assistant' as const },
        ],
        selectedModuleId: null,
      }),
    };
    const snapshotService = new ChatService(
      answerGateway,
      snapshotGateway,
      ragService as never,
      configService as never,
      faqMemoryService as never,
    );
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      resolvedModule: { id: source.moduleIds[0], name: 'Requisitos' },
      sources: [source],
      topRelevanceScore: 0.9,
    });
    answerGateway.generate.mockReturnValue(
      (async function* () {
        await Promise.resolve();
        yield 'Los documentos son el DNI y el título. [1]';
      })(),
    );

    await collect(snapshotService, {
      conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
      question: 'si',
    });

    expect(ragService.retrieve).toHaveBeenCalledWith(
      '¿Qué documentos debo presentar para obtener más información sobre mi situación laboral?',
      null,
      // No arrastra la consulta salarial previa a la búsqueda de documentos.
      [],
      { forceContext: true, salaryContextQuestions: [] },
    );
  });

  it('no arrastra la consulta salarial a un pedido escrito de documentos', async () => {
    historyGateway.getConversationContext.mockResolvedValue({
      conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
      messages: [
        { content: '¿Cuánto gana un docente?', role: 'user' },
        {
          content: 'La remuneración mensual es S/ 3,500.70. [1]',
          role: 'assistant',
        },
      ],
      selectedModuleId: null,
    });
    ragService.retrieve.mockResolvedValue({
      kind: 'no_evidence',
      topRelevanceScore: null,
    });

    await collect(service, {
      conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
      question: '¿Qué documentos debo presentar?',
    });

    expect(ragService.retrieve).toHaveBeenCalledWith(
      '¿Qué documentos debo presentar?',
      null,
      [],
      { forceContext: false },
    );
  });

  it('no hereda factores salariales al aceptar una propuesta de otro tema', () => {
    // El mismo corte aplica si el pedido de documentos se escribe directamente.
    expect(
      salaryQuestionsForTurn({
        acceptedQuestion: null,
        effectiveQuestion: '¿Qué documentos debo presentar?',
        forceSalaryContext: false,
        priorUserQuestions: ['¿Cuánto gana un docente?'],
      }),
    ).toEqual([]);
    const prior = [
      '¿Cuánto gana un docente de 30 horas?',
      'Propuesta aceptada: la remuneración corresponde a una jornada de 30 horas.',
    ];

    expect(
      salaryQuestionsForTurn({
        acceptedQuestion: '¿Qué documentos debo presentar?',
        effectiveQuestion: '¿Qué documentos debo presentar?',
        forceSalaryContext: false,
        priorUserQuestions: prior,
      }),
    ).toEqual([]);
    expect(
      salaryQuestionsForTurn({
        acceptedQuestion: '¿Y para 30 horas?',
        effectiveQuestion: '¿Y para 30 horas?',
        forceSalaryContext: false,
        priorUserQuestions: ['¿Cuánto gana un docente?'],
      }),
    ).toEqual(['¿Cuánto gana un docente?']);
    expect(
      salaryQuestionsForTurn({
        acceptedQuestion: '¿Y para el cargo de director?',
        effectiveQuestion: '¿Y para el cargo de director?',
        forceSalaryContext: false,
        priorUserQuestions: ['¿Cuánto gana un docente?'],
      }),
    ).toEqual([]);
    expect(
      salaryQuestionsForTurn({
        acceptedQuestion: '¿Y para el año 2025?',
        effectiveQuestion: '¿Y para el año 2025?',
        forceSalaryContext: false,
        priorUserQuestions: ['¿Cuánto gana un docente?'],
      }),
    ).toEqual(['¿Cuánto gana un docente?']);
    expect(
      salaryQuestionsForTurn({
        acceptedQuestion: '¿Cuánto gana un director?',
        effectiveQuestion: '¿Cuánto gana un director?',
        forceSalaryContext: false,
        priorUserQuestions: ['¿Cuánto gana un docente en 2024?'],
      }),
    ).toEqual([]);
    expect(
      salaryQuestionsForTurn({
        acceptedQuestion: '¿Cuánto gana un director de 40 horas?',
        effectiveQuestion: '¿Cuánto gana un director de 40 horas?',
        forceSalaryContext: false,
        priorUserQuestions: ['¿Cuánto gana un docente de 30 horas en 2024?'],
      }),
    ).toEqual([]);
    expect(
      salaryQuestionsForTurn({
        acceptedQuestion: '¿La licencia puede durar 40 horas?',
        effectiveQuestion: '¿La licencia puede durar 40 horas?',
        forceSalaryContext: false,
        priorUserQuestions: ['¿Cuánto gana un docente de 30 horas en 2024?'],
      }),
    ).toEqual([]);
    expect(
      salaryQuestionsForTurn({
        acceptedQuestion: '¿Qué documentos debo presentar para 40 horas?',
        effectiveQuestion: '¿Qué documentos debo presentar para 40 horas?',
        forceSalaryContext: false,
        priorUserQuestions: ['¿Cuánto gana un docente de 30 horas en 2024?'],
      }),
    ).toEqual([]);
  });

  it('no muestra una tabla salarial si el importe no coincide con su fila', async () => {
    const tableSource = {
      ...source,
      chunkContent: [
        '| Jornada | Remuneración |',
        '| --- | --- |',
        '| 30 horas | S/ 3 300,60 |',
        '| 40 horas | S/ 4 400,80 |',
      ].join('\n'),
    };
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      resolvedModule: { id: source.moduleIds[0], name: 'Remuneraciones' },
      sources: [tableSource],
      topRelevanceScore: 0.9,
    });
    answerGateway.generate.mockReturnValue(
      (async function* () {
        await Promise.resolve();
        yield 'Para 30 horas, la remuneración es S/ 4 400,80. [1]';
      })(),
    );

    const events = await collect(service, {
      question: '¿Cuánto gana un docente?',
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
    expect(clarification.data.message).toContain('jornada');
    expect(events.some((event) => event.type === 'token')).toBe(false);
    expect(historyGateway.completeTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        replyRole: 'clarification',
        sources: [],
        unansweredReason: 'ambiguous_request',
      }),
    );
  });

  it('no muestra una cifra si la tabla no coincide con todos los factores de la pregunta', async () => {
    const tableSource = {
      ...source,
      chunkContent: [
        '| Jornada | Vínculo | Remuneración |',
        '| --- | --- | --- |',
        '| 30 horas | nombrado | S/ 3 300,60 |',
        '| 30 horas | contratado | S/ 2 400,40 |',
      ].join('\n'),
    };
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      resolvedModule: { id: source.moduleIds[0], name: 'Remuneraciones' },
      sources: [tableSource],
      topRelevanceScore: 0.9,
    });
    answerGateway.generate.mockReturnValue(
      (async function* () {
        await Promise.resolve();
        yield 'Para 30 horas, la remuneración es S/ 2 400,40. [1]';
      })(),
    );

    const events = await collect(service, {
      question: '¿Cuánto gano yo como docente nombrado de 30 horas?',
    });

    expect(events.some((event) => event.type === 'clarification')).toBe(true);
    expect(events.some((event) => event.type === 'token')).toBe(false);
    expect(historyGateway.completeTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        replyRole: 'clarification',
        sources: [],
      }),
    );
  });

  it('muestra solo las filas recuperadas que declaran cargo y sector', async () => {
    const tableSource = {
      ...source,
      documentTitle: 'Escala de remuneración docente',
      chunkContent: [
        '| Modalidad / Forma | Nivel / Ciclo | Jornada laboral | Remuneración mensual (S/) | Cargo | Sector |',
        '| --- | --- | --- | --- | --- | --- |',
        '| Educación Básica Regular – EBR | Inicial | 30 | 3,500.70 | Docente | Público |',
        '| Educación Básica Regular – EBR | Primaria | 30 | 3,500.70 | Docente | Privado |',
      ].join('\n'),
    };
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      resolvedModule: { id: source.moduleIds[0], name: 'Remuneraciones' },
      sources: [tableSource],
      topRelevanceScore: 0.9,
    });
    answerGateway.generate.mockReturnValue(
      (async function* () {
        await Promise.resolve();
        yield [
          'La remuneración varía según la modalidad:',
          '',
          '- Modalidad / Forma: Educación Básica Regular – EBR; Nivel / Ciclo: Inicial; Jornada laboral: 30; Remuneración mensual (S/): 3,500.70',
          '- Modalidad / Forma: Educación Básica Regular – EBR; Nivel / Ciclo: Primaria; Jornada laboral: 30; Remuneración mensual (S/): 3,500.70',
          '',
          'Fuente: [1]',
        ].join('\n');
      })(),
    );

    const events = await collect(service, {
      question: '¿Cuánto gana un docente?',
    });

    const token = events.find((event) => event.type === 'token');
    expect(token?.data.text).toContain('Cargo: Docente; Sector: Público');
    expect(token?.data.text).not.toContain('- Modalidad / Forma:');
    const completion = (
      historyGateway.completeTurn.mock.calls as Array<
        [Parameters<ChatHistoryGateway['completeTurn']>[0]]
      >
    )[0]?.[0];
    expect(completion?.answer).toContain('Cargo: Docente; Sector: Público');
  });

  it('muestra el fragmento salarial sin depender de una negativa del modelo', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      resolvedModule: { id: source.moduleIds[0], name: 'Remuneraciones' },
      sources: [
        {
          ...source,
          chunkContent:
            'La remuneración mensual del docente es de S/ 3 300,60.',
        },
      ],
      topRelevanceScore: 0.9,
    });
    answerGateway.generate.mockReturnValue(
      (async function* () {
        await Promise.resolve();
        yield 'No sería responsable darte una cifra única.';
      })(),
    );

    const events = await collect(service, {
      question: '¿Cuánto gana un docente?',
    });

    expect(events.map((event) => event.type)).toEqual([
      'conversation',
      'sources',
      'token',
      'done',
    ]);
    expect(events.some((event) => event.type === 'no_evidence')).toBe(false);
    expect(answerGateway.generate).not.toHaveBeenCalled();
    const completion = (
      historyGateway.completeTurn.mock.calls as Array<
        [Parameters<ChatHistoryGateway['completeTurn']>[0]]
      >
    )[0]?.[0];
    expect(completion?.answer).toContain(
      'La remuneración mensual del docente es de S/ 3 300,60.',
    );
    expect(completion?.replyRole).toBe('assistant');
    expect(completion?.unansweredReason).toBeNull();
  });

  it('respeta el módulo elegido si cambia mientras hay una propuesta pendiente', async () => {
    historyGateway.getConversationContext.mockResolvedValue({
      conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
      messages: [
        { content: '¿Cuánto gana un docente?', role: 'user' },
        {
          content:
            'La remuneración es S/ 3,500.70. [1]\n\nSugerencias: ¿Quieres que te explique los requisitos?',
          role: 'assistant',
        },
      ],
      selectedModuleId: null,
    });
    ragService.retrieve.mockResolvedValue({
      kind: 'no_evidence',
      topRelevanceScore: null,
    });

    await collect(service, {
      conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
      question: 'sí',
      selectedModuleId: '8c8b56af-6d0c-4fef-881e-7c00907540dd',
    });

    expect(ragService.retrieve).toHaveBeenCalledWith(
      'sí',
      '8c8b56af-6d0c-4fef-881e-7c00907540dd',
      expect.any(Array),
      { forceContext: false },
    );
  });

  it('responde el resumen de la conversación con la memoria de la sesión', async () => {
    historyGateway.getConversationContext.mockResolvedValue({
      conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
      messages: [
        { content: '¿Cuánto gana un docente contratado?', role: 'user' },
        {
          content: 'La remuneración mensual es S/ 3,500.70. [1]',
          role: 'assistant',
        },
      ],
      selectedModuleId: null,
    });
    answerGateway.generate.mockReturnValue(
      (async function* () {
        await Promise.resolve();
        yield 'Hablamos de la remuneración mensual de S/ 3,500.70.';
      })(),
    );

    const events = await collect(service, {
      conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
      question: 'en forma resumida dime lo que hablamos',
    });

    expect(events).toEqual([
      {
        data: {
          message: 'Hablamos de la remuneración mensual de S/ 3,500.70.',
        },
        type: 'conversational',
      },
    ]);
    expect(answerGateway.generate).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'summary', sources: [] }),
    );
    expect(ragService.retrieve).not.toHaveBeenCalled();
    expect(historyGateway.beginTurn).not.toHaveBeenCalled();
  });

  it('usa el historial completo cuando el gateway lo ofrece', async () => {
    const fullMessages = Array.from({ length: 20 }, (_, index) => ({
      content:
        index === 0
          ? '¿Cuánto gana un docente contratado?'
          : `Mensaje ${index + 1}`,
      role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
    }));
    const fullHistoryGateway = {
      ...historyGateway,
      getConversationMessages: jest.fn().mockResolvedValue(fullMessages),
    };
    const fullHistoryService = new ChatService(
      answerGateway,
      fullHistoryGateway,
      ragService as never,
      configService as never,
      faqMemoryService as never,
    );
    answerGateway.generate.mockReturnValue(
      (async function* () {
        await Promise.resolve();
        yield 'Hablamos de la remuneración docente.';
      })(),
    );

    const events = await collect(fullHistoryService, {
      conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
      question: 'resume lo que hablamos',
    });

    expect(fullHistoryGateway.getConversationMessages).toHaveBeenCalledWith({
      conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
      limit: CHAT_CONVERSATION_MESSAGE_LIMIT,
      userId: authorization.userId,
    });
    expect(fullHistoryGateway.getConversationContext).not.toHaveBeenCalled();
    expect(answerGateway.generate).toHaveBeenCalledWith(
      expect.objectContaining({ conversationContext: fullMessages }),
    );
    expect(events[0]?.type).toBe('conversational');
  });

  it('entra al resumen si la persona acepta una oferta de resumen', async () => {
    historyGateway.getConversationContext.mockResolvedValue({
      conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
      messages: [
        { content: '¿Cuánto gana un docente contratado?', role: 'user' },
        {
          content:
            'La remuneración mensual es S/ 3,500.70. [1]\n\n¿Te preparo un resumen de lo que hablamos?',
          role: 'assistant',
        },
      ],
      selectedModuleId: null,
    });
    answerGateway.generate.mockReturnValue(
      (async function* () {
        await Promise.resolve();
        yield 'Hablamos de la remuneración mensual de S/ 3,500.70.';
      })(),
    );

    const events = await collect(service, {
      conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
      question: 'sí',
    });

    expect(events[0]?.type).toBe('conversational');
    expect(ragService.retrieve).not.toHaveBeenCalled();
    expect(answerGateway.generate).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'summary' }),
    );
    expect(historyGateway.getConversationContext).toHaveBeenCalledTimes(2);
  });

  it('cae a un resumen determinista si el proveedor falla', async () => {
    historyGateway.getConversationContext.mockResolvedValue({
      conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
      messages: [
        { content: '¿Cuánto gana un docente contratado?', role: 'user' },
        {
          content: 'La remuneración mensual es S/ 3,500.70. [1]',
          role: 'assistant',
        },
      ],
      selectedModuleId: null,
    });
    answerGateway.generate.mockImplementation(() => {
      throw new Error('provider down');
    });

    const events = await collect(service, {
      conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
      question: 'resume todo lo hablado en este chat',
    });

    const reply = events[0];
    if (!reply || reply.type !== 'conversational') {
      throw new Error('Expected a conversational summary.');
    }
    expect(reply.data.message).toContain('Estos son los puntos que tratamos');
    expect(reply.data.message).toContain('Cuánto gana un docente contratado');
    expect(reply.data.message).not.toContain('[1]');
  });

  it('descarta un resumen con una cifra inventada y usa el determinista', async () => {
    historyGateway.getConversationContext.mockResolvedValue({
      conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
      messages: [
        { content: '¿Cuánto gana un docente contratado?', role: 'user' },
        {
          content: 'La remuneración mensual es S/ 3,500.70. [1]',
          role: 'assistant',
        },
      ],
      selectedModuleId: null,
    });
    answerGateway.generate.mockReturnValue(
      (async function* () {
        await Promise.resolve();
        yield 'Hablamos de una remuneración de S/ 4,400.80.';
      })(),
    );

    const events = await collect(service, {
      conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
      question: 'resume lo que hablamos',
    });

    const reply = events[0];
    if (!reply || reply.type !== 'conversational') {
      throw new Error('Expected a conversational summary.');
    }
    expect(reply.data.message).toContain('Estos son los puntos que tratamos');
    expect(reply.data.message).not.toContain('4,400.80');
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

  it('responde el panorama de auxiliar aunque falte el monto y conserva los temas sugeridos', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'ambiguous',
      modules: [{ id: source.moduleIds[0], name: 'Remuneraciones' }],
      sources: [
        {
          ...source,
          chunkContent:
            'La remuneración mensual del auxiliar de educación es aquella que se encuentra establecida en la normativa vigente correspondiente.',
        },
      ],
      topRelevanceScore: 0.9,
    });
    answerGateway.generate.mockReturnValue(
      (async function* () {
        await Promise.resolve();
        yield 'La remuneración del auxiliar de educación se rige por la normativa vigente, que en este documento no fija un monto. [1] ¿Quieres saber de qué depende esa remuneración?';
      })(),
    );

    const events = await collect(service, {
      question: '¿Cuánto gana un auxiliar de educación?',
    });

    expect(events.some((event) => event.type === 'clarification')).toBe(false);
    expect(events.some((event) => event.type === 'token')).toBe(true);
    expect(answerGateway.generate).not.toHaveBeenCalled();
    const answer = events.find((event) => event.type === 'token');
    expect(answer?.data.text).toContain('No encontré un monto verificable');
    expect(answer?.data.text).not.toContain('normativa vigente');
    expect(answer?.data.text).not.toContain('?');
    expect(events.find((event) => event.type === 'sources')).toEqual({
      data: { sources: [] },
      type: 'sources',
    });
    expect(events.at(-1)).toEqual({
      data: {
        conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
        inReplyToMessageId: 'ac8b56af-6d0c-4fef-881e-7c00907540dd',
        messageId: 'bc8b56af-6d0c-4fef-881e-7c00907540dd',
        modules: [{ id: source.moduleIds[0], name: 'Remuneraciones' }],
        provider: 'rule',
      },
      type: 'done',
    });
  });

  it('no muestra una cifra inventada cuando el panorama no trae ningún monto', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'ambiguous',
      modules: [{ id: source.moduleIds[0], name: 'Remuneraciones' }],
      sources: [
        {
          ...source,
          chunkContent:
            'La remuneración mensual del auxiliar de educación es aquella que se encuentra establecida en la normativa vigente correspondiente.',
        },
      ],
      topRelevanceScore: 0.9,
    });
    answerGateway.generate.mockReturnValue(
      (async function* () {
        await Promise.resolve();
        yield 'La remuneración del auxiliar de educación es de S/ 2 000,00. [1]';
      })(),
    );

    const events = await collect(service, {
      question: '¿Cuánto gana un auxiliar de educación?',
    });

    const answer = events.find((event) => event.type === 'token');
    expect(answer?.data.text).toContain('No encontré un monto verificable');
    expect(answer?.data.text).not.toContain('S/ 2 000,00');
    expect(answerGateway.generate).not.toHaveBeenCalled();
  });

  it('responde «privado» como seguimiento del panorama de auxiliar en vez de repetir la pregunta', async () => {
    const conversationId = '9c8b56af-6d0c-4fef-881e-7c00907540dd';
    historyGateway.getConversationContext.mockResolvedValue({
      conversationId,
      messages: [
        { content: '¿Cuánto gana un auxiliar de educación?', role: 'user' },
        {
          content:
            'Puedo darte el panorama de la remuneración educativa. ¿Tu consulta es del sector público o privado?',
          role: 'clarification',
        },
      ],
      selectedModuleId: null,
    });
    ragService.retrieve.mockResolvedValue({
      kind: 'ambiguous',
      modules: [{ id: source.moduleIds[0], name: 'Remuneraciones' }],
      sources: [
        {
          ...source,
          chunkContent:
            'La remuneración mensual del auxiliar de educación del sector público es aquella que se encuentra establecida en la normativa vigente correspondiente.',
        },
      ],
      topRelevanceScore: 0.9,
    });
    answerGateway.generate.mockReturnValue(
      (async function* () {
        await Promise.resolve();
        yield 'Los documentos entregados regulan la remuneración del auxiliar de educación en el sector público y no contienen información del sector privado. [1] ¿Quieres revisar los requisitos del sector público?';
      })(),
    );

    const events = await collect(service, {
      conversationId,
      question: 'privado',
    });

    expect(events.some((event) => event.type === 'clarification')).toBe(false);
    expect(answerGateway.generate).not.toHaveBeenCalled();
    const answer = events.find((event) => event.type === 'token');
    expect(answer?.data.text).toContain('no puedo darte una cifra');
    expect(answer?.data.text).not.toContain('sector público');
    const sources = events.find((event) => event.type === 'sources');
    expect(sources).toEqual({ data: { sources: [] }, type: 'sources' });
    expect(events.at(-1)).toEqual({
      data: {
        conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
        inReplyToMessageId: 'ac8b56af-6d0c-4fef-881e-7c00907540dd',
        messageId: 'bc8b56af-6d0c-4fef-881e-7c00907540dd',
        modules: [{ id: source.moduleIds[0], name: 'Remuneraciones' }],
        provider: 'rule',
      },
      type: 'done',
    });
  });

  it('abre chat general al responder un panorama ambiguo desde otro módulo', async () => {
    const conversationId = '9c8b56af-6d0c-4fef-881e-7c00907540dd';
    historyGateway.getConversationContext.mockResolvedValue({
      conversationId,
      messages: [],
      selectedModuleId: source.moduleIds[0],
    });
    ragService.retrieve.mockResolvedValue({
      kind: 'ambiguous',
      modules: [{ id: source.moduleIds[0], name: 'Remuneraciones' }],
      sources: [
        {
          ...source,
          chunkContent:
            'La remuneración mensual del auxiliar de educación se regula por la normativa vigente.',
        },
      ],
      topRelevanceScore: 0.9,
    });
    answerGateway.generate.mockReturnValue(
      (async function* () {
        await Promise.resolve();
        yield 'La remuneración del auxiliar se regula por la normativa vigente. [1]';
      })(),
    );
    await collect(service, {
      conversationId,
      selectedModuleId: source.moduleIds[0],
      question: '¿Cuánto gana un auxiliar de educación?',
    });
    expect(historyGateway.beginTurn).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: null, selectedModuleId: null }),
    );
  });

  it('retiene una cifra inventada incluso cuando la ruta es evidencia', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      sources: [
        {
          ...source,
          chunkContent:
            'La remuneración del auxiliar de educación se establece en la normativa vigente.',
        },
      ],
      topRelevanceScore: 0.9,
    });
    answerGateway.generate.mockReturnValue(
      (async function* () {
        await Promise.resolve();
        yield 'El auxiliar gana S/ 2 000,00. [1]';
      })(),
    );
    const events = await collect(service, {
      question: '¿Cuánto gana un auxiliar de educación?',
    });
    expect(events.some((event) => event.type === 'token')).toBe(true);
    expect(events.some((event) => event.type === 'clarification')).toBe(false);
    expect(answerGateway.generate).not.toHaveBeenCalled();
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

    // H-3: la respuesta a una aclaración conserva los factores heredados y
    // responde con el panorama en vez de encadenar otra pregunta.
    it('tras responder «Sector público» responde con el panorama salarial heredado', async () => {
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
          chunkContent: `La remuneración mensual del profesor del sector público de jornada de ${hours} horas es de S/ ${hours} 000,00.`,
          chunkId: `${hours}c8b56af-6d0c-4fef-881e-7c00907540dd`,
          documentVersionId: `${hours}d8b56af-6d0c-4fef-881e-7c00907540dd`,
        })),
        topRelevanceScore: 0.9,
      });
      answerGateway.generate.mockReturnValue(
        (async function* () {
          await Promise.resolve();
          yield 'La remuneración mensual es S/ 30 000,00 para 30 horas y S/ 40 000,00 para 40 horas. [1][2]';
        })(),
      );

      const events = await collect(service, {
        conversationId,
        question: 'Sector público',
      });

      expect(events.some((event) => event.type === 'clarification')).toBe(
        false,
      );
      expect(answerGateway.generate).not.toHaveBeenCalled();
      expect(events.some((event) => event.type === 'token')).toBe(true);
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

  it('coloca la cita de una lista en su introducción y sustituye el texto ya transmitido', async () => {
    const cronograma = {
      ...source,
      chunkContent:
        'Cronograma del destaque 2026. Presentación de solicitudes: 13.01.2026 al 14.01.2026. Resultados de la evaluación: 16.01.2026.',
      chunkId: 'cc8b56af-6d0c-4fef-881e-7c00907540dd',
      documentTitle: 'Cronograma del destaque 2026',
      documentVersionId: 'dc8b56af-6d0c-4fef-881e-7c00907540dd',
    };
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      sources: [source, cronograma],
      topRelevanceScore: 0.9,
    });
    answerGateway.generate.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        await Promise.resolve();
        yield 'Según el cronograma de destaque 2026, estas son las fechas principales:\n';
        yield '- Presentación de solicitudes: del 13 al 14 de enero de 2026.\n';
        yield '- Resultados de la evaluación: el 16 de enero de 2026. [2]';
      },
    });

    const events = await collect(service, {
      question: '¿Cuándo se dan los destaques?',
    });

    const placed = [
      'Según el cronograma de destaque 2026, estas son las fechas principales. [2]',
      '- Presentación de solicitudes: del 13 al 14 de enero de 2026.',
      '- Resultados de la evaluación: el 16 de enero de 2026.',
    ].join('\n');
    expect(events.map((event) => event.type)).toEqual([
      'conversation',
      'sources',
      'token',
      'answer',
      'done',
    ]);
    expect(events.find((event) => event.type === 'answer')).toEqual({
      data: { text: placed },
      type: 'answer',
    });
    const completionCalls = historyGateway.completeTurn.mock.calls as Array<
      [Parameters<ChatHistoryGateway['completeTurn']>[0]]
    >;
    expect(completionCalls[0]?.[0]).toMatchObject({
      answer: placed,
      qualitySignals: [],
    });
  });

  it('envía la respuesta sustituta antes del aviso de corte y guarda ambos', async () => {
    const cronograma = {
      ...source,
      chunkContent:
        'Cronograma del destaque 2026. Presentación de solicitudes: 13.01.2026 al 14.01.2026.',
      chunkId: 'cc8b56af-6d0c-4fef-881e-7c00907540dd',
      documentVersionId: 'dc8b56af-6d0c-4fef-881e-7c00907540dd',
    };
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      sources: [source, cronograma],
      topRelevanceScore: 0.9,
    });
    answerGateway.generate.mockImplementation(
      (input: { onFinish?: (reason: string) => void }) => ({
        async *[Symbol.asyncIterator]() {
          await Promise.resolve();
          yield 'Según el cronograma de destaque 2026, estas son las fechas:\n';
          yield '- Presentación de solicitudes: del 13 al 14 de enero de 2026. [2]';
          input.onFinish?.('length');
        },
      }),
    );

    const events = await collect(service, {
      question: '¿Cuándo se dan los destaques?',
    });

    expect(events.map((event) => event.type)).toEqual([
      'conversation',
      'sources',
      'token',
      'answer',
      'token',
      'done',
    ]);
    const completionCalls = historyGateway.completeTurn.mock.calls as Array<
      [Parameters<ChatHistoryGateway['completeTurn']>[0]]
    >;
    expect(completionCalls[0]?.[0].answer).toMatch(
      /^Según el cronograma de destaque 2026, estas son las fechas\. \[2\]\n- Presentación de solicitudes: del 13 al 14 de enero de 2026\.\n\n/u,
    );
  });

  it('no coloca citas en una respuesta salarial', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      sources: [
        {
          ...source,
          chunkContent:
            'La remuneración del docente se fija según el nivel y la jornada de trabajo.',
        },
      ],
      topRelevanceScore: 0.9,
    });
    answerGateway.generate.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        await Promise.resolve();
        yield 'Estos son los factores de la remuneración:\n- La remuneración del docente depende del nivel.\n- La remuneración del docente depende de la jornada de trabajo. [1]';
      },
    });

    const events = await collect(service, {
      question: '¿Cuánto gana un docente contratado de 30 horas?',
    });

    expect(events.map((event) => event.type)).not.toContain('answer');
  });

  it('no emite una respuesta sustituta cuando las citas ya están en su lugar', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      sources: [source],
      topRelevanceScore: 0.9,
    });
    answerGateway.generate.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        await Promise.resolve();
        yield 'Estos son los pasos de la licencia. [1]\n- Presenta la solicitud.\n- Espera la respuesta.';
      },
    });

    const events = await collect(service);

    expect(events.map((event) => event.type)).not.toContain('answer');
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
      { forceContext: false, personalSalary: true },
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

  it('responde con las dos jornadas cuando la evidencia vigente tiene dos montos', async () => {
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
    answerGateway.generate.mockReturnValue(
      (async function* () {
        await Promise.resolve();
        yield 'La remuneración mensual es S/ 3 300,60 para 30 horas y S/ 4 400,80 para 40 horas. [1][2]';
      })(),
    );

    const events = await collect(service, {
      question: '¿Cuánto gana un docente?',
    });

    expect(events.some((event) => event.type === 'clarification')).toBe(false);
    expect(events.some((event) => event.type === 'sources')).toBe(true);
    expect(events.some((event) => event.type === 'token')).toBe(true);
    expect(answerGateway.generate).not.toHaveBeenCalled();
  });

  it.each([
    'que tiene que ver la horanda?',
    'pero que tiene que ver la jornada? no entiendo',
    '¿Qué tiene que ver la jornada de 30 o 40 horas?',
    'no entiendo',
    'No entiendo, ¿qué tiene que ver la jornada?',
    'Disculpa, ¿por qué me preguntas por la jornada?',
  ])(
    'explica la jornada pendiente sin repetir la aclaración: %s',
    async (question) => {
      const conversationId = '9c8b56af-6d0c-4fef-881e-7c00907540dd';
      historyGateway.getConversationContext.mockResolvedValue({
        conversationId,
        selectedModuleId: null,
        messages: [
          {
            role: 'user',
            content: 'que se requiere para ser auxiliar en educacion?',
          },
          {
            role: 'clarification',
            content:
              'Para darte la cifra correcta necesito un solo dato: ¿tu jornada es de 30 o de 40 horas? Con eso te indico el monto vigente que te corresponde y su alcance.',
          },
        ],
      });
      ragService.retrieve.mockResolvedValue({
        kind: 'no_evidence',
        topRelevanceScore: null,
      });

      const events = await collect(service, { conversationId, question });
      expect(events.map((event) => event.type)).toEqual([
        'conversation',
        'clarification',
        'done',
      ]);
      expect(
        events.find((event) => event.type === 'clarification')?.data.message,
      ).toContain('Este dato es importante porque');
      expect(historyGateway.beginTurn).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId, question }),
      );
      expect(historyGateway.completeTurn).toHaveBeenCalledWith(
        expect.objectContaining({
          replyRole: 'clarification',
          sources: [],
          unansweredReason: 'ambiguous_request',
        }),
      );
      expect(ragService.retrieve).not.toHaveBeenCalled();
      expect(answerGateway.generate).not.toHaveBeenCalled();
    },
  );

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

    const events = await collect(service, {
      question: '¿Cuánto es mi remuneración mensual?',
    });

    expect(events.some((event) => event.type === 'clarification')).toBe(true);
    expect(events.some((event) => event.type === 'token')).toBe(false);
    const completionCalls = historyGateway.completeTurn.mock.calls as Array<
      [Parameters<ChatHistoryGateway['completeTurn']>[0]]
    >;
    expect(completionCalls[0]?.[0]).toMatchObject({
      replyRole: 'clarification',
      sources: [],
      unansweredReason: 'ambiguous_request',
    });
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

  it('no persiste un panorama salarial extractivo si el cliente se desconecta', async () => {
    const controller = new AbortController();
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      sources: [
        {
          ...source,
          chunkContent:
            'La remuneración mensual del auxiliar de educación del sector público es S/ 2 000,00.',
        },
      ],
      topRelevanceScore: 0.9,
    });
    historyGateway.beginTurn.mockImplementation(() => {
      controller.abort();
      return Promise.resolve({
        conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
        userMessageId: 'ac8b56af-6d0c-4fef-881e-7c00907540dd',
      });
    });

    const events = await collect(service, {
      abortSignal: controller.signal,
      question: '¿Cuánto gana un auxiliar de educación?',
    });

    expect(events.map((event) => event.type)).toEqual(['conversation']);
    expect(answerGateway.generate).not.toHaveBeenCalled();
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
        'Para postular como auxiliar de educación debes cumplir los requisitos generales. Estudios superiores y sexto ciclo de estudios pedagógicos. Salud física y mental y declaración jurada original. Edad: menos de 70 años y declaración jurada.',
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

  it('comprueba cada dato de una lista cubierta por una cita en la introducción', () => {
    const schedule = {
      ...source,
      chunkContent:
        'Cronograma de destaque: presentación del 13 al 14 de enero. Evaluación del 14 al 15 de enero.',
    };
    const answer =
      'Según el cronograma de destaque, estas son las fechas principales. [1]\n\n- Presentación de solicitudes: del 13 al 14 de enero.\n- Evaluación de solicitudes: del 14 al 15 de enero.';
    expect(evaluateAnswerCitationQuality(answer, [schedule])).toEqual([]);
    expect(
      evaluateAnswerCitationQuality(
        answer.replace('15 de enero', '30 de enero'),
        [schedule],
      ),
    ).toContain('citation_insufficient');
  });

  it('acepta una cita compartida corroborada por dos fuentes', () => {
    const schedule = {
      ...source,
      chunkContent:
        'Cronograma de destaque: presentación del 13 al 14 de enero. Evaluación del 14 al 15 de enero.',
    };
    const copy = {
      ...source,
      chunkContent:
        'El cronograma de destaque fija la presentación del 13 al 14 de enero y la evaluación del 14 al 15 de enero.',
    };
    const answer =
      'Según el cronograma de destaque, estas son las fechas principales. [1][2]\n\n- Presentación de solicitudes: del 13 al 14 de enero.\n- Evaluación de solicitudes: del 14 al 15 de enero.';
    expect(evaluateAnswerCitationQuality(answer, [schedule, copy])).toEqual([]);
    expect(
      evaluateAnswerCitationQuality(
        answer.replace('15 de enero', '30 de enero'),
        [schedule, copy],
      ),
    ).toContain('citation_insufficient');
  });

  it('acepta una viñeta respaldada solo por la segunda fuente corroborante', () => {
    const presentation = {
      ...source,
      chunkContent: 'Cronograma de destaque: presentación el 13 de enero.',
    };
    const evaluation = {
      ...source,
      chunkContent: 'Cronograma de destaque: evaluación el 15 de enero.',
    };
    const answer =
      'Según el cronograma de destaque, estas son las fechas. [1][2]\n\n- Presentación: 13 de enero.\n- Evaluación: 15 de enero.';
    expect(
      evaluateAnswerCitationQuality(answer, [presentation, evaluation]),
    ).toEqual([]);
  });

  it('no deja pasar un dato sin respaldo cuando la lista no lleva puntos finales', () => {
    const schedule = {
      ...source,
      chunkContent: 'Cronograma de destaque: presentación el 13 de enero.',
    };
    const other = {
      ...source,
      chunkContent: 'Plazo de 30 días para subsanar.',
    };
    const answer =
      'Según el cronograma de destaque [1][2]:\n- Presentación: 13 de enero\n- Evaluación: 30 de enero';
    expect(evaluateAnswerCitationQuality(answer, [schedule, other])).toContain(
      'citation_insufficient',
    );
  });

  it('no combina dos fuentes para cubrir un solo dato del bloque', () => {
    const lexicalSource = {
      ...source,
      chunkContent: 'La evaluación de solicitudes se realiza en enero.',
    };
    const numericSource = {
      ...source,
      chunkContent: 'El cronograma fija el 15 para la etapa final.',
    };
    const answer =
      'Según el cronograma, estas son las fechas principales. [1][2]\n\n- Evaluación de solicitudes: 15 de enero.';
    expect(
      evaluateAnswerCitationQuality(answer, [lexicalSource, numericSource]),
    ).toContain('citation_insufficient');
  });

  it('no pierde la cita de bloque por una fuente citada después de la lista', () => {
    const schedule = {
      ...source,
      chunkContent:
        'Cronograma de destaque: presentación del 13 al 14 de enero. Evaluación del 14 al 15 de enero.',
    };
    const conditions = {
      ...source,
      chunkContent:
        'Los supuestos se solicitan durante el año conforme a las condiciones aplicables.',
    };
    const answer =
      'Según el cronograma de destaque, estas son las fechas principales. [1]\n- Presentación de solicitudes: del 13 al 14 de enero.\n- Evaluación de solicitudes: del 14 al 15 de enero.\nAdemás, existen supuestos que se solicitan durante el año conforme a las condiciones aplicables. [2]';
    expect(
      evaluateAnswerCitationQuality(answer, [schedule, conditions]),
    ).toEqual([]);
  });

  it('comprueba el mes de una fecha completa escrita en lenguaje natural', () => {
    const schedule = {
      ...source,
      chunkContent:
        'Cronograma de destaque 2026: presentación de solicitudes 13.01.2026 al 14.01.2026.',
    };
    const inJanuary =
      'Según el cronograma de destaque, la presentación de solicitudes es del 13 al 14 de enero de 2026. [1]';
    const inFebruary =
      'Según el cronograma de destaque, la presentación de solicitudes es del 13 al 14 de febrero de 2026. [1]';

    expect(evaluateAnswerCitationQuality(inJanuary, [schedule])).toEqual([]);
    expect(evaluateAnswerCitationQuality(inFebruary, [schedule])).toContain(
      'citation_insufficient',
    );
  });

  it('usa la introducción de cada lista cuando hay dos en el mismo párrafo', () => {
    const schedule = {
      ...source,
      chunkContent:
        'Cronograma de destaque: presentación el 13 de enero y evaluación el 15 de enero.',
    };
    const conditions = {
      ...source,
      chunkContent:
        'Los supuestos se solicitan durante el año; la licencia por estudios es uno de ellos.',
    };
    const answer =
      'Según el cronograma de destaque, estas son las fechas. [1]\n- Presentación: 13 de enero.\n- Evaluación: 15 de enero.\nOtros supuestos se solicitan durante el año. [2]\n- Supuesto de licencia por estudios.';
    expect(
      evaluateAnswerCitationQuality(answer, [schedule, conditions]),
    ).toEqual([]);
  });

  it('reconoce la cita de una introducción partida en varias líneas', () => {
    const schedule = {
      ...source,
      chunkContent: 'Cronograma de destaque: presentación el 13 de enero.',
    };
    const answer =
      'Según el cronograma de destaque, estas son las fechas [1]\nprincipales del proceso.\n- Presentación: 13 de enero.';
    expect(evaluateAnswerCitationQuality(answer, [schedule])).toEqual([]);
  });

  it('reconoce viñetas con raya y espacio duro', () => {
    const schedule = {
      ...source,
      chunkContent:
        'Cronograma: presentación el 13 de enero. Evaluación el 15 de enero.',
    };
    const answer =
      'Según el cronograma, estas son las fechas. [1]\n–\u00A0Presentación: 13 de enero.\n1.\u00A0Evaluación: 15 de enero.';
    expect(evaluateAnswerCitationQuality(answer, [schedule])).toEqual([]);
  });

  it('revisa las cifras de viñetas cortas cubiertas por una cita de bloque', () => {
    const schedule = {
      ...source,
      chunkContent:
        'Cronograma: presentación el 13 de enero. Evaluación el 15 de enero.',
    };
    const answer =
      'Según el cronograma, estas son las fechas principales. [1]\n\n- Presentación: 13 de enero.\n- Evaluación: 30 de enero.';
    expect(evaluateAnswerCitationQuality(answer, [schedule])).toContain(
      'citation_insufficient',
    );
  });

  it('sigue revisando una viñeta breve sin cita', () => {
    const answer = '- Presentar la solicitud en la UGEL.';
    expect(evaluateAnswerCitationQuality(answer, [source])).toContain(
      'support_partial',
    );
  });

  it('no confunde el número de orden con una fecha en una lista citada', () => {
    const schedule = {
      ...source,
      chunkContent:
        'Cronograma: presentación el 13 de enero. Evaluación el 15 de enero.',
    };
    const answer =
      'Según el cronograma, estas son las fechas principales. [1]\n\n1) Presentación: 13 de enero.\n2) Evaluación: 15 de enero.';
    expect(evaluateAnswerCitationQuality(answer, [schedule])).toEqual([]);
  });

  it('no confunde una fecha con puntos con el número de orden', () => {
    const schedule = {
      ...source,
      chunkContent: 'La presentación de solicitudes es el 14.01.2026.',
    };
    const answer = '13.01.2026 es la fecha de presentación de solicitudes. [1]';
    expect(evaluateAnswerCitationQuality(answer, [schedule])).toContain(
      'citation_insufficient',
    );
    expect(
      evaluateAnswerCitationQuality(
        answer.replace('13.01.2026', '14.01.2026'),
        [schedule],
      ),
    ).toEqual([]);
  });

  it('revisa una viñeta que solo contiene una fecha', () => {
    const schedule = {
      ...source,
      chunkContent: 'Cronograma de presentación de solicitudes: 13/01/2026.',
    };
    const answer =
      'Según el cronograma, estas son las fechas principales. [1]\n\n- 30/01/2026';
    expect(evaluateAnswerCitationQuality(answer, [schedule])).toContain(
      'citation_insufficient',
    );
    expect(
      evaluateAnswerCitationQuality(
        answer.replace('30/01/2026', '13/01/2026'),
        [schedule],
      ),
    ).toEqual([]);
  });

  it('una cita fuera de rango en una viñeta no invalida la cita de bloque', () => {
    const schedule = {
      ...source,
      chunkContent:
        'Cronograma de destaque: presentación del 13 al 14 de enero. Evaluación del 14 al 15 de enero.',
    };
    const answer =
      'Según el cronograma de destaque, estas son las fechas principales. [1]\n\n- Presentación de solicitudes: del 13 al 14 de enero. [9]\n- Evaluación de solicitudes: del 14 al 15 de enero.';
    const signals = evaluateAnswerCitationQuality(answer, [schedule]);
    expect(signals).toContain('citation_insufficient');
    expect(signals).not.toContain('support_partial');
  });

  it('no marca como afirmaciones sustantivas viñetas breves sin cifras', () => {
    expect(evaluateAnswerCitationQuality('- Sí.\n- No.', [source])).toEqual([]);
    expect(evaluateAnswerCitationQuality('1. Sí.\n2. No.', [source])).toEqual(
      [],
    );
    expect(evaluateAnswerCitationQuality('1) Sí.\n2) No.', [source])).toEqual(
      [],
    );
  });

  it('no usa una cita de otra viñeta para cubrir una lista con fuentes distintas', () => {
    const second = {
      ...source,
      chunkContent: 'La evaluación de solicitudes es el 15 de enero.',
    };
    const answer =
      '- La licencia se solicita por procedimiento institucional. [1]\n- La evaluación se realiza el 15 de enero. [2]\n- La presentación se realiza el 13 de enero.';
    expect(evaluateAnswerCitationQuality(answer, [source, second])).toContain(
      'support_partial',
    );
  });

  it('no interpreta la cita intermedia de una viñeta como cita de toda la lista', () => {
    const answer =
      '- Primera condición de la licencia sin referencia.\n- La licencia se solicita mediante procedimiento institucional. [1]\n- Última condición de la licencia sin referencia.';
    expect(evaluateAnswerCitationQuality(answer, [source])).toContain(
      'support_partial',
    );
  });

  it('no interpreta la cita de la última viñeta como cita de toda la lista', () => {
    const answer =
      '- Primera condición de la licencia sin referencia.\n- La licencia se solicita mediante procedimiento institucional. [1]';
    expect(evaluateAnswerCitationQuality(answer, [source])).toContain(
      'support_partial',
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
