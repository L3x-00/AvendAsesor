import type { AuthorizationContext } from '../authorization';
import { ChatService, type ChatStreamEvent } from './chat.service';

/**
 * Regresión del módulo Cargos y plazas sin documentos cargados.
 *
 * Cuando la persona elige un módulo sin corpus, la pregunta puede ser clara y
 * aun así no existir fuente: corresponde una insuficiencia específica dentro
 * del mismo chat y del mismo módulo. Antes, esas consultas se desviaban a otros
 * módulos (Auxiliar de educación, Contratación y desplazamientos,
 * Remuneraciones), abrían otra conversación o pedían una aclaración inútil.
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
  module('aux', 'Auxiliar de educación', 1),
  module('con', 'Contratación y desplazamientos', 2),
  module('rem', 'Remuneraciones', 3),
  module('car', 'Cargos y plazas', 7),
  module('car-cla', 'Clasificador de cargos', 1, 'car'),
];

/**
 * Corpus cargado en otros módulos y ninguno en Cargos y plazas. Es el estado
 * real del módulo reportado: los documentos de temas parecidos existen, pero no
 * pertenecen al módulo elegido.
 */
const catalogDocuments = [
  { id: 'doc-aux', moduleIds: ['aux'], title: 'Norma de auxiliares' },
  { id: 'doc-con', moduleIds: ['con'], title: 'Norma de contratación' },
  { id: 'doc-rem', moduleIds: ['rem'], title: 'Norma de remuneraciones' },
];

const sevenQuestions = [
  '¿Qué es el cuadro de distribución de horas y para qué lo usan?',
  'Soy profesor de secundaria y quiero saber quién decide cuántas horas me tocan',
  '¿Qué significa cuando dicen que mi plaza está excedente?',
  'Si en mi colegio hay pocos alumnos, ¿pueden quitar una plaza docente?',
  '¿Cuál es la diferencia entre una plaza orgánica y una eventual?',
  '¿Dónde puedo revisar el clasificador de cargos de mi colegio?',
  'Soy nombrado y mi colegio entró a racionalización, ¿me pueden mandar a otra escuela?',
];

function setup(
  options: {
    availableDocuments?: jest.Mock;
    contextSelectedModuleId?: string | null;
    retrieve?: jest.Mock;
  } = {},
) {
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
      selectedModuleId: options.contextSelectedModuleId ?? null,
    }),
    listActiveModules: jest.fn().mockResolvedValue(modules),
    recordTechnicalFailure: jest.fn(),
  };
  const catalogService = {
    availableDocuments:
      options.availableDocuments ??
      jest.fn().mockResolvedValue(catalogDocuments),
    moduleOverview: jest.fn(),
    reply: jest.fn(),
  };
  const ragService = {
    retrieve:
      options.retrieve ??
      jest.fn().mockResolvedValue({
        kind: 'no_evidence',
        topRelevanceScore: null,
      }),
  };
  const service = new ChatService(
    { generate: jest.fn() },
    historyGateway as never,
    ragService as never,
    { get: jest.fn().mockReturnValue(20) } as never,
    { prepare: jest.fn().mockReturnValue(null) } as never,
    catalogService as never,
  );
  return { catalogService, historyGateway, ragService, service };
}

async function collect(
  service: ChatService,
  question: string,
  input: {
    conversationId?: string | null;
    selectedModuleId?: string | null;
  } = {},
): Promise<ChatStreamEvent[]> {
  const events: ChatStreamEvent[] = [];
  for await (const event of service.stream({
    authorization,
    conversationId:
      input.conversationId === undefined
        ? CONVERSATION_ID
        : input.conversationId,
    question,
    selectedModuleId:
      input.selectedModuleId === undefined ? 'car' : input.selectedModuleId,
  })) {
    events.push(event);
  }
  return events;
}

function messageOf(events: ChatStreamEvent[]): string {
  const reply = events.find((event) => event.type === 'no_evidence');
  if (!reply || !('message' in reply.data)) {
    throw new Error('Se esperaba una respuesta de insuficiencia documental.');
  }
  return reply.data.message;
}

describe('ChatService — módulo Cargos y plazas sin documentos', () => {
  it.each(sevenQuestions)(
    '«%s» se responde dentro del mismo chat y módulo, sin evidencia inventada',
    async (question) => {
      const { historyGateway, ragService, service } = setup({
        contextSelectedModuleId: 'car',
      });

      const events = await collect(service, question);

      // Sin documentación no se busca fuera del módulo: buscar permitiría que
      // el enrutamiento propusiera Auxiliar, Contratación o Remuneraciones.
      expect(ragService.retrieve).not.toHaveBeenCalled();
      expect(events.map((event) => event.type)).toEqual([
        'conversation',
        'no_evidence',
        'done',
      ]);
      expect(events.some((event) => event.type === 'clarification')).toBe(
        false,
      );

      const conversation = events[0];
      expect(conversation).toMatchObject({
        data: {
          conversationId: CONVERSATION_ID,
          moduleId: 'car',
          startedNewConversation: false,
        },
        type: 'conversation',
      });
      expect(historyGateway.beginTurn).toHaveBeenCalledWith(
        expect.objectContaining({ selectedModuleId: 'car' }),
      );

      const message = messageOf(events);
      expect(message).toContain('no cuento con documentación disponible');
      expect(message).toContain('Cargos y plazas');
      expect(message).toContain(
        question.replace(/^¿/u, '').replace(/\?$/u, ''),
      );
      // Ni aclaración genérica sobre el trámite ni redirecciones.
      expect(message).not.toContain('¿Qué trámite');
      expect(message).not.toContain('Consultar');
      expect(message).not.toContain('Auxiliar de educación');
      expect(message).not.toContain('Contratación y desplazamientos');
      expect(message).not.toContain('Remuneraciones');

      const done = events.at(-1);
      expect(done?.type).toBe('done');
      expect(done && 'data' in done ? done.data : {}).not.toHaveProperty(
        'modules',
      );
      expect(historyGateway.completeTurn).toHaveBeenCalledWith(
        expect.objectContaining({
          replyRole: 'no_evidence',
          sources: [],
          unansweredReason: 'insufficient_evidence',
        }),
      );
      const completions = historyGateway.completeTurn.mock.calls as Array<
        [{ answer: string }]
      >;
      expect(completions[0]?.[0].answer).toBe(message);
    },
  );

  it('sin conversación previa crea una nueva que conserva el módulo elegido', async () => {
    const { service } = setup();

    const events = await collect(service, sevenQuestions[2], {
      conversationId: null,
    });

    expect(events[0]).toMatchObject({
      data: { moduleId: 'car', startedNewConversation: true },
      type: 'conversation',
    });
    expect(messageOf(events)).toContain('Cargos y plazas');
  });

  it('un subtema sin documentos propios usa los del tema principal', async () => {
    const retrieve = jest.fn().mockResolvedValue({
      kind: 'no_evidence',
      topRelevanceScore: null,
    });
    const { service } = setup({
      availableDocuments: jest
        .fn()
        .mockResolvedValue([
          ...catalogDocuments,
          { id: 'doc-car', moduleIds: ['car'], title: 'Norma de cargos' },
        ]),
      retrieve,
    });

    const events = await collect(
      service,
      '¿Cuál es la diferencia entre una plaza orgánica y una eventual?',
      { selectedModuleId: 'car-cla' },
    );

    expect(retrieve).toHaveBeenCalledWith(
      expect.any(String),
      'car-cla',
      expect.any(Array),
      expect.any(Object),
    );
    expect(messageOf(events)).toContain('Clasificador de cargos');
  });

  it('con documentos en el módulo, la falta de evidencia se distingue de un módulo vacío', async () => {
    const retrieve = jest.fn().mockResolvedValue({
      kind: 'no_evidence',
      topRelevanceScore: null,
    });
    const { service } = setup({
      availableDocuments: jest
        .fn()
        .mockResolvedValue([
          ...catalogDocuments,
          { id: 'doc-car', moduleIds: ['car'], title: 'Norma de cargos' },
        ]),
      retrieve,
    });

    const events = await collect(service, sevenQuestions[2]);

    expect(retrieve).toHaveBeenCalled();
    expect(events.some((event) => event.type === 'clarification')).toBe(false);
    const message = messageOf(events);
    expect(message).toContain('No encontré evidencia documental disponible');
    expect(message).toContain('Cargos y plazas');
    // El módulo sí tiene documentos: no se afirma que esté vacío.
    expect(message).not.toContain('no cuento con documentación disponible');
    expect(message).not.toContain('¿Qué trámite');
    // Se conserva la vía de revisión histórica del alcance vigente.
    expect(message).toContain('antecedente histórico');
  });

  it('un módulo raíz cuenta los documentos de sus subtemas como corpus', async () => {
    const retrieve = jest.fn().mockResolvedValue({
      kind: 'no_evidence',
      topRelevanceScore: null,
    });
    const { service } = setup({
      availableDocuments: jest.fn().mockResolvedValue([
        ...catalogDocuments,
        {
          id: 'doc-car-cla',
          moduleIds: ['car-cla', 'car'],
          title: 'Clasificador',
        },
      ]),
      retrieve,
    });

    const events = await collect(service, sevenQuestions[5]);

    expect(retrieve).toHaveBeenCalledWith(
      expect.any(String),
      'car',
      expect.any(Array),
      expect.any(Object),
    );
    expect(messageOf(events)).toContain('No encontré evidencia documental');
  });

  it('un saludo en un módulo vacío sigue siendo una respuesta social sin turno', async () => {
    const { historyGateway, service } = setup();

    const events = await collect(service, 'Hola, buenos días');

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('conversational');
    expect(historyGateway.beginTurn).not.toHaveBeenCalled();
  });

  it('en un módulo vacío no se pide reescribir una palabra mal escrita', async () => {
    const { service } = setup();

    const events = await collect(service, 'cuanto gana profeszz');

    expect(events.some((event) => event.type === 'clarification')).toBe(false);
    expect(messageOf(events)).toContain(
      'no cuento con documentación disponible',
    );
  });

  it('en un módulo con documentos la aclaración ortográfica se conserva', async () => {
    const { service } = setup({
      availableDocuments: jest
        .fn()
        .mockResolvedValue([
          ...catalogDocuments,
          { id: 'doc-car', moduleIds: ['car'], title: 'Norma de cargos' },
        ]),
    });

    const events = await collect(service, 'cuanto gana profeszz');

    expect(events.some((event) => event.type === 'clarification')).toBe(true);
  });

  it('si el catálogo falla con un módulo elegido, la recuperación sigue decidiendo', async () => {
    const retrieve = jest.fn().mockResolvedValue({
      kind: 'no_evidence',
      topRelevanceScore: null,
    });
    const { service } = setup({
      availableDocuments: jest.fn().mockRejectedValue(new Error('db down')),
      retrieve,
    });

    const events = await collect(service, '¿Cómo solicito una licencia?');

    expect(retrieve).toHaveBeenCalledWith(
      expect.any(String),
      'car',
      expect.any(Array),
      expect.any(Object),
    );
    // Sin cobertura comprobable no se afirma que el módulo esté vacío.
    expect(messageOf(events)).not.toContain('no cuento con documentación');
  });

  it('el chat general sin módulo conserva su flujo aunque el catálogo falle', async () => {
    const retrieve = jest.fn().mockResolvedValue({
      kind: 'ambiguous',
      modules: [{ id: 'con', name: 'Contratación y desplazamientos' }],
      sources: [],
      topRelevanceScore: 0.6,
    });
    const { service } = setup({
      availableDocuments: jest.fn().mockRejectedValue(new Error('db down')),
      retrieve,
    });

    const events = await collect(service, '¿Cómo solicito una licencia?', {
      conversationId: null,
      selectedModuleId: null,
    });

    expect(retrieve).toHaveBeenCalledWith(
      expect.any(String),
      null,
      expect.any(Array),
      expect.any(Object),
    );
    expect(events.some((event) => event.type === 'clarification')).toBe(true);
  });

  it('el chat general sin módulo mantiene la búsqueda entre temas', async () => {
    const retrieve = jest.fn().mockResolvedValue({
      kind: 'ambiguous',
      modules: [
        { id: 'con', name: 'Contratación y desplazamientos' },
        { id: 'rem', name: 'Remuneraciones' },
      ],
      sources: [],
      topRelevanceScore: 0.62,
    });
    const { service } = setup({ retrieve });

    const events = await collect(service, '¿Cómo solicito una licencia?', {
      conversationId: null,
      selectedModuleId: null,
    });

    expect(retrieve).toHaveBeenCalledWith(
      expect.any(String),
      null,
      expect.any(Array),
      expect.any(Object),
    );
    expect(
      events.find((event) => event.type === 'clarification'),
    ).toMatchObject({
      data: {
        modules: [
          { id: 'con', name: 'Contratación y desplazamientos' },
          { id: 'rem', name: 'Remuneraciones' },
        ],
      },
      type: 'clarification',
    });
  });
});
