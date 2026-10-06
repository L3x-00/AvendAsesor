import {
  ChatCatalogService,
  COVERAGE_CACHE_MS,
  DOCUMENTS_CACHE_MS,
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
    mimeType: 'application/pdf',
    moduleIds: ['cargos'],
    moduleNames: ['Cargos y plazas'],
    originalFileName: 'documento.pdf',
    pageCount: 10,
    resolutionNumber: 'RVM 011-2023',
    sectionTitles: ['Funciones del Coordinador Pedagógico'],
    title:
      'Incorporan en el Clasificador de Cargos de la Carrera Pública Magisterial',
    versionId: 'v1',
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
    getOpeningText: jest.fn().mockResolvedValue('Texto inicial del documento.'),
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
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
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

    try {
      const old = catalog.reply();
      await new Promise((done) => setImmediate(done));
      now.mockReturnValue(1_000_000 + DOCUMENTS_CACHE_MS + 1);
      await catalog.reply();
      resolveOld(['¿Pregunta vieja del catálogo anterior?']);
      await old;
      const latest = await catalog.reply();

      expect(latest.suggestions).toEqual([
        '¿Qué dice la Ley de Reforma Magisterial?',
      ]);
      expect(suggest).toHaveBeenCalledTimes(2);
    } finally {
      now.mockRestore();
    }
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

  it('resume qué temas cubren los documentos y lo reutiliza unos minutos', async () => {
    const { catalogGateway, service: catalog } = service([
      document(),
      document({ id: 'd2' }),
      document({ id: 'd3', moduleNames: ['Ley y reglamento'] }),
      document({ id: 'd4', moduleNames: [] }),
    ]);

    const summary = await catalog.coverageSummary();
    await catalog.coverageSummary();

    expect(summary).toBe(
      'Por ahora mis documentos cubren: Cargos y plazas (2 documentos), Ley y reglamento (1 documento) y otros temas (1 documento). Si quieres, pregúntame «¿De qué tienes información?» y te muestro la lista con preguntas recomendadas.',
    );
    expect(catalogGateway.listAvailableDocuments).toHaveBeenCalledTimes(1);
  });

  it('deja «otros temas» al final y recuerda un fallo un minuto', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(5_000_000);
    try {
      const { catalogGateway, service: catalog } = service([
        document({ moduleNames: [] }),
        document({ id: 'd2', moduleNames: ['Remuneraciones'] }),
      ]);
      await expect(catalog.coverageSummary()).resolves.toContain(
        'Remuneraciones (1 documento) y otros temas (1 documento).',
      );

      now.mockReturnValue(5_000_000 + COVERAGE_CACHE_MS + 1);
      catalogGateway.listAvailableDocuments.mockRejectedValueOnce(
        new Error('db down'),
      );
      await expect(catalog.coverageSummary()).rejects.toThrow('db down');
      await expect(catalog.coverageSummary()).resolves.toBeNull();
      expect(catalogGateway.listAvailableDocuments).toHaveBeenCalledTimes(2);
    } finally {
      now.mockRestore();
    }
  });

  it('sin documentos no añade resumen de cobertura', async () => {
    const { service: catalog } = service([]);

    await expect(catalog.coverageSummary()).resolves.toBeNull();
  });

  it('con un solo tema lo nombra sin conjunciones', async () => {
    const { service: catalog } = service([document()]);

    await expect(catalog.coverageSummary()).resolves.toContain(
      'cubren: Cargos y plazas (1 documento).',
    );
  });

  it('sin documentos lo dice con claridad y sin sugerencias', async () => {
    const { service: catalog, suggest } = service([]);

    const reply = await catalog.reply();

    expect(reply.suggestions).toEqual([]);
    expect(reply.message).toContain('Aún estoy preparándome');
    expect(suggest).not.toHaveBeenCalled();
  });

  it('devuelve los 40 archivos elegibles sin el límite top-k del RAG', async () => {
    const documents = Array.from({ length: 40 }, (_, index) =>
      document({
        documentType: 'ANEXO',
        id: `d-${index + 1}`,
        originalFileName: `anexo-${index + 1}.pdf`,
        title: `Anexo ${index + 1}`,
        versionId: `v-${index + 1}`,
      }),
    );
    const { service: catalog, suggest } = service(documents);

    const reply = await catalog.reply(undefined, {
      question: '¿Qué anexos hay?',
    });

    expect(reply.documents).toHaveLength(40);
    expect(reply.documents.at(-1)?.title).toBe('Anexo 40');
    expect(reply.message).toContain('estos 40 documentos');
    expect(reply.message).toContain('Y 15 documentos más.');
    expect(suggest).toHaveBeenCalledWith(documents);
  });

  it('filtra categoría y tema abierto sin ocultar otros archivos elegibles', async () => {
    const { service: catalog } = service([
      document({ documentType: 'ANEXO', id: 'a1', versionId: 'va1' }),
      document({
        documentType: 'ANEXO',
        id: 'a2',
        moduleIds: ['remuneraciones'],
        versionId: 'va2',
      }),
      document({ documentType: 'LEY', id: 'l1', versionId: 'vl1' }),
    ]);

    const reply = await catalog.reply(undefined, {
      question: 'Descárgame los anexos',
      selectedModuleId: 'cargos',
    });

    expect(reply.documents.map((item) => item.id)).toEqual(['a1']);
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
