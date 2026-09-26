import {
  ChatCatalogService,
  FAILED_SUGGESTIONS_CACHE_MS,
  fallbackSuggestions,
} from './chat-catalog.service';
import type { AvailableDocument } from './chat-catalog.types';
import { parseSuggestedQuestions } from './openai-suggested-questions.gateway';

function document(
  overrides: Partial<AvailableDocument> = {},
): AvailableDocument {
  return {
    documentType: 'RESOLUCION_VICEMINISTERIAL',
    id: 'd1',
    issuanceYear: 2023,
    moduleNames: ['Cargos y plazas'],
    resolutionNumber: 'RVM 011-2023',
    sectionTitles: ['Funciones del Coordinador Pedagógico'],
    title:
      'Incorporan en el Clasificador de Cargos de la Carrera Pública Magisterial',
    ...overrides,
  };
}

function service(
  documents: AvailableDocument[],
  suggest: jest.Mock = jest
    .fn()
    .mockResolvedValue(['¿Qué funciones tiene el Coordinador Pedagógico?']),
) {
  const catalogGateway = {
    listAvailableDocuments: jest.fn().mockResolvedValue(documents),
  };
  const suggestionsGateway = { suggest };
  return {
    catalogGateway,
    service: new ChatCatalogService(catalogGateway, suggestionsGateway),
    suggest,
  };
}

describe('ChatCatalogService', () => {
  it('lista los documentos por tema y devuelve preguntas sugeridas por la IA', async () => {
    const { service: catalog } = service([
      document(),
      document({
        documentType: 'LEY',
        id: 'd2',
        issuanceYear: 2012,
        moduleNames: ['Ley y reglamento'],
        resolutionNumber: null,
        title: 'Ley de Reforma Magisterial',
      }),
    ]);

    const reply = await catalog.reply();

    expect(reply.message).toContain('estos 2 documentos');
    expect(reply.message).toContain('**Cargos y plazas**');
    expect(reply.message).toContain(
      '- Incorporan en el Clasificador de Cargos de la Carrera Pública Magisterial (Resolución Viceministerial, RVM 011-2023, 2023)',
    );
    expect(reply.message).toContain('- Ley de Reforma Magisterial (Ley, 2012)');
    expect(reply.message.indexOf('**Cargos y plazas**')).toBeLessThan(
      reply.message.indexOf('**Ley y reglamento**'),
    );
    expect(reply.suggestions).toEqual([
      '¿Qué funciones tiene el Coordinador Pedagógico?',
    ]);
  });

  it('reutiliza las sugerencias mientras el catálogo no cambia', async () => {
    const { service: catalog, suggest } = service([document()]);

    await catalog.reply();
    await catalog.reply();

    expect(suggest).toHaveBeenCalledTimes(1);
  });

  it('si la IA falla, ofrece preguntas de respaldo un rato y luego reintenta', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    try {
      const suggest = jest.fn().mockRejectedValue(new Error('timeout'));
      const { service: catalog } = service([document()], suggest);

      const first = await catalog.reply();
      await catalog.reply();
      expect(suggest).toHaveBeenCalledTimes(1);

      now.mockReturnValue(1_000_000 + FAILED_SUGGESTIONS_CACHE_MS + 1);
      await catalog.reply();

      expect(first.suggestions).toEqual(fallbackSuggestions([document()]));
      expect(first.suggestions[0]).toMatch(/^¿Qué establece «.+»\?$/u);
      expect(suggest).toHaveBeenCalledTimes(2);
    } finally {
      now.mockRestore();
    }
  });

  it('consultas simultáneas comparten una sola llamada a la IA', async () => {
    let resolve: (value: string[]) => void = () => undefined;
    const suggest = jest.fn().mockReturnValue(
      new Promise<string[]>((done) => {
        resolve = done;
      }),
    );
    const { service: catalog } = service([document()], suggest);

    const replies = Promise.all([catalog.reply(), catalog.reply()]);
    await new Promise((done) => setImmediate(done));
    resolve(['¿Qué funciones tiene el Coordinador Pedagógico?']);

    const [first, second] = await replies;
    expect(suggest).toHaveBeenCalledTimes(1);
    expect(first.suggestions).toEqual(second.suggestions);
  });

  it('una llamada vieja no pisa las sugerencias del catálogo nuevo', async () => {
    let resolveOld: (value: string[]) => void = () => undefined;
    const suggest = jest
      .fn()
      .mockReturnValueOnce(
        new Promise<string[]>((done) => {
          resolveOld = done;
        }),
      )
      .mockResolvedValue(['¿Qué dice la Ley de Reforma Magisterial?']);
    const { catalogGateway, service: catalog } = service([document()], suggest);
    catalogGateway.listAvailableDocuments
      .mockResolvedValueOnce([document()])
      .mockResolvedValue([document({ id: 'd2' })]);

    const old = catalog.reply();
    await new Promise((done) => setImmediate(done));
    await catalog.reply();
    resolveOld(['¿Pregunta vieja del catálogo anterior?']);
    await old;
    const latest = await catalog.reply();

    expect(latest.suggestions).toEqual([
      '¿Qué dice la Ley de Reforma Magisterial?',
    ]);
    expect(suggest).toHaveBeenCalledTimes(2);
  });

  it('si el docente se va, no espera a la IA y usa el respaldo', async () => {
    const suggest = jest.fn().mockReturnValue(new Promise(() => undefined));
    const { service: catalog } = service([document()], suggest);
    const controller = new AbortController();

    const reply = catalog.reply(controller.signal);
    await new Promise((done) => setImmediate(done));
    controller.abort();

    await expect(reply).resolves.toMatchObject({
      suggestions: fallbackSuggestions([document()]),
    });
    const aborted = new AbortController();
    aborted.abort();
    await expect(catalog.reply(aborted.signal)).resolves.toMatchObject({
      suggestions: fallbackSuggestions([document()]),
    });
  });

  it('una respuesta a tiempo con señal activa se entrega normalmente', async () => {
    const { service: catalog } = service([document()]);

    const reply = await catalog.reply(new AbortController().signal);

    expect(reply.suggestions).toEqual([
      '¿Qué funciones tiene el Coordinador Pedagógico?',
    ]);
  });

  it('sin documentos lo dice con claridad y sin sugerencias', async () => {
    const { service: catalog, suggest } = service([]);

    const reply = await catalog.reply();

    expect(reply.suggestions).toEqual([]);
    expect(reply.message).toContain('no tengo documentos disponibles');
    expect(suggest).not.toHaveBeenCalled();
  });

  it('recorta títulos largos en las preguntas de respaldo', () => {
    const [question] = fallbackSuggestions([
      document({ title: `Aprueban ${'padrones de instituciones '.repeat(8)}` }),
    ]);

    expect(question.length).toBeLessThan(100);
    expect(question).toContain('…');
  });
});

describe('parseSuggestedQuestions', () => {
  it('acepta el JSON del modelo y normaliza las preguntas', () => {
    expect(
      parseSuggestedQuestions(
        'Aquí tienes: {"preguntas": ["Qué funciones tiene el coordinador", "¿Qué funciones tiene el coordinador?", 3, "¿Corta?"]}',
      ),
    ).toEqual(['¿Qué funciones tiene el coordinador?']);
  });

  it('ignora salidas que no son JSON válido', () => {
    expect(parseSuggestedQuestions('lo siento')).toEqual([]);
    expect(parseSuggestedQuestions('{"otra": []}')).toEqual([]);
  });
});
