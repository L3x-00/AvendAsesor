import type { AuthorizationContext } from '../authorization';
import { ChatService, type ChatStreamEvent } from './chat.service';

/**
 * OBS-018 / CR-11: «temas disponibles» son los módulos con corpus consultable
 * (al menos un documento aprobado e indexado), no los módulos activos.
 */

const authorization: AuthorizationContext = {
  email: 'docente@example.com',
  emailConfirmedAt: '2026-08-22T00:00:00.000Z',
  role: 'docente',
  userId: '4c8b56af-6d0c-4fef-881e-7c00907540dd',
};

function module(
  id: string,
  name: string,
  sortOrder: number,
  parentModuleId: string | null = null,
) {
  return { code: id, description: null, id, name, parentModuleId, sortOrder };
}

// Siete módulos raíz activos y un subtema; el orden de la lista no es el de
// `sortOrder` para comprobar que la respuesta respeta este último.
const modules = [
  module('lic', 'Licencias', 2),
  module('rem', 'Remuneraciones', 1),
  module('eva', 'Evaluación docente', 5),
  module('con', 'Contratación', 3),
  module('ley', 'Ley y reglamento', 6),
  module('car', 'Cargos y plazas', 7),
  module('sit', 'Situaciones administrativas', 4),
  module('rem-esc', 'Escala remunerativa', 1, 'rem'),
  module('sit-per', 'Permisos', 1, 'sit'),
];

function catalogDocument(id: string, moduleIds: string[]) {
  return { id, moduleIds, title: `Documento ${id}` };
}

// Corpus en 4 de los 7 módulos raíz: `rem` y `sit` solo por un subtema.
const documents = [
  catalogDocument('d1', ['rem-esc', 'rem']),
  catalogDocument('d2', ['lic']),
  catalogDocument('d3', ['con']),
  catalogDocument('d4', ['sit-per', 'sit']),
];

function setup(
  options: {
    availableDocuments?: jest.Mock;
    withCatalog?: boolean;
  } = {},
) {
  const historyGateway = {
    beginTurn: jest.fn().mockResolvedValue({
      conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
      userMessageId: 'ac8b56af-6d0c-4fef-881e-7c00907540dd',
    }),
    completeTurn: jest.fn().mockResolvedValue({
      answerMessageId: 'bc8b56af-6d0c-4fef-881e-7c00907540dd',
    }),
    getConversationContext: jest.fn(),
    listActiveModules: jest.fn().mockResolvedValue(modules),
    recordTechnicalFailure: jest.fn(),
  };
  const catalogService = {
    availableDocuments:
      options.availableDocuments ?? jest.fn().mockResolvedValue(documents),
    moduleOverview: jest.fn(),
    reply: jest.fn(),
  };
  const service = new ChatService(
    { generate: jest.fn() },
    historyGateway as never,
    { retrieve: jest.fn() } as never,
    { get: jest.fn().mockReturnValue(20) } as never,
    { prepare: jest.fn().mockReturnValue(null) } as never,
    options.withCatalog === false ? undefined : (catalogService as never),
  );
  return { catalogService, historyGateway, service };
}

async function collect(
  service: ChatService,
  question: string,
): Promise<ChatStreamEvent[]> {
  const events: ChatStreamEvent[] = [];
  for await (const event of service.stream({
    authorization,
    conversationId: null,
    question,
    selectedModuleId: null,
  })) {
    events.push(event);
  }
  return events;
}

function messageOf(events: ChatStreamEvent[]): string {
  const [event] = events;
  if (!event || !('message' in event.data)) {
    throw new Error('Se esperaba una respuesta con mensaje.');
  }
  return event.data.message;
}

describe('ChatService — temas con corpus consultable', () => {
  it.each(['¿Qué puedes hacer?', 'tengo una consulta'])(
    'con 7 módulos activos y 4 con corpus, «%s» lista solo los 4, en su orden',
    async (question) => {
      const { service } = setup();

      const message = messageOf(await collect(service, question));

      expect(message).toContain(
        'Hoy puedes consultarme sobre: Remuneraciones, Licencias, Contratación y Situaciones administrativas.',
      );
      for (const sinCorpus of [
        'Evaluación docente',
        'Ley y reglamento',
        'Cargos y plazas',
      ]) {
        expect(message).not.toContain(sinCorpus);
      }
      // Los subtemas no se anuncian como temas: solo los raíz.
      expect(message).not.toContain('Escala remunerativa');
      expect(message).not.toContain('Permisos');
    },
  );

  it('un módulo activo sin ningún documento consultable no aparece', async () => {
    const { service } = setup({
      availableDocuments: jest
        .fn()
        .mockResolvedValue([catalogDocument('d2', ['lic'])]),
    });

    const message = messageOf(await collect(service, '¿Qué puedes hacer?'));

    expect(message).toContain('Hoy puedes consultarme sobre: Licencias.');
    expect(message).not.toContain('Remuneraciones');
  });

  it('sin documentos consultables no anuncia ningún tema, pero responde', async () => {
    const { service } = setup({
      availableDocuments: jest.fn().mockResolvedValue([]),
    });

    const events = await collect(service, '¿Qué puedes hacer?');

    expect(events[0]?.type).toBe('conversational');
    expect(messageOf(events)).not.toContain('Hoy puedes consultarme');
  });

  it('si el catálogo falla, no promete temas que no pudo comprobar', async () => {
    const { service } = setup({
      availableDocuments: jest.fn().mockRejectedValue(new Error('db down')),
    });

    const events = await collect(service, '¿Qué puedes hacer?');

    expect(events[0]?.type).toBe('conversational');
    expect(messageOf(events)).not.toContain('Hoy puedes consultarme');
  });

  it('sin catálogo configurado tampoco anuncia temas sin comprobar', async () => {
    const { service } = setup({ withCatalog: false });

    const events = await collect(service, '¿Qué puedes hacer?');

    expect(events[0]?.type).toBe('conversational');
    expect(messageOf(events)).not.toContain('Hoy puedes consultarme');
  });

  it('al pedir precisión ofrece solo temas con corpus, conservando {message, modules}', async () => {
    const { service } = setup();

    const events = await collect(service, '¿Cuáles son los requisitos?');

    const clarification = events.find(
      (event) => event.type === 'clarification',
    );
    expect(clarification).toMatchObject({
      data: {
        modules: [
          { id: 'rem', name: 'Remuneraciones' },
          { id: 'lic', name: 'Licencias' },
          { id: 'con', name: 'Contratación' },
          { id: 'sit', name: 'Situaciones administrativas' },
        ],
      },
    });
  });

  it('al pedir precisión sin catálogo mantiene el contrato con módulos vacíos', async () => {
    const { service } = setup({ withCatalog: false });

    const events = await collect(service, '¿Cuáles son los requisitos?');

    const clarification = events.find(
      (event) => event.type === 'clarification',
    );
    expect(clarification).toMatchObject({ data: { modules: [] } });
    expect(
      (clarification as { data: { message: string } }).data.message,
    ).not.toContain('También puedes elegir');
  });

  // Revisión independiente, ronda 1, L-2.
  it('reutiliza la lista de módulos unos minutos entre preguntas de capacidad', async () => {
    const { historyGateway, service } = setup();

    await collect(service, '¿Qué puedes hacer?');
    await collect(service, 'tengo una consulta');

    expect(historyGateway.listActiveModules).toHaveBeenCalledTimes(1);
  });

  it('si el catálogo acaba de fallar al listar documentos, no lo vuelve a consultar para los temas', async () => {
    const { catalogService, service } = setup();
    catalogService.reply.mockRejectedValue(new Error('db down'));

    const events = await collect(service, '¿Qué documentos tienes?');

    expect(events[0]?.type).toBe('conversational');
    expect(messageOf(events)).not.toContain('Hoy puedes consultarme');
    expect(catalogService.availableDocuments).not.toHaveBeenCalled();
  });
});
