import type { AuthorizationContext } from '../authorization';
import { ChatService, type ChatStreamEvent } from './chat.service';

/**
 * Regresión de la secuencia real dentro del módulo Remuneraciones:
 *  1) «hola cuanto gana un docente» → pide el vínculo, no asume contratado.
 *  2) «cuando es expulsado el docente» → tema disciplinario, no tabla salarial.
 *  3) «cuanto gana un director» → falta específica de monto directivo.
 *  4) «entonces quiero saber cuando es expulsado el docente» → misma intención
 *     del último mensaje, sin arrastrar la consulta salarial del historial.
 *
 * Cada turno se interpreta de nuevo; el historial no reemplaza la pregunta.
 */

const authorization: AuthorizationContext = {
  email: 'docente@example.com',
  emailConfirmedAt: '2026-08-22T00:00:00.000Z',
  role: 'docente',
  userId: '4c8b56af-6d0c-4fef-881e-7c00907540dd',
};

const CONVERSATION_ID = '7c8b56af-6d0c-4fef-881e-7c00907540dd';

function module(
  id: string,
  name: string,
  sortOrder: number,
  parentModuleId: string | null = null,
) {
  return { code: id, description: null, id, name, parentModuleId, sortOrder };
}

const modules = [
  module('rem', 'Remuneraciones', 1),
  module('sit', 'Situaciones Administrativas', 2),
  module('con', 'Contratación y desplazamientos', 3),
  module('aux', 'Auxiliar de educación', 4),
  module('rem-nom', 'Remuneración docente nombrado', 1, 'rem'),
];

const catalogDocuments = [
  { id: 'doc-rem', moduleIds: ['rem'], title: 'Escala remunerativa' },
  { id: 'doc-sit', moduleIds: ['sit'], title: 'Licencias y PAD' },
];

const salarySource = {
  articleReference: null,
  chunkContent:
    'La remuneración mensual del profesor contratado es S/ 3 500,70 para una jornada de 30 horas.',
  chunkId: 'salary-contracted',
  documentId: 'salary-document',
  documentSituation: 'current' as const,
  documentTitle: 'Escala remunerativa 2026',
  documentVersionId: 'salary-version',
  lexicalScore: 0.6,
  moduleIds: ['rem'],
  moduleNames: ['Remuneraciones'],
  numeralReference: null,
  pageEnd: 2,
  pageStart: 2,
  sectionTitle: null,
  semanticScore: 0.8,
  versionNumber: 1,
};

const questions = {
  salary: 'hola cuanto gana un docente',
  expulsion: 'cuando es expulsado el docente',
  director: 'cuanto gana un director',
  expulsionAgain: 'entonces quiero saber cuando es expulsado el docente',
} as const;

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
      selectedModuleId: 'rem',
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
    retrieve: jest.fn().mockImplementation((question: string) => {
      if (question === questions.salary) {
        return Promise.resolve({
          kind: 'evidence',
          resolvedModule: { id: 'rem', name: 'Remuneraciones' },
          sources: [salarySource],
          topRelevanceScore: 0.8,
        });
      }
      return Promise.resolve({
        kind: 'no_evidence',
        topRelevanceScore: null,
      });
    }),
  };
  const answerGateway = {
    generate: jest.fn().mockImplementation(() =>
      (async function* () {
        await Promise.resolve();
        yield 'Respuesta generada [1].';
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
  return { answerGateway, historyGateway, ragService, service };
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
  type: 'clarification' | 'no_evidence',
): string {
  const reply = events.find((event) => event.type === type);
  if (!reply || !('message' in reply.data)) {
    throw new Error(`Se esperaba un evento ${type}.`);
  }
  return reply.data.message;
}

describe('ChatService — secuencia dentro de Remuneraciones', () => {
  it('reinterpreta cada mensaje y no contamina la nueva intención', async () => {
    const { historyGateway, ragService, service } = setup();
    const prior: Array<{ content: string; role: string }> = [];
    historyGateway.getConversationContext.mockImplementation(() =>
      Promise.resolve({
        conversationId: CONVERSATION_ID,
        messages: [...prior],
        selectedModuleId: 'rem',
      }),
    );
    const ask = async (question: string) => {
      const events = await collect(service, question);
      prior.push({ content: question, role: 'user' });
      const answer = events
        .filter((event) => 'message' in event.data)
        .map((event) => (event.data as { message: string }).message)
        .join(' ');
      if (answer) prior.push({ content: answer, role: 'assistant' });
      return events;
    };

    // 1) Cifra sin vínculo: se pregunta el dato indispensable.
    const salary = await ask(questions.salary);
    const salaryClarification = messageOf(salary, 'clarification');
    expect(salaryClarification).toContain('nombrado o contratado');
    expect(salary.some((event) => event.type === 'sources')).toBe(false);
    expect(ragService.retrieve).toHaveBeenCalledWith(
      questions.salary,
      'rem',
      expect.any(Array),
      expect.any(Object),
    );

    // 2) Destitución: es otro tema; no se responde con la tabla salarial.
    const expulsion = await ask(questions.expulsion);
    const expulsionClarification = messageOf(expulsion, 'clarification');
    expect(expulsionClarification).toContain(
      'procedimiento administrativo disciplinario',
    );
    expect(expulsionClarification).toContain('Situaciones Administrativas');
    expect(expulsion.some((event) => event.type === 'sources')).toBe(false);
    expect(expulsion.some((event) => event.type === 'token')).toBe(false);
    expect(ragService.retrieve).toHaveBeenCalledTimes(1);
    expect(expulsion[0]).toMatchObject({
      data: { moduleId: 'rem' },
      type: 'conversation',
    });

    // 3) Director: la falta es específica y pide solo lo indispensable.
    const director = await ask(questions.director);
    const directorGap = messageOf(director, 'no_evidence');
    expect(directorGap).toContain('cargo directivo');
    expect(directorGap).toContain(
      'director de institución educativa o a especialista en educación',
    );
    expect(ragService.retrieve).toHaveBeenLastCalledWith(
      questions.director,
      'rem',
      expect.any(Array),
      expect.any(Object),
    );

    // 4) La misma intención se reconoce otra vez; no vuelve la consulta salarial.
    const expulsionAgain = await ask(questions.expulsionAgain);
    const again = messageOf(expulsionAgain, 'clarification');
    expect(again).toContain('procedimiento administrativo disciplinario');
    expect(expulsionAgain.some((event) => event.type === 'sources')).toBe(
      false,
    );
    expect(ragService.retrieve).toHaveBeenCalledTimes(2);
    const calls = ragService.retrieve.mock.calls as Array<
      [string, string | null, unknown, unknown]
    >;
    expect(calls[1]?.[0]).toBe(questions.director);
  });

  it('no responde una destitución con la tabla salarial del turno previo', async () => {
    const { historyGateway, ragService, service } = setup();
    historyGateway.getConversationContext.mockResolvedValue({
      conversationId: CONVERSATION_ID,
      messages: [
        { content: questions.salary, role: 'user' },
        {
          content: 'La remuneración del contratado es S/ 3 500,70. [1]',
          role: 'assistant',
        },
      ],
      selectedModuleId: 'rem',
    });

    const events = await collect(service, questions.expulsion);

    expect(ragService.retrieve).not.toHaveBeenCalled();
    const answer = messageOf(events, 'clarification');
    expect(answer).not.toContain('S/');
    expect(answer).toContain('Situaciones Administrativas');
  });
});
