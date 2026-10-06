import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { AuthorizationContext } from '../authorization';
import type { ModuleOverview } from './catalog/chat-catalog.service';
import { ChatService, type ChatStreamEvent } from './chat.service';

const authorization: AuthorizationContext = {
  email: 'docente@example.com',
  emailConfirmedAt: '2026-08-22T00:00:00.000Z',
  role: 'docente',
  userId: '4c8b56af-6d0c-4fef-881e-7c00907540dd',
};

const modules = [
  {
    code: 'REM',
    description: null,
    id: 'rem',
    name: 'Remuneraciones',
    parentModuleId: null,
    sortOrder: 0,
  },
  {
    code: 'ESC',
    description: null,
    id: 'esc',
    name: 'Escala remunerativa',
    parentModuleId: 'rem',
    sortOrder: 0,
  },
];

function overview(overrides: Partial<ModuleOverview> = {}): ModuleOverview {
  return {
    documents: [
      {
        documentType: 'RESOLUCION_MINISTERIAL',
        id: 'padrones',
        issuanceYear: 2026,
        resolutionNumber: null,
        summary: 'Aprueba los padrones para las asignaciones.',
        title: 'Aprueban Padrones de Instituciones Educativas',
      },
    ],
    moduleId: 'rem',
    moduleName: 'Remuneraciones',
    scope: 'module',
    scopeName: 'Remuneraciones',
    total: 1,
    ...overrides,
  };
}

function setup(
  catalogOverrides: Record<string, jest.Mock> = {},
  withCatalog = true,
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
  const ragService = {
    retrieve: jest
      .fn()
      .mockResolvedValue({ kind: 'no_evidence', topRelevanceScore: null }),
  };
  const catalogService = {
    availableDocuments: jest
      .fn()
      .mockResolvedValue([
        { title: 'Aprueban Padrones de Instituciones Educativas' },
      ]),
    coverageSummary: jest.fn().mockResolvedValue(null),
    moduleOverview: jest.fn().mockResolvedValue(overview()),
    reply: jest.fn(),
    ...catalogOverrides,
  };
  const service = new ChatService(
    { generate: jest.fn() },
    historyGateway as never,
    ragService as never,
    { get: jest.fn().mockReturnValue(20) } as never,
    { prepare: jest.fn().mockReturnValue(null) } as never,
    withCatalog ? (catalogService as never) : undefined,
  );
  return { catalogService, historyGateway, ragService, service };
}

async function collect(
  service: ChatService,
  input: Partial<Parameters<ChatService['stream']>[0]> = {},
): Promise<ChatStreamEvent[]> {
  const events: ChatStreamEvent[] = [];
  for await (const event of service.stream({
    authorization,
    conversationId: null,
    question: 'de que trata la renumeracion',
    selectedModuleId: 'esc',
    ...input,
  })) {
    events.push(event);
  }
  return events;
}

describe('ChatService — panorama del tema y errores de escritura', () => {
  it('«¿de qué trata la renumeración?» corrige la palabra y muestra el panorama', async () => {
    const { catalogService, historyGateway, ragService, service } = setup();

    const events = await collect(service);

    expect(events).toHaveLength(1);
    const [event] = events;
    if (event?.type !== 'conversational') {
      throw new Error('Expected a conversational event.');
    }
    expect(event.data.message).toContain('Sobre **Remuneraciones**');
    expect(event.data.message).toContain(
      'Aprueba los padrones para las asignaciones.',
    );
    expect(event.data.suggestions).toEqual([
      '¿Qué establece «Aprueban Padrones de Instituciones Educativas»?',
    ]);
    expect(catalogService.moduleOverview).toHaveBeenCalledWith({
      module: modules[0],
      parent: null,
    });
    // Efímero, como el resto de respuestas conversacionales.
    expect(historyGateway.beginTurn).not.toHaveBeenCalled();
    expect(ragService.retrieve).not.toHaveBeenCalled();
  });

  it('«¿de qué tienes información?» dentro de un tema muestra ese tema', async () => {
    const { catalogService, service } = setup();

    const [event] = await collect(service, {
      question: '¿De qué tienes información?',
    });

    expect(event?.type).toBe('conversational');
    expect(catalogService.moduleOverview).toHaveBeenCalledWith({
      module: modules[1],
      parent: modules[0],
    });
    expect(catalogService.reply).not.toHaveBeenCalled();
  });

  it('si el tema no tiene documentos, la consulta sigue al RAG', async () => {
    const { ragService, service } = setup({
      moduleOverview: jest
        .fn()
        .mockResolvedValue(
          overview({ documents: [], scope: 'empty', total: 0 }),
        ),
    });

    const events = await collect(service);

    expect(ragService.retrieve).toHaveBeenCalledWith(
      'de que trata la remuneraciones',
      'esc',
      [],
      { forceContext: false },
    );
    expect(events.some((event) => event.type === 'no_evidence')).toBe(true);
  });

  it('el catálogo de un tema sin documentos cae al catálogo general', async () => {
    const { catalogService, service } = setup({
      moduleOverview: jest
        .fn()
        .mockResolvedValue(
          overview({ documents: [], scope: 'empty', total: 0 }),
        ),
      reply: jest.fn().mockResolvedValue({
        documents: [],
        message: 'Catálogo general',
        suggestions: [],
      }),
    });

    const [event] = await collect(service, {
      question: '¿De qué tienes información?',
    });

    expect(catalogService.reply).toHaveBeenCalled();
    expect(event).toEqual({
      data: { documents: [], message: 'Catálogo general' },
      type: 'conversational',
    });
  });

  it('«¿de qué trata?» a secas dentro de una conversación lo resuelve el RAG', async () => {
    const { catalogService, historyGateway, service } = setup();
    historyGateway.getConversationContext.mockResolvedValue({
      conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
      messages: [],
      selectedModuleId: 'esc',
    });

    await collect(service, {
      conversationId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
      question: '¿De qué trata?',
    });

    expect(catalogService.moduleOverview).not.toHaveBeenCalled();
  });

  it('un tema que no coincide con ningún módulo sigue al RAG', async () => {
    const { catalogService, ragService, service } = setup();

    await collect(service, { question: '¿De qué trata el artículo 5?' });

    expect(catalogService.moduleOverview).not.toHaveBeenCalled();
    expect(ragService.retrieve).toHaveBeenCalled();
  });

  it('si el panorama falla, lo registra y sigue al RAG', async () => {
    const { ragService, service } = setup({
      moduleOverview: jest.fn().mockRejectedValue(new Error('db down')),
    });

    await collect(service);

    expect(ragService.retrieve).toHaveBeenCalled();
  });

  it('corrige errores comunes aunque el catálogo de módulos no esté disponible', async () => {
    const { historyGateway, ragService, service } = setup({
      moduleOverview: jest
        .fn()
        .mockResolvedValue(
          overview({ documents: [], scope: 'empty', total: 0 }),
        ),
    });
    historyGateway.listActiveModules.mockRejectedValueOnce(
      new Error('db down'),
    );

    await collect(service, {
      question: '¿Cuál es el plazo de la renumeracion?',
    });

    expect(ragService.retrieve).toHaveBeenCalledWith(
      '¿Cuál es el plazo de la remuneración?',
      'esc',
      [],
      { forceContext: false },
    );
  });

  it('la memoria de preguntas guarda lo que escribió la persona, no la corrección', async () => {
    const prepare = jest.fn().mockReturnValue(null);
    const { service } = setup({
      moduleOverview: jest
        .fn()
        .mockResolvedValue(
          overview({ documents: [], scope: 'empty', total: 0 }),
        ),
    });
    (
      service as unknown as { faqMemoryService: { prepare: jest.Mock } }
    ).faqMemoryService.prepare = prepare;

    await collect(service);

    expect(prepare).toHaveBeenCalledWith('de que trata la renumeracion');
  });

  it('sin catálogo no intenta panoramas', async () => {
    const { ragService, service } = setup({}, false);

    await collect(service);

    expect(ragService.retrieve).toHaveBeenCalled();
  });

  describe('listUpdates (consultas ya resueltas)', () => {
    it('pide las resoluciones de los últimos 30 días del propio docente', async () => {
      const now = jest
        .spyOn(Date, 'now')
        .mockReturnValue(Date.parse('2026-09-30T00:00:00.000Z'));
      try {
        const listResolvedConsultations = jest.fn().mockResolvedValue([]);
        const service = new ChatService(
          { generate: jest.fn() },
          {} as never,
          {} as never,
          { get: jest.fn() } as never,
          { prepare: jest.fn() } as never,
          undefined,
          { listResolvedConsultations },
        );

        await expect(service.listUpdates(authorization)).resolves.toEqual([]);
        expect(listResolvedConsultations).toHaveBeenCalledWith({
          since: '2026-08-31T00:00:00.000Z',
          userId: authorization.userId,
        });
      } finally {
        now.mockRestore();
      }
    });

    it('sin la fuente de novedades devuelve una lista vacía', async () => {
      const { service } = setup();

      await expect(service.listUpdates(authorization)).resolves.toEqual([]);
    });
  });

  describe('moduleOverview (panorama al abrir un tema)', () => {
    it('devuelve el panorama del tema con su tema principal', async () => {
      const { catalogService, service } = setup();

      await expect(service.moduleOverview('esc')).resolves.toEqual(overview());
      expect(catalogService.moduleOverview).toHaveBeenCalledWith({
        module: modules[1],
        parent: modules[0],
      });
    });

    it('un tema inexistente o inactivo responde 404', async () => {
      const { service } = setup();

      await expect(service.moduleOverview('otro')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('sin catálogo configurado responde 503', async () => {
      const { service } = setup({}, false);

      await expect(service.moduleOverview('esc')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('los módulos se reutilizan unos minutos y un fallo se reintenta', async () => {
      const { historyGateway, service } = setup();
      historyGateway.listActiveModules.mockRejectedValueOnce(
        new Error('db down'),
      );

      await expect(service.moduleOverview('esc')).rejects.toThrow('db down');
      await service.moduleOverview('esc');
      await service.moduleOverview('rem');

      expect(historyGateway.listActiveModules).toHaveBeenCalledTimes(2);
    });
  });
});
