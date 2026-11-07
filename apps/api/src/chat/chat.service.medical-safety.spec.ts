import type { AuthorizationContext } from '../authorization';
import { ChatService, type ChatStreamEvent } from './chat.service';

const authorization: AuthorizationContext = {
  email: 'docente@example.com',
  emailConfirmedAt: '2026-08-22T00:00:00.000Z',
  role: 'docente',
  userId: '4c8b56af-6d0c-4fef-881e-7c00907540dd',
};

const source = {
  articleReference: null,
  chunkContent:
    'La licencia por incapacidad temporal del profesor se acredita con CITT o certificado médico. Para el certificado médico se adjunta receta médica.',
  chunkId: 'medical-chunk',
  documentId: 'medical-document',
  documentSituation: 'current' as const,
  documentTitle: 'Norma de licencias de profesores',
  documentVersionId: 'medical-version',
  lexicalScore: 0.6,
  moduleIds: ['sit'],
  moduleNames: ['Situaciones Administrativas'],
  numeralReference: null,
  pageEnd: 17,
  pageStart: 16,
  sectionTitle: null,
  semanticScore: 0.8,
  versionNumber: 1,
};

function setup() {
  const historyGateway = {
    beginTurn: jest.fn().mockResolvedValue({
      conversationId: 'conversation',
      userMessageId: 'question',
    }),
    completeTurn: jest.fn().mockResolvedValue({ answerMessageId: 'answer' }),
    getConversationContext: jest.fn().mockResolvedValue({
      conversationId: 'conversation',
      messages: [],
      selectedModuleId: null,
    }),
    listActiveModules: jest.fn().mockResolvedValue([
      {
        id: 'sit',
        code: 'sit',
        name: 'Situaciones Administrativas',
        description: null,
        parentModuleId: null,
        sortOrder: 0,
      },
    ]),
    recordTechnicalFailure: jest.fn().mockResolvedValue(undefined),
  };
  const answerGateway = { generate: jest.fn() };
  const ragService = {
    retrieve: jest.fn().mockResolvedValue({
      kind: 'evidence',
      resolvedModule: { id: 'sit', name: 'Situaciones Administrativas' },
      sources: [source],
      topRelevanceScore: 0.8,
    }),
  };
  const catalogService = {
    availableDocuments: jest.fn().mockResolvedValue([
      {
        id: 'medical-document',
        moduleIds: ['sit'],
        title: source.documentTitle,
      },
    ]),
    moduleOverview: jest.fn(),
    reply: jest.fn(),
  };
  const service = new ChatService(
    answerGateway,
    historyGateway as never,
    ragService as never,
    { get: jest.fn().mockReturnValue(20) } as never,
    { prepare: jest.fn().mockReturnValue(null) } as never,
    catalogService as never,
  );
  return { service, answerGateway, historyGateway, ragService };
}

async function collect(
  service: ChatService,
  signal?: AbortSignal,
  question = 'Según la Resolución Viceministerial N.° 081-2026-MINEDU, me dieron descanso médico. ¿Cómo presento mi licencia?',
) {
  const events: ChatStreamEvent[] = [];
  for await (const event of service.stream({
    authorization,
    conversationId: null,
    question,
    selectedModuleId: null,
    abortSignal: signal,
  }))
    events.push(event);
  return events;
}

describe('ChatService: retención generativa para una licencia con referencia normativa expresa', () => {
  it('no transmite ni persiste como respuesta una mezcla rechazada de CITT y receta', async () => {
    const { service, answerGateway, historyGateway } = setup();
    answerGateway.generate.mockReturnValue(
      (function* () {
        yield 'Debes presentar CITT y receta médica [1].';
      })(),
    );
    const events = await collect(service);
    expect(events.some((event) => event.type === 'token')).toBe(false);
    expect(events.some((event) => event.type === 'sources')).toBe(false);
    expect(events.some((event) => event.type === 'no_evidence')).toBe(true);
    expect(historyGateway.completeTurn).toHaveBeenCalledWith(
      expect.objectContaining({ replyRole: 'no_evidence', sources: [] }),
    );
  });

  it('no transmite ni completa el turno si se cancela durante la generación', async () => {
    const { service, answerGateway, historyGateway } = setup();
    const abort = new AbortController();
    answerGateway.generate.mockImplementation(() =>
      (function* () {
        yield 'El descanso se acredita con CITT [1].';
        abort.abort();
        yield ' Texto posterior que no debe emitirse.';
      })(),
    );
    const events = await collect(service, abort.signal);
    expect(events.some((event) => event.type === 'token')).toBe(false);
    expect(events.some((event) => event.type === 'sources')).toBe(false);
    expect(historyGateway.completeTurn).not.toHaveBeenCalled();
  });

  it('mantiene la referencia de fuente en una respuesta retenida aceptada', async () => {
    const { service, answerGateway, historyGateway, ragService } = setup();
    const secondSource = {
      ...source,
      chunkId: 'second-chunk',
      documentId: 'second-document',
      documentVersionId: 'second-version',
      pageStart: 25,
      pageEnd: 25,
    };
    ragService.retrieve.mockResolvedValue({
      kind: 'evidence',
      resolvedModule: { id: 'sit', name: 'Situaciones Administrativas' },
      sources: [source, secondSource],
      topRelevanceScore: 0.8,
    });
    answerGateway.generate.mockReturnValue(
      (function* () {
        yield 'La licencia por incapacidad temporal se acredita con CITT. [2]';
      })(),
    );
    const events = await collect(service);
    const sourcesEvent = events.find((event) => event.type === 'sources');
    const tokenEvent = events.find((event) => event.type === 'token');
    if (
      !sourcesEvent ||
      sourcesEvent.type !== 'sources' ||
      !tokenEvent ||
      tokenEvent.type !== 'token'
    ) {
      throw new Error('Se esperaban fuente y respuesta');
    }
    expect(sourcesEvent.data.sources).toEqual([
      expect.objectContaining({
        rank: 1,
        documentVersionId: source.documentVersionId,
        pageStart: 16,
        pageEnd: 17,
      }),
      expect.objectContaining({
        rank: 2,
        documentVersionId: secondSource.documentVersionId,
        pageStart: 25,
        pageEnd: 25,
      }),
    ]);
    expect(tokenEvent.data.text).toContain('[2]');
    expect(historyGateway.completeTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        replyRole: 'assistant',
        answer: tokenEvent.data.text,
        sources: [
          expect.objectContaining({
            chunkId: source.chunkId,
            sourceId: sourcesEvent.data.sources[0].id,
          }),
          expect.objectContaining({
            chunkId: secondSource.chunkId,
            sourceId: sourcesEvent.data.sources[1].id,
          }),
        ],
      }),
    );
  });
});

it('rechaza fragmentos sin procedencia verificada en la ruta de licencias actuales', async () => {
  const { service, answerGateway, historyGateway } = setup();
  const events = await collect(
    service,
    undefined,
    'Me dieron descanso médico. ¿Cómo presento mi licencia?',
  );
  expect(answerGateway.generate).not.toHaveBeenCalled();
  expect(events.map((event) => event.type)).toEqual([
    'conversation',
    'no_evidence',
    'done',
  ]);
  expect(historyGateway.completeTurn).toHaveBeenCalledWith(
    expect.objectContaining({ replyRole: 'no_evidence', sources: [] }),
  );
});
