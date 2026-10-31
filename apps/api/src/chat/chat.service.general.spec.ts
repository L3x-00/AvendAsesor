import type { AuthorizationContext } from '../authorization';
import { ChatService, type ChatStreamEvent } from './chat.service';
import type { TopicIntentId } from '../rag/topic-intent';

/**
 * Regresión de las siete consultas del Chat General. La persona no elige
 * módulo: el asistente identifica la intención, busca en la documentación que
 * la trata y, cuando no existe, lo informa por tema sin pedir una aclaración ni
 * ofrecer otros módulos. La conversación general no queda atada a un módulo.
 */

const authorization: AuthorizationContext = {
  email: 'docente@example.com',
  emailConfirmedAt: '2026-08-22T00:00:00.000Z',
  role: 'docente',
  userId: '4c8b56af-6d0c-4fef-881e-7c00907540dd',
};

const CONVERSATION_ID = '9c8b56af-6d0c-4fef-881e-7c00907540dd';

function module(
  id: string,
  name: string,
  sortOrder: number,
  parentModuleId: string | null = null,
) {
  return { code: id, description: null, id, name, parentModuleId, sortOrder };
}

const modules = [
  module('con', 'Contratación y desplazamientos', 2),
  module('sit', 'Situaciones Administrativas', 3),
  module('rem', 'Remuneraciones', 4),
  module('aux', 'Auxiliar de educación', 5),
  module('eva', 'Evaluación docente', 6),
  module('car', 'Cargos y plazas', 7),
];

const catalogDocuments = [
  { id: 'doc-con', moduleIds: ['con'], title: 'Reasignación' },
  { id: 'doc-sit', moduleIds: ['sit'], title: 'Licencias' },
  { id: 'doc-rem', moduleIds: ['rem'], title: 'Asignación rural' },
  { id: 'doc-aux', moduleIds: ['aux'], title: 'Contratación de auxiliares' },
];

const questions = {
  reassignment:
    'soy nombrado en junin pero quiero irme a lima porque mi familia vive alla que hago',
  medical:
    'el doctor me dio descanso por 15 dias como justifico eso en mi colegio',
  rural: 'mi colegio esta en zona rural me toca recibir un pago adicional',
  career:
    'ya tengo varios años en primera escala como hago para subir a segunda',
  auxiliary:
    'mi hermana quiere trabajar de auxiliar en inicial que estudios necesita',
  disciplinary:
    'mi director dice que me va sancionar pero yo quiero saber si tengo derecho a defenderme',
  rationalization:
    'en mi colegio estan bajando los alumnos y dicen que van a reducir plazas eso se puede',
} as const;

function evidenceSource(input: {
  chunkContent: string;
  chunkId: string;
  documentTitle: string;
  moduleId: string;
  moduleName: string;
  page: number;
}) {
  return {
    articleReference: null,
    chunkContent: input.chunkContent,
    chunkId: input.chunkId,
    documentId: `${input.chunkId}-document`,
    documentSituation: 'current' as const,
    documentTitle: input.documentTitle,
    documentVersionId: `${input.chunkId}-version`,
    lexicalScore: 0.6,
    moduleIds: [input.moduleId],
    moduleNames: [input.moduleName],
    numeralReference: null,
    pageEnd: input.page,
    pageStart: input.page,
    sectionTitle: null,
    semanticScore: 0.8,
    versionNumber: 1,
  };
}

const answers: Record<
  Exclude<TopicIntentId, 'career-progression' | 'rationalization'>,
  ReturnType<typeof evidenceSource>
> = {
  reassignment: evidenceSource({
    chunkContent:
      'La reasignación por unidad familiar procede cuando el profesor acredita convivencia familiar en la jurisdicción de destino.',
    chunkId: 'reassignment',
    documentTitle: 'Norma técnica de la reasignación y permuta docente',
    moduleId: 'con',
    moduleName: 'Contratación y desplazamientos',
    page: 16,
  }),
  'medical-leave': evidenceSource({
    chunkContent:
      'La licencia por incapacidad temporal se otorga conforme al periodo de descanso médico indicado en el CITT.',
    chunkId: 'medical',
    documentTitle: 'Norma Técnica de licencias, permisos y vacaciones',
    moduleId: 'sit',
    moduleName: 'Situaciones Administrativas',
    page: 16,
  }),
  'rural-allocation': evidenceSource({
    chunkContent:
      'Artículo 1.- Decreta: la asignación por trabajo en ámbito rural corresponde al profesor que presta servicios en una institución educativa pública rural incluida en el padrón.',
    chunkId: 'rural',
    documentTitle: 'Modifica monto de asignación rural tipo 1',
    moduleId: 'rem',
    moduleName: 'Remuneraciones',
    page: 1,
  }),
  'auxiliary-requirements': evidenceSource({
    chunkContent:
      'Requisitos específicos para la contratación de auxiliares de educación en el nivel inicial: formación académica y documentos del expediente.',
    chunkId: 'auxiliary',
    documentTitle:
      'Norma que regula la contratación de auxiliares de educación',
    moduleId: 'aux',
    moduleName: 'Auxiliar de educación',
    page: 21,
  }),
  disciplinary: evidenceSource({
    chunkContent:
      'En el proceso administrativo disciplinario, el profesor notificado tiene derecho a presentar sus descargos y medios probatorios para su defensa.',
    chunkId: 'disciplinary',
    documentTitle:
      'Disposiciones sobre el proceso administrativo disciplinario',
    moduleId: 'sit',
    moduleName: 'Situaciones Administrativas',
    page: 30,
  }),
};

function setup() {
  const historyGateway = {
    beginTurn: jest.fn().mockResolvedValue({
      conversationId: CONVERSATION_ID,
      userMessageId: 'ac8b56af-6d0c-4fef-881e-7c00907540dd',
    }),
    completeTurn: jest.fn().mockResolvedValue({
      answerMessageId: 'bc8b56af-6d0c-4fef-881e-7c00907540dd',
    }),
    getConversationContext: jest.fn().mockResolvedValue({
      conversationId: CONVERSATION_ID,
      messages: [],
      selectedModuleId: null,
    }),
    listActiveModules: jest.fn().mockResolvedValue(modules),
    recordTechnicalFailure: jest.fn(),
  };
  const catalogService = {
    availableDocuments: jest.fn().mockResolvedValue(catalogDocuments),
    moduleOverview: jest.fn(),
    reply: jest.fn(),
  };
  const ragService = {
    retrieve: jest
      .fn()
      .mockImplementation(
        (
          _question: string,
          _moduleId: string | null,
          _context: unknown,
          options: { topicIntent?: { id: TopicIntentId } },
        ) => {
          const intent = options?.topicIntent?.id;
          if (
            intent === 'career-progression' ||
            intent === 'rationalization' ||
            !intent
          ) {
            return Promise.resolve({
              kind: 'no_evidence',
              topRelevanceScore: null,
            });
          }
          return Promise.resolve({
            kind: 'evidence',
            resolvedModule: { id: 'auto', name: 'Tema detectado' },
            sources: [answers[intent]],
            topRelevanceScore: 0.8,
          });
        },
      ),
  };
  const answerGateway = {
    generate: jest.fn().mockImplementation(() =>
      (async function* () {
        await Promise.resolve();
        yield 'Respuesta sustentada en la fuente citada [1].';
      })(),
    ),
  };
  const service = new ChatService(
    answerGateway,
    historyGateway as never,
    ragService as never,
    { get: jest.fn().mockReturnValue(20) } as never,
    { prepare: jest.fn().mockReturnValue(null) } as never,
    catalogService as never,
  );
  return { answerGateway, catalogService, historyGateway, ragService, service };
}

async function collect(
  service: ChatService,
  question: string,
): Promise<ChatStreamEvent[]> {
  const events: ChatStreamEvent[] = [];
  for await (const event of service.stream({
    authorization,
    conversationId: CONVERSATION_ID,
    question,
    selectedModuleId: null,
  })) {
    events.push(event);
  }
  return events;
}

function messageOf(
  events: ChatStreamEvent[],
  type: 'no_evidence' | 'clarification',
): string {
  const reply = events.find((event) => event.type === type);
  if (!reply || !('message' in reply.data)) {
    throw new Error(`Se esperaba un evento ${type}.`);
  }
  return reply.data.message;
}

describe('ChatService — siete consultas del chat general', () => {
  it.each([
    ['reassignment', questions.reassignment, 'reassignment'],
    ['medical-leave', questions.medical, 'medical-leave'],
    ['rural-allocation', questions.rural, 'rural-allocation'],
    ['career-progression', questions.career, 'career-progression'],
    ['auxiliary-requirements', questions.auxiliary, 'auxiliary-requirements'],
    ['disciplinary', questions.disciplinary, 'disciplinary'],
    ['rationalization', questions.rationalization, 'rationalization'],
  ] as const)(
    '%s: identifica la intención y no ofrece módulos alternativos',
    async (_label, question, intentId) => {
      const { ragService, service } = setup();

      const events = await collect(service, question);

      const calls = ragService.retrieve.mock.calls as Array<
        [string, string | null, unknown, { topicIntent?: { id: string } }]
      >;
      expect(calls[0]?.[0]).toBe(question);
      expect(calls[0]?.[1]).toBeNull();
      expect(calls[0]?.[3]?.topicIntent?.id).toBe(intentId);
      expect(events.some((event) => event.type === 'clarification')).toBe(
        false,
      );
      const conversation = events[0];
      expect(conversation).toMatchObject({
        data: { moduleId: null },
        type: 'conversation',
      });
      const done = events.at(-1);
      expect(done?.type).toBe('done');
      const doneData =
        done && 'data' in done ? (done.data as Record<string, unknown>) : {};
      expect(doneData).not.toHaveProperty('modules');
    },
  );

  it.each([
    [
      questions.career,
      'el ascenso de escala magisterial',
      'Evaluación docente',
    ],
    [
      questions.rationalization,
      'la racionalización de plazas',
      'Cargos y plazas',
    ],
  ])(
    'sin documentos del tema informa la ausencia específica: «%s»',
    async (question, label, moduleName) => {
      const { service } = setup();

      const events = await collect(service, question);
      const message = messageOf(events, 'no_evidence');

      expect(message).toContain('no cuento con documentación disponible');
      expect(message).toContain(label);
      expect(message).toContain(moduleName);
      expect(message).not.toContain('¿Qué trámite');
      expect(message).not.toContain('Auxiliar de educación');
      expect(events.some((event) => event.type === 'clarification')).toBe(
        false,
      );
    },
  );

  it.each([
    [questions.reassignment, 'reasignación'],
    [questions.medical, 'incapacidad temporal'],
    [questions.rural, 'asignación por trabajo'],
    [questions.auxiliary, 'auxiliares de educación'],
    [questions.disciplinary, 'derecho a presentar sus descargos'],
  ])(
    'responde con evidencia y cita la fuente: «%s»',
    async (question, expected) => {
      const { service } = setup();

      const events = await collect(service, question);
      const token = events.find((event) => event.type === 'token');
      const sources = events.find((event) => event.type === 'sources');

      expect(token).toBeDefined();
      expect(sources).toBeDefined();
      if (token && 'text' in token) {
        expect(token.data.text).toMatch(/\[\d+\]/u);
      }
      if (sources && 'sources' in sources) {
        expect(sources.data.sources.length).toBeGreaterThan(0);
      }
      expect(events.some((event) => event.type === 'no_evidence')).toBe(false);
      expect(expected.length).toBeGreaterThan(0);
    },
  );

  it('un chat de módulo conserva su módulo aunque el cliente omita el id', async () => {
    const { historyGateway, ragService, service } = setup();
    historyGateway.getConversationContext.mockResolvedValue({
      conversationId: CONVERSATION_ID,
      messages: [],
      selectedModuleId: 'rem',
    });

    await collect(service, '¿Cómo solicito una licencia?');

    const calls = ragService.retrieve.mock.calls as Array<
      [string, string | null, unknown, { topicIntent?: unknown }]
    >;
    expect(calls[0]?.[1]).toBe('rem');
    expect(calls[0]?.[3]?.topicIntent).toBeUndefined();
    expect(historyGateway.beginTurn).toHaveBeenCalledWith(
      expect.objectContaining({ selectedModuleId: 'rem' }),
    );
  });

  it('una consulta de otro tema no usa los documentos del módulo abierto', async () => {
    const { historyGateway, ragService, service } = setup();
    historyGateway.getConversationContext.mockResolvedValue({
      conversationId: CONVERSATION_ID,
      messages: [],
      selectedModuleId: 'rem',
    });

    const events = await collect(service, questions.reassignment);

    // No se busca en Remuneraciones ni se responde con su tabla salarial.
    expect(ragService.retrieve).not.toHaveBeenCalled();
    expect(events.some((event) => event.type === 'sources')).toBe(false);
    const clarification = events.find(
      (event) => event.type === 'clarification',
    );
    expect(clarification?.type).toBe('clarification');
    if (clarification?.type !== 'clarification') return;
    expect(clarification.data.message).toContain(
      'Contratación y desplazamientos',
    );
    expect(clarification.data.modules).toEqual([
      { id: 'con', name: 'Contratación y desplazamientos' },
    ]);
    expect(events[0]).toMatchObject({
      data: { moduleId: 'rem' },
      type: 'conversation',
    });
    expect(historyGateway.beginTurn).toHaveBeenCalledWith(
      expect.objectContaining({ selectedModuleId: 'rem' }),
    );
    const done = events.at(-1);
    const doneData =
      done && 'data' in done ? (done.data as Record<string, unknown>) : {};
    expect(doneData).not.toHaveProperty('modules');
  });

  it('una nueva intención no arrastra la clasificación salarial anterior', async () => {
    const { historyGateway, ragService, service } = setup();
    historyGateway.getConversationContext.mockResolvedValue({
      conversationId: CONVERSATION_ID,
      messages: [
        {
          content: questions.rural,
          role: 'user',
        },
        {
          content: 'La asignación por ruralidad depende del padrón. [1]',
          role: 'assistant',
        },
      ],
      selectedModuleId: null,
    });

    await collect(service, questions.career);

    const [question, moduleId, , options] = ragService.retrieve.mock
      .calls[0] as [string, string | null, string[], Record<string, unknown>];
    // La pregunta de ascenso se busca tal cual, sin una consulta sintética de
    // remuneración heredada del turno anterior.
    expect(question).toBe(questions.career);
    expect(moduleId).toBeNull();
    expect(options.topicIntent).toMatchObject({ id: 'career-progression' });
    expect(options.salaryContextQuestions).toBeUndefined();
    expect(options.personalSalary).toBeUndefined();
  });
});
