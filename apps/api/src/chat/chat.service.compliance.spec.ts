import type { AuthorizationContext } from '../authorization';
import { RAG_NO_SUPPORT_MARKER } from '../rag/no-support-marker';
import {
  ChatService,
  RAG_TRUNCATION_NOTE,
  noEvidenceMessage,
  type ChatStreamEvent,
} from './chat.service';
import type { ChatHistoryGateway } from './chat-history.gateway';

/**
 * Comportamientos del flujo de chat exigidos por los lineamientos del cliente
 * (Hito 3) y corregidos tras la auditoría de cumplimiento de 2026-09-23.
 */

const authorization: AuthorizationContext = {
  email: 'docente@example.com',
  emailConfirmedAt: '2026-08-22T00:00:00.000Z',
  role: 'docente',
  userId: '4c8b56af-6d0c-4fef-881e-7c00907540dd',
};
const CONVERSATION_ID = '9c8b56af-6d0c-4fef-881e-7c00907540dd';
const MODULE_ID = '8c8b56af-6d0c-4fef-881e-7c00907540dd';

const source = {
  articleReference: 'Artículo 5',
  chunkContent: 'La licencia se solicita dentro de 5 días.',
  chunkId: '5c8b56af-6d0c-4fef-881e-7c00907540dd',
  documentId: '6c8b56af-6d0c-4fef-881e-7c00907540dd',
  documentSituation: 'current' as const,
  documentTitle: 'Norma de licencias',
  documentVersionId: '7c8b56af-6d0c-4fef-881e-7c00907540dd',
  lexicalScore: 0.2,
  moduleIds: [MODULE_ID],
  moduleNames: ['Licencias'],
  numeralReference: null,
  pageEnd: 1,
  pageStart: 1,
  sectionTitle: 'Licencias',
  semanticScore: 0.9,
  versionNumber: 1,
};

function tokens(...values: string[]) {
  return {
    async *[Symbol.asyncIterator]() {
      await Promise.resolve();
      for (const value of values) yield value;
    },
  };
}

describe('ChatService — lineamientos del cliente', () => {
  let answerGateway: { generate: jest.Mock };
  let historyGateway: Record<keyof ChatHistoryGateway, jest.Mock>;
  let ragService: { retrieve: jest.Mock };
  let service: ChatService;

  async function collect(
    input: Partial<Parameters<ChatService['stream']>[0]> = {},
  ): Promise<ChatStreamEvent[]> {
    const events: ChatStreamEvent[] = [];
    for await (const event of service.stream({
      authorization,
      conversationId: null,
      question: '¿Cuál es el plazo de la licencia?',
      selectedModuleId: null,
      ...input,
    })) {
      events.push(event);
    }
    return events;
  }

  function completion() {
    const calls = historyGateway.completeTurn.mock.calls as Array<
      [Parameters<ChatHistoryGateway['completeTurn']>[0]]
    >;
    return calls[0]?.[0];
  }

  beforeEach(() => {
    answerGateway = { generate: jest.fn() };
    historyGateway = {
      beginTurn: jest.fn().mockResolvedValue({
        conversationId: CONVERSATION_ID,
        userMessageId: 'ac8b56af-6d0c-4fef-881e-7c00907540dd',
      }),
      completeTurn: jest.fn().mockResolvedValue({
        answerMessageId: 'bc8b56af-6d0c-4fef-881e-7c00907540dd',
      }),
      createSourceDownloadUrl: jest.fn(),
      deleteConversation: jest.fn(),
      getConversation: jest.fn(),
      getConversationContext: jest.fn(),
      listActiveModules: jest.fn().mockResolvedValue([
        {
          code: 'b',
          description: null,
          id: 'b',
          name: 'Remuneraciones',
          parentModuleId: null,
          sortOrder: 2,
        },
        {
          code: 'a',
          description: null,
          id: 'a',
          name: 'Situaciones administrativas',
          parentModuleId: null,
          sortOrder: 1,
        },
        {
          code: 's',
          description: null,
          id: 's',
          name: 'Licencias docentes',
          parentModuleId: 'a',
          sortOrder: 1,
        },
      ]),
      listConversations: jest.fn(),
      recordTechnicalFailure: jest.fn(),
    };
    ragService = { retrieve: jest.fn() };
    service = new ChatService(
      answerGateway,
      historyGateway,
      ragService as never,
      { get: jest.fn().mockReturnValue(undefined) } as never,
      { prepare: jest.fn().mockReturnValue(null) } as never,
    );
  });

  describe('puntos 4 y 9: el modelo declara que las fuentes no responden', () => {
    it('cierra el turno como «sin evidencia», sin mostrar ni guardar fuentes', async () => {
      ragService.retrieve.mockResolvedValue({
        kind: 'evidence',
        resolvedModule: { id: MODULE_ID, name: 'Licencias' },
        sources: [source],
        topRelevanceScore: 0.56,
      });
      answerGateway.generate.mockReturnValue(
        tokens('[[SIN_', 'SUSTENTO]]', ' Las fuentes no tratan el tema.'),
      );

      const events = await collect();

      expect(events.map((event) => event.type)).toEqual([
        'conversation',
        'no_evidence',
        'done',
      ]);
      expect(events[1]).toEqual({
        data: { message: noEvidenceMessage('current') },
        type: 'no_evidence',
      });
      expect(completion()).toMatchObject({
        replyRole: 'no_evidence',
        sources: [],
        unansweredReason: 'insufficient_evidence',
      });
    });

    it('en una respuesta parcial quita la marca y la señala para revisión', async () => {
      ragService.retrieve.mockResolvedValue({
        kind: 'evidence',
        resolvedModule: { id: MODULE_ID, name: 'Licencias' },
        sources: [source],
        topRelevanceScore: 0.9,
      });
      answerGateway.generate.mockReturnValue(
        tokens(
          'La licencia se solicita dentro de 5 días [1]. ',
          RAG_NO_SUPPORT_MARKER,
          ' El monto no figura en los documentos.',
        ),
      );

      const events = await collect();
      const streamed = events
        .filter((event) => event.type === 'token')
        .map((event) => event.data.text)
        .join('');

      expect(streamed).not.toContain('SIN_SUSTENTO');
      expect(completion()?.answer).toBe(streamed.trim());
      expect(completion()?.qualitySignals).toContain('support_partial');
      expect(events.map((event) => event.type)).toContain('sources');
    });
  });

  it('avisa en lenguaje llano cuando el proveedor corta la respuesta por su extensión', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      resolvedModule: { id: MODULE_ID, name: 'Licencias' },
      sources: [source],
      topRelevanceScore: 0.9,
    });
    answerGateway.generate.mockImplementation(
      (input: { onFinish?: (reason: string | null) => void }) => ({
        async *[Symbol.asyncIterator]() {
          await Promise.resolve();
          yield 'La licencia se solicita dentro de 5 días [1]. Además';
          input.onFinish?.('length');
        },
      }),
    );

    const events = await collect();

    expect(completion()?.answer.endsWith(RAG_TRUNCATION_NOTE)).toBe(true);
    expect(events.at(-2)).toEqual({
      data: { text: `\n\n${RAG_TRUNCATION_NOTE}` },
      type: 'token',
    });
  });

  it('marca para revisión una cifra que no figura en la fuente citada', async () => {
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      resolvedModule: { id: MODULE_ID, name: 'Licencias' },
      sources: [source],
      topRelevanceScore: 0.9,
    });
    answerGateway.generate.mockReturnValue(
      tokens('La licencia se solicita dentro de 45 días hábiles [1].'),
    );

    await collect();

    expect(completion()?.qualitySignals).toContain('citation_insufficient');
  });

  describe('punto 10: pedido sin relación aparente y sin sustento', () => {
    it('orienta sobre el alcance sin crear conversación ni cola de pendientes', async () => {
      ragService.retrieve.mockResolvedValue({
        kind: 'no_evidence',
        topRelevanceScore: null,
      });

      const events = await collect({
        question: '¿Cuál es la mejor época para sembrar papa?',
      });

      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe('conversational');
      expect(historyGateway.beginTurn).not.toHaveBeenCalled();
      expect(historyGateway.completeTurn).not.toHaveBeenCalled();
    });

    it('una consulta del ámbito sin documentos sí se registra como pendiente', async () => {
      ragService.retrieve.mockResolvedValue({
        kind: 'no_evidence',
        topRelevanceScore: null,
      });

      await collect({
        question: '¿Puedo solicitar destaque si estoy nombrado?',
      });

      expect(completion()).toMatchObject({
        unansweredReason: 'insufficient_evidence',
      });
    });
  });

  describe('punto 6: continuidad', () => {
    it('una conversación general no se parte cuando la evidencia resuelve un módulo', async () => {
      historyGateway.getConversationContext.mockResolvedValue({
        messages: [
          {
            content: '¿Cuál es el plazo para presentar la solicitud?',
            role: 'user',
          },
          {
            content: '¿Sobre cuál de ellos es tu consulta?',
            role: 'clarification',
          },
        ],
        selectedModuleId: null,
      });
      ragService.retrieve.mockResolvedValue({
        kind: 'evidence',
        resolvedModule: { id: MODULE_ID, name: 'Licencias' },
        sources: [source],
        topRelevanceScore: 0.9,
      });
      answerGateway.generate.mockReturnValue(
        tokens('La licencia se solicita dentro de 5 días [1].'),
      );

      const events = await collect({
        conversationId: CONVERSATION_ID,
        question: 'de licencias',
      });

      expect(historyGateway.beginTurn).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: CONVERSATION_ID,
          selectedModuleId: null,
        }),
      );
      const generateCalls = answerGateway.generate.mock.calls as Array<
        [{ conversationContext: Array<{ content: string }> }]
      >;
      expect(generateCalls[0]?.[0].conversationContext[0]?.content).toBe(
        '¿Cuál es el plazo para presentar la solicitud?',
      );
      expect(events[0]).toMatchObject({
        data: { startedNewConversation: false },
        type: 'conversation',
      });
      // El módulo detectado se registra en el turno, no en la conversación.
      expect(completion()?.detectedModuleId).toBe(MODULE_ID);
    });

    it('un cambio de tema anunciado empieza sin arrastrar el tema anterior', async () => {
      ragService.retrieve.mockResolvedValue({
        kind: 'no_evidence',
        topRelevanceScore: null,
      });

      await collect({
        conversationId: CONVERSATION_ID,
        question: 'Otra consulta: ¿cuántos días de vacaciones tengo?',
      });

      expect(historyGateway.getConversationContext).not.toHaveBeenCalled();
      expect(ragService.retrieve).toHaveBeenCalledWith(
        'Otra consulta: ¿cuántos días de vacaciones tengo?',
        null,
        [],
      );
      expect(historyGateway.beginTurn).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: null }),
      );
    });

    it('en una conversación, un seguimiento breve con palabra ajena usa el RAG con contexto', async () => {
      historyGateway.getConversationContext.mockResolvedValue({
        messages: [{ content: '¿Puedo suspender clases?', role: 'user' }],
        selectedModuleId: null,
      });
      ragService.retrieve.mockResolvedValue({
        kind: 'no_evidence',
        topRelevanceScore: null,
      });

      const events = await collect({
        conversationId: CONVERSATION_ID,
        question: '¿y si va a llover?',
      });

      expect(ragService.retrieve).toHaveBeenCalled();
      expect(events.map((event) => event.type)).toContain('no_evidence');
    });
  });

  describe('puntos 5 y 12: consulta sin tema que requiere precisión', () => {
    it('pide el trámite con los temas reales como opciones y guarda la aclaración', async () => {
      const events = await collect({ question: '¿Cuáles son los requisitos?' });

      expect(ragService.retrieve).not.toHaveBeenCalled();
      expect(events.map((event) => event.type)).toEqual([
        'conversation',
        'clarification',
        'done',
      ]);
      const clarification = events[1] as {
        data: { message: string; modules: Array<{ id: string; name: string }> };
      };
      expect(clarification.data.message).toContain('sobre qué trámite');
      expect(clarification.data.modules).toEqual([
        { id: 'a', name: 'Situaciones administrativas' },
        { id: 'b', name: 'Remuneraciones' },
      ]);
      expect(completion()).toMatchObject({
        replyRole: 'clarification',
        unansweredReason: 'ambiguous_request',
      });
    });

    it('con un módulo elegido, la misma pregunta se busca en ese tema', async () => {
      ragService.retrieve.mockResolvedValue({
        kind: 'no_evidence',
        topRelevanceScore: null,
      });

      await collect({
        question: '¿Cuáles son los requisitos?',
        selectedModuleId: MODULE_ID,
      });

      expect(ragService.retrieve).toHaveBeenCalledWith(
        '¿Cuáles son los requisitos?',
        MODULE_ID,
        [],
      );
    });
  });

  describe('punto 2: charla y capacidades', () => {
    it('«¿qué puedes hacer?» lista los temas raíz reales, en su orden', async () => {
      const events = await collect({ question: '¿Qué puedes hacer?' });

      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe('conversational');
      const message = (events[0] as { data: { message: string } }).data.message;
      expect(message).toContain(
        'Hoy puedes consultarme sobre: Situaciones administrativas y Remuneraciones.',
      );
      expect(message).not.toContain('Licencias docentes');
      expect(ragService.retrieve).not.toHaveBeenCalled();
    });

    it('si la lista de temas falla, igual responde sin ellos', async () => {
      historyGateway.listActiveModules.mockRejectedValue(new Error('down'));

      const events = await collect({ question: '¿Qué puedes hacer?' });

      expect(events[0]?.type).toBe('conversational');
    });

    it.each([
      'Buenas tardes, ¿cómo está?',
      'perfecto 👍',
      'tengo una consulta',
    ])(
      '«%s» responde con calidez sin RAG ni persistencia',
      async (question) => {
        const events = await collect({ question });

        expect(events.map((event) => event.type)).toEqual(['conversational']);
        expect(ragService.retrieve).not.toHaveBeenCalled();
        expect(historyGateway.beginTurn).not.toHaveBeenCalled();
      },
    );
  });
});
