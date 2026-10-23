import { Logger } from '@nestjs/common';
import {
  detectRetrievalScope,
  inheritedFactorQuestions,
  isEllipticalFollowUp,
  RagService,
  resolveDetectedSubmodule,
} from './rag.service';
import type { RetrievalGateway } from './retrieval.gateway';

describe('inheritedFactorQuestions', () => {
  const salary = '¿Cuánto gana un docente de 30 horas?';

  it('hereda desde la consulta salarial hasta la respuesta a la aclaración', () => {
    expect(
      inheritedFactorQuestions('Nombrado', [salary, 'Sector público'], true),
    ).toEqual([salary, 'Sector público']);
  });

  // Ronda 3 (hallazgo 2): la aclaración usa las palabras «jornada» y «escala»;
  // responderla con ellas no es cambiar de tema.
  it.each([
    'Jornada de 30 horas',
    'Mi carga horaria es de 30 horas',
    'Escala magisterial 2',
  ])('«%s» responde a la aclaración y no interrumpe la herencia', (answer) => {
    expect(
      inheritedFactorQuestions('Escala 2', [salary, answer], true),
    ).toEqual([salary, answer]);
  });

  // Ronda 4 (M1): sin valor, «jornada» o «escala magisterial» son otro tema.
  it.each([
    '¿Cuál es la jornada laboral de un auxiliar?',
    '¿Qué es la escala magisterial?',
    '¿Cuál es la carga horaria de aula en el colegio?',
  ])('«%s» es otra pregunta y no hereda factores', (other) => {
    expect(inheritedFactorQuestions(other, [salary], false)).toEqual([]);
    expect(
      inheritedFactorQuestions('¿y en secundaria?', [salary, other], false),
    ).toEqual([]);
  });

  it('solo toma la consulta salarial más reciente', () => {
    expect(
      inheritedFactorQuestions(
        '¿y para 40 horas?',
        ['¿Cuánto es la bonificación por zona rural?', salary],
        false,
      ),
    ).toEqual([salary]);
  });

  it('hereda cargo y sector a través de un turno salarial elíptico', () => {
    const history = [
      '¿Cuánto gana un auxiliar de educación?',
      'privado',
      '¿Y cuánto gana por 30 horas?',
    ];
    expect(
      inheritedFactorQuestions('¿y para 40 horas?', history, false),
    ).toEqual(history);
  });

  it('hereda también cuando la pregunta salarial omite el conector y al cambiar de sector', () => {
    const history = [
      '¿Cuánto gana un auxiliar de educación?',
      'privado',
      '¿Cuánto gana por 30 horas?',
    ];
    expect(
      inheritedFactorQuestions('¿cuánto gana por 40 horas?', history, false),
    ).toEqual(history);
    expect(
      inheritedFactorQuestions(
        '¿y cuánto gana en el sector público?',
        history,
        false,
      ),
    ).toEqual(history);
  });

  it.each(['ingeniero', 'administrativo', 'abogado'])(
    'no hereda un cargo anterior al preguntar por un %s',
    (occupation) => {
      expect(
        inheritedFactorQuestions(
          `¿Cuánto gana un ${occupation}?`,
          ['¿Cuánto gana un auxiliar?', 'privado'],
          false,
        ),
      ).toEqual([]);
    },
  );

  it.each([
    '¿Cuánto gana ingeniero?',
    '¿Cuánto gana un ingeniero?',
    '¿Cuánto gana un docente?',
  ])('no fuerza la herencia ante otra pregunta completa: %s', (question) => {
    expect(
      inheritedFactorQuestions(
        question,
        ['¿Cuánto gana un auxiliar?', 'privado'],
        true,
      ),
    ).toEqual([]);
  });

  it('no hereda tras una consulta de otro tema', () => {
    expect(
      inheritedFactorQuestions(
        '¿y cuál es el plazo para presentarla?',
        [salary, '¿Cuántos días de licencia por enfermedad me corresponden?'],
        false,
      ),
    ).toEqual([]);
  });

  it('interrumpe la herencia tras explicar la finalidad de un instructivo de pagos', () => {
    expect(
      inheritedFactorQuestions(
        'Nombrado',
        [
          salary,
          'Jornada de 30 horas',
          '¿Cuál es la finalidad del instructivo para la elaboración y aprobación de la planilla de pagos?',
        ],
        true,
      ),
    ).toEqual([]);
  });

  it('no hereda factores en un pedido de documentos aunque se fuerce el contexto', () => {
    expect(
      inheritedFactorQuestions(
        '¿Qué documentos debo presentar?',
        ['¿Cuánto gano yo como docente?'],
        true,
      ),
    ).toEqual([]);
  });

  it('no hereda sin consulta salarial previa ni sin seguimiento', () => {
    expect(
      inheritedFactorQuestions(
        'Sector público',
        ['¿Cómo pido una licencia?'],
        true,
      ),
    ).toEqual([]);
    expect(
      inheritedFactorQuestions(
        '¿Cuál es la remuneración de un auxiliar de educación?',
        [salary],
        false,
      ),
    ).toEqual([]);
    expect(inheritedFactorQuestions('30 horas', [], true)).toEqual([]);
  });

  it('el extracto de una respuesta anterior no es una declaración de la persona', () => {
    expect(
      inheritedFactorQuestions(
        'Sector público',
        [
          salary,
          'Respuesta anterior: la remuneración del director es S/ 4 400,80.',
        ],
        true,
      ),
    ).toEqual([salary]);
  });

  it('la propuesta aceptada tampoco es una declaración de la persona', () => {
    expect(
      inheritedFactorQuestions(
        'Sector público',
        [
          salary,
          'Propuesta aceptada: la remuneración corresponde a una jornada de 30 horas.',
        ],
        true,
      ),
    ).toEqual([salary]);
  });
});

describe('isEllipticalFollowUp', () => {
  it('trata los pedidos de documentos o requisitos como seguimientos del tema', () => {
    expect(isEllipticalFollowUp('¿Qué documentos debo presentar?')).toBe(true);
    expect(isEllipticalFollowUp('¿Qué archivos debo adjuntar?')).toBe(true);
    expect(isEllipticalFollowUp('¿Qué requisitos necesito?')).toBe(true);
    expect(isEllipticalFollowUp('Explícame los requisitos.')).toBe(true);
  });

  it('sigue tratando como elipsis una pregunta que depende del turno previo', () => {
    expect(isEllipticalFollowUp('¿Y el plazo?')).toBe(true);
    expect(isEllipticalFollowUp('¿Entonces qué requisitos?')).toBe(true);
  });

  it('reconoce un tema propio aunque no use un verbo de trámite', () => {
    expect(
      isEllipticalFollowUp('¿Qué se necesita para ser un docente nombrado?'),
    ).toBe(false);
    expect(isEllipticalFollowUp('¿Y para una permuta?')).toBe(false);
  });
});

function vector(value = 0.1): number[] {
  return Array.from({ length: 1536 }, () => value);
}

const source = {
  articleReference: 'Artículo 1.',
  chunkContent: 'Artículo 1. Contenido recuperado.',
  chunkId: 'chunk-id',
  documentId: 'document-id',
  documentSituation: 'current' as const,
  documentTitle: 'Norma interna',
  documentVersionId: 'version-id',
  lexicalScore: 0.5,
  moduleIds: ['module-a'],
  moduleNames: ['Módulo A'],
  numeralReference: null,
  pageEnd: 1,
  pageStart: 1,
  sectionTitle: 'Artículo 1',
  semanticScore: 0.9,
  versionNumber: 1,
};

describe('RagService', () => {
  let embeddings: { embed: jest.Mock };
  let gateway: { search: jest.Mock; searchExactReferences: jest.Mock };
  let service: RagService;

  beforeEach(() => {
    embeddings = {
      embed: jest
        .fn()
        .mockImplementation((queries: string[]) =>
          Promise.resolve(
            queries.map((_query, index) => vector(0.1 + index / 100)),
          ),
        ),
    };
    gateway = {
      search: jest.fn(),
      searchExactReferences: jest.fn(),
    };
    service = new RagService(embeddings, gateway, {
      get: jest.fn((key: string) => (key === 'RAG_MATCH_COUNT' ? 5 : 0.7)),
    } as never);
  });

  it('returns no evidence without invoking a chat generator', async () => {
    gateway.search.mockResolvedValue([]);
    await expect(
      service.retrieve('¿Qué establece la norma?', null),
    ).resolves.toEqual({ kind: 'no_evidence', topRelevanceScore: null });
  });

  it('rescata una coincidencia léxica cuando la similitud vectorial no deja candidatos', async () => {
    const lexicalSource = {
      ...source,
      chunkContent:
        'Los requisitos para el nombramiento docente incluyen el título profesional.',
      lexicalScore: 0.4,
      semanticScore: 0.66,
    };
    gateway.search
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([lexicalSource]);

    const result = await service.retrieve(
      '¿Qué se necesita para ser un docente nombrado?',
      null,
    );

    expect(result).toMatchObject({
      kind: 'evidence',
      sources: [expect.objectContaining({ chunkId: lexicalSource.chunkId })],
    });
    expect(gateway.search).toHaveBeenCalledTimes(2);
    const calls = gateway.search.mock.calls as Array<
      [{ matchThreshold?: number; query?: string }]
    >;
    expect(calls[1]?.[0]).toMatchObject({
      matchThreshold: 0,
      query: '¿Qué se necesita para ser un docente nombrado?',
    });
  });

  it.each([
    [
      '¿Cuál es la mejor época para sembrar papa?',
      'La licencia se solicita en mesa de partes.',
    ],
    ['¿Cuál es el plazo?', 'El plazo para una permuta es de cinco días.'],
    ['¿Cuánto gana un docente?', 'El docente gana experiencia en el aula.'],
  ])(
    'no rescata una coincidencia léxica débil para «%s»',
    async (question, chunkContent) => {
      const weakSource = {
        ...source,
        chunkContent,
        lexicalScore: 0.1,
        semanticScore: 0.4,
      };
      gateway.search
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([weakSource])
        .mockResolvedValueOnce([weakSource]);

      await expect(service.retrieve(question, null)).resolves.toEqual({
        kind: 'no_evidence',
        topRelevanceScore: null,
      });
    },
  );

  it('no rescata una coincidencia en el borde 0.45 de la banda sin evidencia', async () => {
    for (const [question, chunkContent] of [
      ['¿Cuál es el plazo?', 'El plazo para una permuta es de cinco días.'],
      ['¿Cuánto gana un docente?', 'El docente gana experiencia en el aula.'],
    ] as const) {
      gateway.search.mockReset();
      const weak = {
        ...source,
        chunkContent,
        lexicalScore: 0.1,
        semanticScore: 0.45,
      };
      gateway.search
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([weak])
        .mockResolvedValueOnce([weak]);

      await expect(service.retrieve(question, null)).resolves.toEqual({
        kind: 'no_evidence',
        topRelevanceScore: null,
      });
    }
  });

  it('busca la escala general cuando los primeros fragmentos solo traen conceptos adicionales', async () => {
    const cts = {
      ...source,
      chunkContent:
        'El docente contratado recibe CTS y bonificaciones al finalizar el vínculo.',
      chunkId: 'cts',
      semanticScore: 0.9,
    };
    const scale = {
      ...source,
      chunkContent: [
        '| Nivel | Remuneración |',
        '| --- | --- |',
        '| Inicial | S/ 3 300,60 |',
        '| Primaria | S/ 3 300,60 |',
      ].join('\n'),
      chunkId: 'scale',
      semanticScore: 0.9,
    };
    gateway.search.mockResolvedValueOnce([cts]).mockResolvedValueOnce([scale]);

    const result = await service.retrieve('¿Cuánto gana un docente?', null);

    expect(result.kind).toBe('evidence');
    if (result.kind !== 'evidence') throw new Error('Expected evidence');
    expect(result.sources.map((entry) => entry.chunkId)).toContain('scale');
    expect(gateway.search).toHaveBeenCalledTimes(2);
    expect(embeddings.embed).toHaveBeenCalledTimes(2);
    expect((embeddings.embed.mock.calls[1] as [string[]][])[0][0]).toContain(
      'remuneración íntegra mensual',
    );
  });

  it('entrega la escala salarial aunque la ruta se resuelva a otro módulo', async () => {
    const cts = {
      ...source,
      chunkContent:
        'El docente contratado recibe CTS y bonificaciones al finalizar el vínculo.',
      chunkId: 'cts-resolved',
      moduleIds: ['module-a'],
      moduleNames: ['Contratación docente'],
      semanticScore: 0.95,
    };
    const scale = {
      ...source,
      chunkContent: [
        '| Nivel | Remuneración |',
        '| --- | --- |',
        '| Inicial | S/ 3 300,60 |',
      ].join('\n'),
      chunkId: 'scale-resolved',
      moduleIds: ['module-b'],
      moduleNames: ['Remuneraciones'],
      semanticScore: 0.8,
    };
    gateway.search.mockResolvedValue([cts, scale]);

    const result = await service.retrieve('¿Cuánto gana un docente?', null);

    expect(result.kind).toBe('evidence');
    if (result.kind !== 'evidence') throw new Error('Expected evidence');
    expect(result.sources.map((entry) => entry.chunkId)).toEqual(
      expect.arrayContaining(['scale-resolved']),
    );
  });

  it('responde la ambigüedad de una consulta salarial general con la evidencia recuperada', async () => {
    const salaryA = {
      ...source,
      chunkContent: 'La remuneración mensual del docente es de S/ 3 300,60.',
      chunkId: 'salary-a',
      documentVersionId: 'version-a',
      moduleIds: ['module-a'],
      moduleNames: ['Remuneraciones'],
    };
    const salaryB = {
      ...source,
      chunkContent:
        'La remuneración mensual del docente contratado es de S/ 2 400,40.',
      chunkId: 'salary-b',
      documentVersionId: 'version-b',
      moduleIds: ['module-b'],
      moduleNames: ['Contratación docente'],
    };
    gateway.search.mockResolvedValue([salaryA, salaryB]);

    const result = await service.retrieve('¿Cuánto gana un docente?', null);

    expect(result).toMatchObject({
      kind: 'evidence',
      topRelevanceScore: 0.9,
    });
    if (result.kind !== 'evidence') throw new Error('Expected evidence');
    expect(result.sources.map((entry) => entry.chunkId)).toEqual([
      'salary-a',
      'salary-b',
    ]);
  });

  it('separa el contexto salarial del contexto de recuperación de una propuesta aceptada', async () => {
    const salarySource = {
      ...source,
      chunkContent:
        'La remuneración mensual es S/ 3,500.70 para una jornada de 40 horas.',
    };
    gateway.search.mockResolvedValue([salarySource]);
    const question = '¿Qué documentos debo presentar?';
    const prior = ['¿Cuánto gana un docente de 30 horas?'];

    // Un pedido de documentos corta la herencia salarial incluso si el llamador
    // fuerza el contexto; por eso la fuente de 40 horas no se filtra por la
    // jornada de 30 horas de la consulta previa.
    for (const options of [
      { forceContext: true },
      { forceContext: true, salaryContextQuestions: [] },
    ]) {
      await expect(
        service.retrieve(question, null, prior, options),
      ).resolves.toMatchObject({
        kind: 'evidence',
        sources: [
          expect.objectContaining({
            chunkContent:
              'La remuneración mensual es S/ 3,500.70 para una jornada de 40 horas.',
          }),
        ],
      });
    }
  });

  it('retrieves an explicitly named norm only through the exact route', async () => {
    const exactSource = {
      ...source,
      documentTitle: 'Norma de registro y control de asistencia',
      documentType: 'RESOLUCION_SECRETARIA_GENERAL',
      resolutionNumber: 'RSG N.° 326-2017-MINEDU',
    };
    gateway.searchExactReferences.mockResolvedValue([exactSource]);

    await expect(
      service.retrieve(
        'Según la RSG N.° 326-2017-MINEDU, ¿cómo se controla la asistencia?',
        null,
      ),
    ).resolves.toEqual({
      kind: 'evidence',
      resolvedModule: { id: 'module-a', name: 'Módulo A' },
      sources: [exactSource],
      topRelevanceScore: 0.9,
    });
    expect(gateway.search).not.toHaveBeenCalled();
    expect(gateway.searchExactReferences).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceKeys: ['RSG:3262017MINEDU'],
        retrievalScope: 'historical',
      }),
    );
  });

  it('does not embed an unused module query for an explicit norm after a topic change', async () => {
    const exactSource = {
      ...source,
      documentTitle: 'Resolución de Secretaría General N.° 326-2017-MINEDU',
      documentType: 'RESOLUCION_SECRETARIA_GENERAL',
      resolutionNumber: 'RSG N.° 326-2017-MINEDU',
    };
    gateway.searchExactReferences.mockResolvedValue([exactSource]);
    const question =
      'Según la RSG 326-2017-MINEDU, ¿cuáles son los requisitos de una licencia docente?';
    const result = await service.retrieve(question, 'module-a', [
      '¿Cuál es el plazo de la reasignación?',
      '¿Cuánto gana un docente de 30 horas?',
      'Ahora quiero saber sobre licencias por enfermedad.',
    ]);

    expect(embeddings.embed).toHaveBeenCalledWith([question], {
      maxRetries: 1,
      timeout: 30_000,
    });
    expect(result).toMatchObject({ kind: 'evidence', sources: [exactSource] });
    expect(gateway.search).not.toHaveBeenCalled();
    expect(gateway.searchExactReferences).toHaveBeenCalledWith(
      expect.objectContaining({
        query: question,
        embedding: vector(),
        referenceKeys: ['RSG:3262017MINEDU'],
      }),
    );
  });

  it('does not contaminate a self-contained question with the previous topic in the module search', async () => {
    gateway.search.mockResolvedValue([source]);
    const question =
      '¿Cuáles son los requisitos para solicitar una licencia por enfermedad?';
    await service.retrieve(question, 'module-a', [
      '¿Cómo solicito una reasignación por salud?',
    ]);
    const calls = embeddings.embed.mock.calls as [string[]][];
    expect(calls[0][0]).toEqual([question]);
    expect(gateway.search).toHaveBeenCalledTimes(2);
    const searchCalls = gateway.search.mock.calls as Array<
      [{ query?: string; selectedModuleId?: string | null }]
    >;
    expect(searchCalls.map(([call]) => call.query)).toEqual([
      question,
      question,
    ]);
    expect(gateway.searchExactReferences).not.toHaveBeenCalled();
  });

  it('keeps dotted legal abbreviations on the exact route', async () => {
    const exactSource = {
      ...source,
      documentTitle: 'Decreto Supremo N.° 305-2017-EF',
      documentType: 'DECRETO_SUPREMO',
      resolutionNumber: '305-2017-EF',
    };
    gateway.searchExactReferences.mockResolvedValue([exactSource]);

    const result = await service.retrieve(
      '¿Qué dispone el D. S. N.° 305-2017-EF?',
      null,
    );

    expect(result).toMatchObject({ kind: 'evidence' });
    expect(gateway.search).not.toHaveBeenCalled();
    expect(gateway.searchExactReferences).toHaveBeenCalledWith(
      expect.objectContaining({ referenceKeys: ['DS:3052017EF'] }),
    );
  });

  it('inherits the exact norm for an elliptical follow-up', async () => {
    const exactSource = {
      ...source,
      documentTitle: 'Resolución de Secretaría General N.° 326-2017-MINEDU',
      documentType: 'RESOLUCION_SECRETARIA_GENERAL',
      resolutionNumber: 'RSG N.° 326-2017-MINEDU',
    };
    gateway.searchExactReferences.mockResolvedValue([exactSource]);

    const result = await service.retrieve('¿Y qué dice el artículo 3?', null, [
      '¿Qué dispone la RSG 326-2017-MINEDU?',
    ]);

    expect(result).toMatchObject({ kind: 'evidence' });
    expect(gateway.search).not.toHaveBeenCalled();
    expect(gateway.searchExactReferences).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceKeys: ['RSG:3262017MINEDU'],
        retrievalScope: 'historical',
      }),
    );
  });

  it('fails closed before retrieval when a sector-sensitive reference is incomplete', async () => {
    const result = await service.retrieve('¿Qué dispone el DS 074-2019?', null);

    expect(result).toMatchObject({
      incompleteExactReferences: [
        expect.objectContaining({ display: 'DS N.° 074-2019' }),
      ],
      kind: 'no_evidence',
    });
    expect(embeddings.embed).not.toHaveBeenCalled();
    expect(gateway.searchExactReferences).not.toHaveBeenCalled();
    expect(gateway.search).not.toHaveBeenCalled();
  });

  it('fails closed when the explicitly named norm is not available', async () => {
    gateway.searchExactReferences.mockResolvedValue([]);

    await expect(
      service.retrieve(
        '¿Qué indica la RSG N.° 121-2018-MINEDU sobre la planilla?',
        null,
      ),
    ).resolves.toEqual({
      kind: 'no_evidence',
      missingExactReferences: [
        expect.objectContaining({ key: '1212018MINEDU' }),
      ],
      topRelevanceScore: null,
    });
    expect(gateway.search).not.toHaveBeenCalled();
  });

  it('rejects a semantically similar source returned for another norm', async () => {
    gateway.searchExactReferences.mockResolvedValue([
      {
        ...source,
        documentTitle: 'Proceso administrativo disciplinario',
        documentType: 'RESOLUCION_MINISTERIAL',
        resolutionNumber: '123-2017-MINEDU',
      },
    ]);

    const result = await service.retrieve(
      'Según la RSG 326-2017-MINEDU, ¿cómo se controla la asistencia?',
      null,
    );

    expect(result).toMatchObject({
      kind: 'no_evidence',
      missingExactReferences: [{ key: '3262017MINEDU' }],
    });
  });

  it('does not answer a multi-norm request when one exact document is absent', async () => {
    gateway.searchExactReferences.mockResolvedValue([
      {
        ...source,
        documentTitle: 'Decreto Supremo N.° 305-2017-EF',
        documentType: 'DECRETO_SUPREMO',
        resolutionNumber: '305-2017-EF',
      },
    ]);

    const result = await service.retrieve(
      'Compara el DS 305-2017-EF y el DS 306-2017-EF.',
      null,
    );

    expect(result).toMatchObject({
      kind: 'no_evidence',
      missingExactReferences: [{ key: '3062017EF' }],
    });
  });

  it('fails closed for an exact query when the gateway lacks the new capability', async () => {
    const legacyService = new RagService(embeddings, { search: jest.fn() }, {
      get: jest.fn(() => 0.7),
    } as never);

    await expect(
      legacyService.retrieve('¿Qué dispone el DS 074-2019-EF?', null),
    ).resolves.toMatchObject({
      kind: 'no_evidence',
      missingExactReferences: [{ key: '0742019EF' }],
    });
  });

  it('descarta evidencia recuperada que pertenece únicamente a otro sector', async () => {
    gateway.search.mockResolvedValue([
      {
        ...source,
        chunkContent:
          'El Ministerio de Energía y Minas autoriza una concesión eléctrica para una empresa generadora.',
        sectionTitle: 'ENERGÍA Y MINAS',
      },
    ]);

    await expect(
      service.retrieve('¿Dónde están las publicaciones del MINEDU?', null),
    ).resolves.toEqual({ kind: 'no_evidence', topRelevanceScore: null });
  });

  it('classifies with the current question and enforces the selected module', async () => {
    gateway.search.mockResolvedValue([source]);

    await expect(service.retrieve('Consulta', 'module-a')).resolves.toEqual({
      kind: 'evidence',
      resolvedModule: { id: 'module-a', name: 'Módulo A' },
      sources: [source],
      topRelevanceScore: 0.9,
    });
    expect(gateway.search).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        query: 'Consulta',
        retrievalScope: 'current',
        selectedModuleId: null,
      }),
    );
    expect(gateway.search).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        matchCount: 10,
        matchThreshold: 0.7,
        retrievalScope: 'current',
        selectedModuleId: 'module-a',
      }),
    );
  });

  it('requests clarification with evidence when global results span modules', async () => {
    const sources = [
      source,
      {
        ...source,
        chunkContent: 'Artículo 1. Contenido chunk-b.',
        chunkId: 'chunk-b',
        documentId: 'document-b',
        documentVersionId: 'version-b',
        moduleIds: ['module-b'],
        moduleNames: ['Módulo B'],
        semanticScore: 0.88,
      },
    ];
    gateway.search.mockResolvedValue(sources);

    await expect(service.retrieve('Consulta', null)).resolves.toEqual({
      kind: 'ambiguous',
      modules: [
        { id: 'module-a', name: 'Módulo A' },
        { id: 'module-b', name: 'Módulo B' },
      ],
      sources,
      topRelevanceScore: 0.9,
    });
  });

  it('resuelve el módulo nombrado en la consulta cuando otro compite dentro del margen', async () => {
    const sources = [
      {
        ...source,
        chunkContent: 'RENOVACIÓN DEL CONTRATO DOCENTE 2026.',
        chunkId: 'chunk-docente',
        moduleIds: ['module-contratacion'],
        moduleNames: ['Contratación y desplazamientos'],
        semanticScore: 0.71,
      },
      {
        ...source,
        chunkContent: 'Cronograma de la contratación de auxiliares.',
        chunkId: 'chunk-auxiliares',
        moduleIds: ['module-auxiliares'],
        moduleNames: ['Auxiliar de educación'],
        semanticScore: 0.7,
      },
    ];
    gateway.search.mockResolvedValue(sources);

    const result = await service.retrieve(
      '¿Cuáles son las etapas del proceso de contratación docente 2026?',
      null,
    );

    expect(result.kind).toBe('evidence');
    if (result.kind !== 'evidence') throw new Error('expected evidence');
    expect(result.resolvedModule).toEqual({
      id: 'module-contratacion',
      name: 'Contratación y desplazamientos',
    });
    expect(
      result.sources.every((item) =>
        item.moduleIds.includes('module-contratacion'),
      ),
    ).toBe(true);
  });

  it('desempata «contrato docente» aunque la consulta no diga «contratación»', async () => {
    const sources = [
      {
        ...source,
        chunkContent: 'RENOVACIÓN DEL CONTRATO DOCENTE 2026.',
        chunkId: 'chunk-docente',
        moduleIds: ['module-contratacion'],
        moduleNames: ['Contratación y desplazamientos'],
        semanticScore: 0.71,
      },
      {
        ...source,
        chunkContent: 'Cronograma de la contratación de auxiliares.',
        chunkId: 'chunk-auxiliares',
        moduleIds: ['module-auxiliares'],
        moduleNames: ['Auxiliar de educación'],
        semanticScore: 0.7,
      },
    ];
    gateway.search.mockResolvedValue(sources);

    const result = await service.retrieve(
      '¿Cuáles son los requisitos del contrato docente 2026?',
      null,
    );

    expect(result.kind).toBe('evidence');
    if (result.kind !== 'evidence') throw new Error('expected evidence');
    expect(result.resolvedModule).toEqual({
      id: 'module-contratacion',
      name: 'Contratación y desplazamientos',
    });
  });

  it('mantiene la aclaración cuando la consulta no nombra a los módulos en conflicto', async () => {
    const sources = [
      {
        ...source,
        chunkContent: 'RENOVACIÓN DEL CONTRATO DOCENTE 2026.',
        chunkId: 'chunk-docente',
        moduleIds: ['module-contratacion'],
        moduleNames: ['Contratación y desplazamientos'],
        semanticScore: 0.71,
      },
      {
        ...source,
        chunkContent: 'Cronograma de la contratación de auxiliares.',
        chunkId: 'chunk-auxiliares',
        moduleIds: ['module-auxiliares'],
        moduleNames: ['Auxiliar de educación'],
        semanticScore: 0.7,
      },
    ];
    gateway.search.mockResolvedValue(sources);

    await expect(
      service.retrieve('¿Cuáles son las etapas del proceso?', null),
    ).resolves.toEqual(expect.objectContaining({ kind: 'ambiguous' }));
  });

  it('no desempata con palabras genéricas del dominio ni con un empate real', async () => {
    const sources = [
      {
        ...source,
        chunkContent: 'RENOVACIÓN DEL CONTRATO DOCENTE 2026.',
        chunkId: 'chunk-docente',
        moduleIds: ['module-contratacion'],
        moduleNames: ['Contratación y desplazamientos'],
        semanticScore: 0.71,
      },
      {
        ...source,
        chunkContent: 'Cronograma de la contratación de auxiliares.',
        chunkId: 'chunk-auxiliares',
        moduleIds: ['module-auxiliares'],
        moduleNames: ['Auxiliar de educación'],
        semanticScore: 0.7,
      },
    ];
    gateway.search.mockResolvedValue(sources);

    await expect(
      service.retrieve('¿Qué educación se exige para los docentes?', null),
    ).resolves.toEqual(expect.objectContaining({ kind: 'ambiguous' }));
    await expect(
      service.retrieve(
        '¿El cronograma de contratación de auxiliares es el mismo?',
        null,
      ),
    ).resolves.toEqual(expect.objectContaining({ kind: 'ambiguous' }));
  });

  it('no desempata con palabras administrativas comunes', async () => {
    const sources = [
      {
        ...source,
        chunkContent: 'Criterios de calificación de expedientes.',
        chunkId: 'chunk-situaciones',
        moduleIds: ['module-situaciones'],
        moduleNames: ['Situaciones Administrativas'],
        semanticScore: 0.71,
      },
      {
        ...source,
        chunkContent: 'Norma técnica de la reasignación y permuta.',
        chunkId: 'chunk-contratacion',
        moduleIds: ['module-contratacion'],
        moduleNames: ['Contratación y desplazamientos'],
        semanticScore: 0.7,
      },
    ];
    gateway.search.mockResolvedValue(sources);

    await expect(
      service.retrieve(
        '¿En qué situaciones procede una permuta docente?',
        null,
      ),
    ).resolves.toEqual(expect.objectContaining({ kind: 'ambiguous' }));
    await expect(
      service.retrieve('¿Quién administra los recursos del colegio?', null),
    ).resolves.toEqual(expect.objectContaining({ kind: 'ambiguous' }));
  });

  it('entrega solo la evidencia del proceso resuelto y descarta la cola de otro', async () => {
    const sources = [
      {
        ...source,
        chunkContent: 'RENOVACIÓN DEL CONTRATO DOCENTE 2026.',
        chunkId: 'chunk-docente',
        moduleIds: ['module-contratacion'],
        moduleNames: ['Contratación y desplazamientos'],
        semanticScore: 0.71,
      },
      {
        ...source,
        chunkContent: 'Cronograma de la contratación de auxiliares.',
        chunkId: 'chunk-auxiliares',
        moduleIds: ['module-auxiliares'],
        moduleNames: ['Auxiliar de educación'],
        semanticScore: 0.6,
      },
    ];
    gateway.search.mockResolvedValue(sources);

    const result = await service.retrieve(
      '¿Cómo se renueva el contrato de un docente para el 2026?',
      null,
    );

    expect(result.kind).toBe('evidence');
    if (result.kind !== 'evidence') throw new Error('expected evidence');
    expect(result.resolvedModule).toEqual({
      id: 'module-contratacion',
      name: 'Contratación y desplazamientos',
    });
    expect(result.sources.map((item) => item.chunkId)).toEqual([
      'chunk-docente',
    ]);
  });

  it('resolves a module when every retrieved chunk shares exactly one', async () => {
    gateway.search.mockResolvedValue([
      {
        ...source,
        moduleIds: ['module-a', 'module-b'],
        moduleNames: ['Módulo A', 'Módulo B'],
      },
      {
        ...source,
        chunkId: 'chunk-b',
        chunkContent: 'Contenido chunk-b.',
        moduleIds: ['module-b'],
        moduleNames: ['Módulo B'],
      },
    ]);

    await expect(service.retrieve('Consulta', null)).resolves.toMatchObject({
      kind: 'evidence',
      resolvedModule: { id: 'module-b', name: 'Módulo B' },
      topRelevanceScore: 0.9,
    });
  });

  it('resolves the only named module when another result has no module metadata', async () => {
    gateway.search.mockResolvedValue([
      {
        ...source,
        chunkId: 'chunk-without-module',
        chunkContent: 'Contenido chunk-without-module.',
        moduleIds: [],
        moduleNames: [],
      },
      source,
    ]);

    await expect(service.retrieve('Consulta', null)).resolves.toMatchObject({
      kind: 'evidence',
      resolvedModule: { id: 'module-a', name: 'Módulo A' },
    });
  });

  it('keeps the prior topic on a module-free elliptical follow-up', async () => {
    gateway.search.mockResolvedValue([source]);

    await expect(
      service.retrieve('¿Y cuál es el plazo?', null, [
        'Necesito una reasignación por unidad familiar.',
      ]),
    ).resolves.toMatchObject({ kind: 'evidence', sources: [source] });

    const embeddingCalls = embeddings.embed.mock.calls as Array<
      [string[], unknown]
    >;
    expect(embeddingCalls[0]?.[0]).toHaveLength(1);
    // La consulta del chat no espera los 10 minutos por defecto del SDK.
    expect(embeddingCalls[0]?.[1]).toEqual({ maxRetries: 1, timeout: 30_000 });
    expect(embeddingCalls[0]?.[0]?.[0]).toContain(
      'Necesito una reasignación por unidad familiar.',
    );
    const searchCalls = gateway.search.mock.calls as Array<
      [Parameters<RetrievalGateway['search']>[0]]
    >;
    const globalSearch = searchCalls[0]?.[0];
    expect(globalSearch?.selectedModuleId).toBeNull();
    expect(globalSearch?.query).toContain(
      'Pregunta actual: ¿Y cuál es el plazo?',
    );
  });

  it('searches an elliptical follow-up with context in BOTH searches when a module is selected', async () => {
    // Con la pregunta escueta, la global coincidía con plazos de otros temas y
    // declaraba un falso cambio de tema (auditoría de continuidad, 2026-09-23).
    gateway.search.mockImplementation(
      (input: { selectedModuleId: string | null }) =>
        Promise.resolve(input.selectedModuleId ? [source] : []),
    );

    await expect(
      service.retrieve('¿Y cuál es el plazo?', 'module-a', [
        'Necesito una licencia por salud.',
      ]),
    ).resolves.toMatchObject({ kind: 'evidence', sources: [source] });
    const searchCalls = gateway.search.mock.calls as Array<
      [Parameters<RetrievalGateway['search']>[0]]
    >;
    for (const [call] of searchCalls) {
      expect(call.query).toContain('Necesito una licencia por salud.');
      expect(call.query).toContain('Pregunta actual: ¿Y cuál es el plazo?');
    }
    expect(searchCalls.map(([call]) => call.selectedModuleId)).toEqual([
      null,
      'module-a',
    ]);
  });

  it('searches a follow-up that points back ("durante ese tiempo") with context even if it names a topic', async () => {
    // Revisión de API: «¿Y me pagan durante ese tiempo?» se buscaba sin
    // contexto, resolvía Remuneraciones y el modelo perdía la licencia.
    gateway.search.mockResolvedValue([source]);

    await service.retrieve('¿Y me pagan durante ese tiempo?', 'module-a', [
      '¿Cuántos días de licencia por maternidad me corresponden?',
    ]);

    const searchCalls = gateway.search.mock.calls as Array<
      [Parameters<RetrievalGateway['search']>[0]]
    >;
    for (const [call] of searchCalls) {
      expect(call.query).toContain('licencia por maternidad');
    }
  });

  it('forces the pending question into the search when replying to a clarification', async () => {
    gateway.search.mockResolvedValue([source]);

    await service.retrieve(
      'De reasignación',
      null,
      ['¿Cuáles son los requisitos?'],
      {
        forceContext: true,
      },
    );

    const searchCalls = gateway.search.mock.calls as Array<
      [Parameters<RetrievalGateway['search']>[0]]
    >;
    expect(searchCalls[0]?.[0].query).toContain('¿Cuáles son los requisitos?');
  });

  it('does not keep the previous topic in the module search for a self-contained question', async () => {
    gateway.search.mockResolvedValue([source]);

    await service.retrieve('¿y para una permuta?', 'module-a', [
      'requisitos para una reasignación',
    ]);

    const searchCalls = gateway.search.mock.calls as Array<
      [Parameters<RetrievalGateway['search']>[0]]
    >;
    expect(searchCalls[0]?.[0].query).toBe('¿y para una permuta?');
    expect(searchCalls[1]?.[0].query).toBe('¿y para una permuta?');
  });

  it('searches a follow-up that names its own topic without the previous questions', async () => {
    gateway.search.mockResolvedValue([source]);

    await service.retrieve('¿y para una permuta?', null, [
      'requisitos para solicitar una reasignación',
    ]);

    const searchCalls = gateway.search.mock.calls as Array<
      [Parameters<RetrievalGateway['search']>[0]]
    >;
    expect(searchCalls[0]?.[0].query).toBe('¿y para una permuta?');
  });

  it('keeps the contextual query within the 8,000-character RPC limit, favoring recent questions', async () => {
    gateway.search.mockResolvedValue([source]);

    await service.retrieve('¿y el plazo?', null, [
      'x'.repeat(7_000),
      'consulta reciente',
    ]);

    const searchCalls = gateway.search.mock.calls as Array<
      [Parameters<RetrievalGateway['search']>[0]]
    >;
    const query = searchCalls[0]?.[0].query ?? '';
    expect(query.length).toBeLessThanOrEqual(8_000);
    expect(query).toContain('consulta reciente');
  });

  it('ignores a low-scoring tail source from another module when routing (no false clarification)', async () => {
    // Datos reales: 3 fragmentos del documento de destitución (0.665–0.595) y
    // uno de otro módulo a 0.52 pedían aclaración en «¿y cuál es el plazo?».
    // Un fragmento contiguo del mismo documento no vuelve a ocupar una
    // referencia: se conserva el mejor y solo se añade otra ubicación si aporta
    // algo material (aquí, el plazo de la segunda destitución).
    const main = [0.665, 0.665, 0.595].map((semanticScore, index) => ({
      ...source,
      chunkContent:
        index === 2
          ? 'Artículo 1. Destitución 2: abandono de cargo por 3 días.'
          : `Artículo 1. Destitución ${index}: falta grave reiterada.`,
      chunkId: `main-${index}`,
      semanticScore,
    }));
    const tail = {
      ...source,
      chunkContent: 'Padrones.',
      chunkId: 'tail',
      documentVersionId: 'other-version',
      moduleIds: ['module-b'],
      moduleNames: ['Módulo B'],
      semanticScore: 0.52,
    };
    gateway.search.mockResolvedValue([...main, tail]);

    await expect(
      service.retrieve('¿y cuál es el plazo?', null),
    ).resolves.toEqual({
      kind: 'evidence',
      resolvedModule: { id: 'module-a', name: 'Módulo A' },
      sources: [main[0], main[2]],
      topRelevanceScore: 0.665,
    });
  });

  it('resolves a document associated with several modules instead of asking to clarify', async () => {
    const multiModule = [0.8, 0.78].map((semanticScore, index) => ({
      ...source,
      chunkContent: `Ley ${index}.`,
      chunkId: `ley-${index}`,
      moduleIds: ['module-a', 'module-b'],
      moduleNames: ['Módulo A', 'Módulo B'],
      semanticScore,
    }));
    gateway.search.mockResolvedValue(multiModule);

    await expect(service.retrieve('Consulta', null)).resolves.toMatchObject({
      kind: 'evidence',
      resolvedModule: { id: 'module-a', name: 'Módulo A' },
    });
  });

  it('drops duplicated chunks (same text of the same version) from the evidence', async () => {
    gateway.search.mockResolvedValue([
      source,
      { ...source, chunkId: 'duplicate' },
      {
        ...source,
        chunkContent: 'Otro contenido.',
        chunkId: 'other',
        documentId: 'other-document',
        documentVersionId: 'other-version',
      },
    ]);

    const result = await service.retrieve('Consulta', null);
    if (result.kind !== 'evidence') throw new Error('Expected evidence.');
    expect(result.sources.map((item) => item.chunkId)).toEqual([
      'chunk-id',
      'other',
    ]);
  });

  it('keeps a short shared passage from another document as distinct corroboration', async () => {
    const whole =
      'Inicio del artículo. Tramo compartido del párrafo largo. Cierre.';
    gateway.search.mockResolvedValue([
      { ...source, chunkContent: whole, chunkId: 'whole' },
      {
        ...source,
        chunkContent: 'Tramo compartido   del párrafo largo.',
        chunkId: 'contained',
      },
      {
        ...source,
        chunkContent: 'Tramo compartido del párrafo largo.',
        chunkId: 'other-version',
        documentVersionId: 'another-version',
      },
    ]);

    const result = await service.retrieve('Consulta', null);
    if (result.kind !== 'evidence') throw new Error('Expected evidence.');
    expect(result.sources.map((item) => item.chunkId)).toEqual([
      'whole',
      'other-version',
    ]);
  });

  it('deduplicates identical normalized evidence across documents and keeps the more relevant source', async () => {
    const repeatedEvidence =
      'Los docentes coordinadores de las oficinas diocesanas perciben una remuneración mensual de dos mil seiscientos sesenta y seis soles.';
    const lowerRelevance = {
      ...source,
      articleReference: 'Artículo 3.',
      chunkContent: `Artículo 3. Literal h) ${repeatedEvidence}`,
      chunkId: 'lower-relevance',
      documentId: 'document-a',
      documentVersionId: 'version-a',
      semanticScore: 0.84,
    };
    const higherRelevance = {
      ...source,
      articleReference: 'Artículo 3.',
      chunkContent: `Artículo 3. Literal h) ${repeatedEvidence}`,
      chunkId: 'higher-relevance',
      documentId: 'document-b',
      documentVersionId: 'version-b',
      semanticScore: 0.9,
    };
    gateway.search.mockResolvedValue([lowerRelevance, higherRelevance]);

    const result = await service.retrieve('¿Cuánto gana un profesor?', null);

    expect(result).toMatchObject({
      kind: 'evidence',
      sources: [higherRelevance],
      topRelevanceScore: 0.9,
    });
  });

  it('preserves an ambiguous route when equivalent evidence belongs to different modules', async () => {
    const repeatedEvidence =
      'Los docentes coordinadores de las oficinas diocesanas perciben una remuneración mensual de dos mil seiscientos sesenta y seis soles.';
    const contracts = {
      ...source,
      articleReference: 'Artículo 3.',
      chunkContent: `Artículo 3. Literal h) ${repeatedEvidence}`,
      chunkId: 'contracts-evidence',
      documentId: 'contracts-document',
      documentVersionId: 'contracts-version',
      moduleIds: ['module-a'],
      moduleNames: ['Contratación y desplazamientos'],
      semanticScore: 0.9,
    };
    const remuneration = {
      ...source,
      articleReference: 'Artículo 3.',
      chunkContent: `Artículo 3. Literal h) ${repeatedEvidence}`,
      chunkId: 'remuneration-evidence',
      documentId: 'remuneration-document',
      documentVersionId: 'remuneration-version',
      moduleIds: ['module-b'],
      moduleNames: ['Remuneraciones'],
      semanticScore: 0.88,
    };
    gateway.search.mockResolvedValue([contracts, remuneration]);

    const result = await service.retrieve('¿Cuánto gana un profesor?', null);

    if (result.kind !== 'ambiguous') throw new Error('Expected ambiguity.');
    expect(result.modules).toEqual([
      { id: 'module-a', name: 'Contratación y desplazamientos' },
      { id: 'module-b', name: 'Remuneraciones' },
    ]);
    // La interfaz recibe una sola fuente, pero la ruta aún recuerda ambos
    // módulos para pedir la precisión antes de responder.
    expect(result.sources.map((item) => item.chunkId)).toEqual([
      'contracts-evidence',
    ]);
  });

  it('keeps separate documents when their shared statement has independent details', async () => {
    const sharedStatement =
      'Los docentes coordinadores perciben una remuneración mensual de dos mil seiscientos sesenta y seis soles.';
    const salaryRule = {
      ...source,
      articleReference: 'Artículo 3.',
      chunkContent: `Artículo 3. ${sharedStatement} El pago corresponde únicamente a la jornada adicional autorizada.`,
      chunkId: 'salary-rule',
      documentId: 'document-a',
      documentVersionId: 'version-a',
      semanticScore: 0.9,
    };
    const eligibilityRule = {
      ...source,
      articleReference: 'Artículo 3.',
      chunkContent: `Artículo 3. ${sharedStatement} La norma exige resolución de encargatura vigente para acceder al pago.`,
      chunkId: 'eligibility-rule',
      documentId: 'document-b',
      documentVersionId: 'version-b',
      semanticScore: 0.88,
    };
    gateway.search.mockResolvedValue([salaryRule, eligibilityRule]);

    const result = await service.retrieve('¿Cuánto gana un profesor?', null);
    if (result.kind !== 'evidence') throw new Error('Expected evidence.');

    expect(result.sources.map((item) => item.chunkId)).toEqual([
      'salary-rule',
      'eligibility-rule',
    ]);
  });

  it('keeps documents whose only difference is a short material exception', async () => {
    const applies = {
      ...source,
      articleReference: 'Artículo 3.',
      chunkContent:
        'Artículo 3. La asignación se aplica a los docentes coordinadores con jornada adicional autorizada.',
      chunkId: 'applies',
      documentId: 'document-a',
      documentVersionId: 'version-a',
      semanticScore: 0.9,
    };
    const doesNotApply = {
      ...source,
      articleReference: 'Artículo 3.',
      chunkContent:
        'Artículo 3. La asignación no se aplica a los docentes coordinadores con jornada adicional autorizada.',
      chunkId: 'does-not-apply',
      documentId: 'document-b',
      documentVersionId: 'version-b',
      semanticScore: 0.88,
    };
    gateway.search.mockResolvedValue([applies, doesNotApply]);

    const result = await service.retrieve('Consulta', null);
    if (result.kind !== 'evidence') throw new Error('Expected evidence.');

    expect(result.sources.map((item) => item.chunkId)).toEqual([
      'applies',
      'does-not-apply',
    ]);
  });

  it('keeps only the sources within the relevance band of the best one, capped at the match count', async () => {
    const scores = [0.8, 0.78, 0.76, 0.74, 0.72, 0.7, 0.6];
    gateway.search.mockResolvedValue(
      scores.map((semanticScore, index) => ({
        ...source,
        chunkContent: `Fragmento ${index}.`,
        chunkId: `band-${index}`,
        documentId: `document-${index}`,
        documentVersionId: `version-${index}`,
        semanticScore,
      })),
    );

    const result = await service.retrieve('Consulta', null);
    if (result.kind !== 'evidence') throw new Error('Expected evidence.');
    expect(result.sources.map((item) => item.semanticScore)).toEqual([
      0.8, 0.78, 0.76, 0.74, 0.72,
    ]);
  });

  it('post-processes a forty-document candidate set and diversifies evidence', async () => {
    const corpus = Array.from({ length: 40 }, (_value, index) => ({
      ...source,
      chunkContent: `Contenido del documento ${index + 1}.`,
      chunkId: `chunk-${index + 1}`,
      documentId: `document-${index + 1}`,
      documentTitle: `Documento ${index + 1}`,
      documentVersionId: `version-${index + 1}`,
      semanticScore: index === 36 ? 0.95 : 0.9 - index / 1_000,
    }));
    gateway.search.mockResolvedValue(corpus);

    const result = await service.retrieve(
      '¿Qué condición establece el documento relevante?',
      null,
    );
    if (result.kind !== 'evidence') throw new Error('Expected evidence.');

    expect(result.sources).toHaveLength(5);
    expect(
      result.sources.some((item) => item.documentId === 'document-37'),
    ).toBe(true);
    expect(
      new Set(result.sources.map((item) => item.documentVersionId)).size,
    ).toBe(5);
    expect(gateway.search).toHaveBeenCalledWith(
      expect.objectContaining({ matchCount: 10 }),
    );
  });

  it('adds global evidence of a sibling subtopic inside the selected module', async () => {
    const reasignacion = {
      ...source,
      chunkContent: 'Reasignación.',
      chunkId: 'r',
      documentId: 'document-r',
      documentVersionId: 'version-r',
      semanticScore: 0.7,
    };
    const permuta = {
      ...source,
      chunkContent: 'Permuta.',
      chunkId: 'p',
      documentId: 'document-p',
      documentVersionId: 'version-p',
      semanticScore: 0.72,
    };
    gateway.search.mockImplementation(
      (input: { selectedModuleId: string | null }) =>
        Promise.resolve(input.selectedModuleId ? [reasignacion] : [permuta]),
    );

    const result = await service.retrieve('¿y para una permuta?', 'module-a', [
      'requisitos para una reasignación',
    ]);
    if (result.kind !== 'evidence') throw new Error('Expected evidence.');
    expect(result.sources.map((item) => item.chunkId)).toEqual(['p', 'r']);
  });

  it('detects a clear topic switch without mixing the former module sources', async () => {
    const switchedSource = {
      ...source,
      chunkId: 'chunk-b',
      chunkContent: 'Artículo 1. Contenido chunk-b.',
      moduleIds: ['module-b'],
      moduleNames: ['Módulo B'],
      semanticScore: 0.95,
    };
    gateway.search.mockImplementation(
      (input: { selectedModuleId: string | null }) =>
        Promise.resolve(
          input.selectedModuleId
            ? [{ ...source, semanticScore: 0.8 }]
            : [switchedSource],
        ),
    );

    await expect(
      service.retrieve(
        'Ahora necesito información sobre vacaciones.',
        'module-a',
        ['Antes consulté una licencia.'],
      ),
    ).resolves.toEqual({
      kind: 'topic_change',
      resolvedModule: { id: 'module-b', name: 'Módulo B' },
      sources: [switchedSource],
      topRelevanceScore: 0.95,
    });
  });

  it('clarifies instead of auto-switching when both modules have competing evidence', async () => {
    const switchedSource = {
      ...source,
      chunkContent: 'Artículo 1. Contenido chunk-b.',
      chunkId: 'chunk-b',
      documentId: 'document-b',
      documentVersionId: 'version-b',
      moduleIds: ['module-b'],
      moduleNames: ['Módulo B'],
      semanticScore: 0.95,
    };
    gateway.search.mockImplementation(
      (input: { selectedModuleId: string | null }) =>
        Promise.resolve(input.selectedModuleId ? [source] : [switchedSource]),
    );

    await expect(
      service.retrieve('Consulta potencialmente nueva', 'module-a', [
        'Consulta anterior del módulo A',
      ]),
    ).resolves.toEqual({
      kind: 'ambiguous',
      modules: [
        { id: 'module-a', name: 'Módulo A' },
        { id: 'module-b', name: 'Módulo B' },
      ],
      sources: [switchedSource, source],
      topRelevanceScore: 0.95,
    });
  });

  it('does not repeat identical evidence in a clarification returned by both searches', async () => {
    const repeatedEvidence =
      'Los docentes coordinadores de las oficinas diocesanas perciben una remuneración mensual de dos mil seiscientos sesenta y seis soles.';
    const globalSource = {
      ...source,
      articleReference: 'Artículo 3.',
      chunkContent: `Artículo 3. Literal h) ${repeatedEvidence}`,
      chunkId: 'global-duplicate',
      documentId: 'document-b',
      documentVersionId: 'version-b',
      moduleIds: ['module-b'],
      moduleNames: ['Módulo B'],
      semanticScore: 0.95,
    };
    const selectedSource = {
      ...source,
      articleReference: 'Artículo 3.',
      chunkContent: `Artículo 3. Literal h) ${repeatedEvidence}`,
      chunkId: 'selected-duplicate',
      documentId: 'document-a',
      documentVersionId: 'version-a',
      semanticScore: 0.9,
    };
    gateway.search.mockImplementation(
      (input: { selectedModuleId: string | null }) =>
        Promise.resolve(
          input.selectedModuleId ? [selectedSource] : [globalSource],
        ),
    );

    await expect(
      service.retrieve('Consulta potencialmente nueva', 'module-a'),
    ).resolves.toEqual({
      kind: 'ambiguous',
      modules: [
        { id: 'module-a', name: 'Módulo A' },
        { id: 'module-b', name: 'Módulo B' },
      ],
      sources: [globalSource],
      topRelevanceScore: 0.95,
    });
  });

  it('caps competing clarification evidence at ten while retaining both modules', async () => {
    const globalSources = Array.from({ length: 10 }, (_value, index) => ({
      ...source,
      chunkId: `global-${index}`,
      chunkContent: `Contenido global-${index}.`,
      documentId: `global-document-${index}`,
      documentVersionId: `global-version-${index}`,
      moduleIds: ['module-b'],
      moduleNames: ['Módulo B'],
      semanticScore: 0.95 - index / 1_000,
    }));
    const selectedSources = Array.from({ length: 10 }, (_value, index) => ({
      ...source,
      chunkId: `selected-${index}`,
      chunkContent: `Contenido selected-${index}.`,
      documentId: `selected-document-${index}`,
      documentVersionId: `selected-version-${index}`,
      semanticScore: 0.9 - index / 1_000,
    }));
    gateway.search.mockImplementation(
      (input: { selectedModuleId: string | null }) =>
        Promise.resolve(
          input.selectedModuleId ? selectedSources : globalSources,
        ),
    );

    const result = await service.retrieve('Consulta competitiva', 'module-a');

    expect(result.kind).toBe('ambiguous');
    if (result.kind !== 'ambiguous') {
      throw new Error('Expected competing evidence to request clarification.');
    }
    expect(result.sources).toHaveLength(10);
    expect(new Set(result.sources.map((item) => item.chunkId)).size).toBe(10);
    expect(
      result.sources.some((item) => item.moduleIds.includes('module-a')),
    ).toBe(true);
    expect(
      result.sources.some((item) => item.moduleIds.includes('module-b')),
    ).toBe(true);
  });

  it('clarifies when current evidence is ambiguous and excludes the selected module', async () => {
    const globalSources = [
      {
        ...source,
        chunkContent: 'Artículo 1. Contenido chunk-b.',
        chunkId: 'chunk-b',
        documentId: 'document-b',
        documentVersionId: 'version-b',
        moduleIds: ['module-b'],
        moduleNames: ['Módulo B'],
      },
      {
        ...source,
        chunkContent: 'Artículo 1. Contenido chunk-c.',
        chunkId: 'chunk-c',
        documentId: 'document-c',
        documentVersionId: 'version-c',
        moduleIds: ['module-c'],
        moduleNames: ['Módulo C'],
      },
    ];
    gateway.search.mockImplementation(
      (input: { selectedModuleId: string | null }) =>
        Promise.resolve(input.selectedModuleId ? [] : globalSources),
    );

    await expect(
      service.retrieve('Consulta nueva', 'module-a'),
    ).resolves.toEqual({
      kind: 'ambiguous',
      modules: [
        { id: 'module-b', name: 'Módulo B' },
        { id: 'module-c', name: 'Módulo C' },
      ],
      sources: globalSources,
      topRelevanceScore: 0.9,
    });
  });

  it('uses current-question evidence when it resolves to the selected module', async () => {
    gateway.search.mockImplementation(
      (input: { selectedModuleId: string | null }) =>
        Promise.resolve(input.selectedModuleId ? [] : [source]),
    );

    await expect(
      service.retrieve('Consulta directa', 'module-a'),
    ).resolves.toEqual({
      kind: 'evidence',
      resolvedModule: { id: 'module-a', name: 'Módulo A' },
      sources: [source],
      topRelevanceScore: 0.9,
    });
  });

  it('keeps a selected submodule under its actual root instead of declaring a false topic change', async () => {
    const associatedSource = {
      ...source,
      moduleAssociations: [
        {
          rootModuleId: 'module-a',
          rootModuleName: 'Módulo A',
          submoduleId: 'submodule-a',
          submoduleName: 'Submódulo A',
        },
      ],
    };
    gateway.search.mockResolvedValue([associatedSource]);

    await expect(
      service.retrieve('Consulta del submódulo', 'submodule-a'),
    ).resolves.toMatchObject({
      kind: 'evidence',
      resolvedModule: { id: 'module-a', name: 'Módulo A' },
    });
  });

  it.each([
    ['Compara esta norma con su versión anterior', 'historical'],
    ['Consulta el antecedente archivado', 'archived_explicit'],
  ] as const)(
    'passes the governed %s scope to every retrieval path',
    async (question, retrievalScope) => {
      gateway.search.mockResolvedValue([]);

      await service.retrieve(question, 'module-a');

      // Dos búsquedas semánticas (global y módulo) y, al quedar vacías, las
      // dos del rescate léxico; todas deben conservar el alcance gobernado.
      expect(gateway.search).toHaveBeenCalledTimes(4);
      const calls = gateway.search.mock.calls as Array<
        [{ retrievalScope?: string }]
      >;
      expect(
        calls.every((call) => call[0]?.retrievalScope === retrievalScope),
      ).toBe(true);
    },
  );

  it('entrega una sola referencia por documento cuando el fragmento contiguo no aporta nada nuevo', async () => {
    // OBS-009/OBS-017: dos fragmentos contiguos del mismo archivo no deben
    // ocupar dos referencias visibles.
    gateway.search.mockResolvedValue([
      {
        ...source,
        chunkContent: 'Artículo 1. La licencia se solicita por mesa de partes.',
        chunkId: 'chunk-a',
        pageEnd: 3,
        pageStart: 3,
      },
      {
        ...source,
        chunkContent: 'Artículo 1. Presenta tu solicitud por mesa de partes.',
        chunkId: 'chunk-b',
        pageEnd: 4,
        pageStart: 4,
      },
    ]);

    const result = await service.retrieve('¿Cómo solicito una licencia?', null);
    if (result.kind !== 'evidence') throw new Error('Expected evidence.');

    expect(result.sources.map((item) => item.chunkId)).toEqual(['chunk-a']);
    // La referencia conservada mantiene su propia página: la cita [1] sigue
    // siendo verificable y no se fusionan rangos.
    expect(result.sources[0]).toMatchObject({ pageEnd: 3, pageStart: 3 });
  });

  it('excluye el antecedente de una consulta salarial actual', async () => {
    const historica = {
      ...source,
      chunkContent:
        'La remuneración mensual del docente era de S/ 2 000,00. [texto histórico]',
      chunkId: 'remuneracion-historica',
      documentSituation: 'replaced' as const,
      documentVersionId: 'version-historica',
      issuanceYear: 2018,
      pageEnd: 8,
      pageStart: 8,
      semanticScore: 0.99,
    };
    const especial = {
      ...source,
      chunkContent:
        'La asignación por tiempo de servicio es de S/ 2 666,80 para el personal nombrado.',
      chunkId: 'asignacion-especial',
      documentVersionId: 'version-especial',
      pageEnd: 4,
      pageStart: 4,
      semanticScore: 0.95,
    };
    const vigente = {
      ...source,
      chunkContent:
        'La remuneración mensual del docente con jornada de 30 horas es de S/ 3 300,60.',
      chunkId: 'remuneracion-vigente',
      documentVersionId: 'version-vigente',
      pageEnd: 6,
      pageStart: 6,
      semanticScore: 0.9,
    };
    gateway.search.mockResolvedValue([historica, especial, vigente]);

    const result = await service.retrieve(
      '¿Cuánto es mi remuneración mensual?',
      null,
    );
    if (result.kind !== 'evidence') throw new Error('Expected evidence.');

    // La remuneración general vigente encabeza la respuesta; la asignación
    // especial no la sustituye y el antecedente ni siquiera llega a competir.
    expect(result.sources.map((item) => item.chunkId)).toEqual([
      'remuneracion-vigente',
      'asignacion-especial',
    ]);
    expect(result.sources).not.toContainEqual(
      expect.objectContaining({ documentSituation: 'replaced' }),
    );
  });

  it('descarta antes de la banda de similitud la cifra salarial incompatible', async () => {
    const director40 = {
      ...source,
      chunkContent:
        'La remuneración mensual del director nombrado con jornada de 40 horas es de S/ 4 400,80.',
      chunkId: 'director-40',
      documentVersionId: 'version-director-40',
      semanticScore: 0.99,
    };
    const docente30 = {
      ...source,
      chunkContent:
        'La remuneración mensual del docente nombrado con jornada de 30 horas es de S/ 3 300,60.',
      chunkId: 'docente-30',
      documentVersionId: 'version-docente-30',
      semanticScore: 0.8,
    };
    gateway.search.mockResolvedValue([director40, docente30]);

    const result = await service.retrieve(
      '¿Cuánto gana un docente nombrado de 30 horas?',
      null,
    );

    if (result.kind !== 'evidence') throw new Error('Expected evidence.');
    expect(result.sources.map((item) => item.chunkId)).toEqual(['docente-30']);
  });

  describe('factores salariales heredados de la consulta previa', () => {
    const docente = (hours: number, semanticScore: number) => ({
      ...source,
      chunkContent: `La remuneración mensual del docente nombrado con jornada de ${hours} horas es de S/ ${hours},00.`,
      chunkId: `docente-${hours}`,
      documentVersionId: `version-docente-${hours}`,
      semanticScore,
    });

    // H-3: «De 30 horas» no contiene ningún término salarial; sin heredar la
    // consulta previa el filtro no se aplicaba a la respuesta de aclaración.
    it('aplica el filtro a la respuesta de una aclaración', async () => {
      gateway.search.mockResolvedValue([docente(40, 0.9), docente(30, 0.89)]);

      const result = await service.retrieve(
        'De 30 horas',
        null,
        ['¿Cuánto gana un docente nombrado?'],
        { forceContext: true },
      );

      if (result.kind !== 'evidence') throw new Error('Expected evidence.');
      expect(result.sources.map((item) => item.chunkId)).toEqual([
        'docente-30',
      ]);
    });

    it('la jornada de la respuesta prevalece sobre la de la consulta previa', async () => {
      gateway.search.mockResolvedValue([docente(40, 0.9), docente(30, 0.89)]);

      const result = await service.retrieve(
        '¿Y para 40 horas?',
        null,
        ['¿Cuánto gana un docente nombrado de 30 horas?'],
        { forceContext: true },
      );

      if (result.kind !== 'evidence') throw new Error('Expected evidence.');
      expect(result.sources.map((item) => item.chunkId)).toEqual([
        'docente-40',
      ]);
    });

    it('una consulta con tema propio no hereda los factores de la anterior', async () => {
      gateway.search.mockResolvedValue([docente(40, 0.9), docente(30, 0.89)]);

      const result = await service.retrieve(
        '¿Cuál es la remuneración de un docente nombrado?',
        null,
        ['¿Cuánto gana un docente nombrado de 30 horas?'],
      );

      if (result.kind !== 'evidence') throw new Error('Expected evidence.');
      expect(result.sources.map((item) => item.chunkId).sort()).toEqual([
        'docente-30',
        'docente-40',
      ]);
    });
  });

  it('ordena la comparación histórica de la más reciente a la más antigua', async () => {
    const byYear = [2018, 2022, 2019].map((issuanceYear) => ({
      ...source,
      chunkContent: `Remuneración mensual del año ${issuanceYear} para docentes.`,
      chunkId: `remuneracion-${issuanceYear}`,
      documentSituation: 'replaced' as const,
      documentVersionId: `version-${issuanceYear}`,
      issuanceYear,
    }));
    gateway.search.mockResolvedValue(byYear);

    const result = await service.retrieve(
      '¿Cómo cambió la remuneración docente entre 2018 y 2022?',
      null,
    );
    if (result.kind !== 'evidence') throw new Error('Expected evidence.');

    expect(gateway.search).toHaveBeenCalledWith(
      expect.objectContaining({ retrievalScope: 'historical' }),
    );
    expect(result.sources.map((item) => item.issuanceYear)).toEqual([
      2022, 2019, 2018,
    ]);
  });

  it('no pide aclaración cuando la consulta nombra la norma de auxiliares 2026', async () => {
    const auxiliares = {
      ...source,
      chunkContent:
        'Artículo 1. Norma que regula a los auxiliares de educación 2026.',
      chunkId: 'chunk-auxiliares',
      documentId: 'document-auxiliares',
      documentVersionId: 'version-auxiliares',
      moduleIds: ['module-auxiliares'],
      moduleNames: ['Auxiliar de educación'],
      semanticScore: 0.72,
    };
    const contratacion = {
      ...source,
      chunkContent: 'Artículo 1. Cronograma de la contratación docente.',
      chunkId: 'chunk-contratacion',
      documentId: 'document-contratacion',
      documentVersionId: 'version-contratacion',
      moduleIds: ['module-contratacion'],
      moduleNames: ['Contratación y desplazamientos'],
      semanticScore: 0.7,
    };
    gateway.search.mockResolvedValue([auxiliares, contratacion]);

    // OBS-014: la consulta nombra su tema; pedir precisión sería un falso
    // positivo aunque otro módulo compita dentro del margen.
    await expect(
      service.retrieve(
        '¿Quién aprueba la norma de auxiliares de educación 2026?',
        null,
      ),
    ).resolves.toEqual({
      kind: 'evidence',
      resolvedModule: {
        id: 'module-auxiliares',
        name: 'Auxiliar de educación',
      },
      sources: [auxiliares],
      topRelevanceScore: 0.72,
    });
  });

  it('redirige al módulo nombrado en la consulta aunque la conversación esté en otro', async () => {
    const auxiliares = {
      ...source,
      chunkContent:
        'Artículo 1. Norma que regula a los auxiliares de educación 2026.',
      chunkId: 'chunk-auxiliares',
      documentId: 'document-auxiliares',
      documentVersionId: 'version-auxiliares',
      moduleIds: ['module-auxiliares'],
      moduleNames: ['Auxiliar de educación'],
      semanticScore: 0.72,
    };
    const padrones = {
      ...source,
      chunkContent: 'Artículo 1. Padrón de instituciones educativas.',
      chunkId: 'chunk-padrones',
      documentId: 'document-padrones',
      documentVersionId: 'version-padrones',
      moduleIds: ['module-padrones'],
      moduleNames: ['Padrones y estadística'],
      semanticScore: 0.7,
    };
    gateway.search.mockImplementation(
      (input: { selectedModuleId: string | null }) =>
        Promise.resolve(input.selectedModuleId ? [] : [auxiliares, padrones]),
    );

    const result = await service.retrieve(
      '¿Quién aprueba la norma de auxiliares de educación 2026?',
      'module-docente',
      ['Consulta anterior del módulo docente'],
    );

    expect(result).toMatchObject({
      kind: 'topic_change',
      resolvedModule: {
        id: 'module-auxiliares',
        name: 'Auxiliar de educación',
      },
      sources: [auxiliares],
    });
  });

  it('rejects malformed query embeddings before database search', async () => {
    embeddings.embed.mockResolvedValue([[0.1]]);
    await expect(service.retrieve('Consulta', null)).rejects.toThrow(
      'RAG_INVALID_QUERY_EMBEDDING',
    );
    expect(gateway.search).not.toHaveBeenCalled();
  });
});

describe('resolveDetectedSubmodule', () => {
  it('discloses a submodule only when every source agrees on the same route', () => {
    const sources = [
      {
        ...source,
        moduleAssociations: [
          {
            rootModuleId: 'module-a',
            rootModuleName: 'Módulo A',
            submoduleId: 'submodule-a',
            submoduleName: 'Submódulo A',
          },
        ],
      },
      {
        ...source,
        chunkId: 'chunk-b',
        chunkContent: 'Contenido chunk-b.',
        moduleAssociations: [
          {
            rootModuleId: 'module-a',
            rootModuleName: 'Módulo A',
            submoduleId: 'submodule-a',
            submoduleName: 'Submódulo A',
          },
        ],
      },
    ];

    expect(resolveDetectedSubmodule(sources, 'module-a')).toEqual({
      id: 'submodule-a',
      name: 'Submódulo A',
    });
    expect(
      resolveDetectedSubmodule(
        [{ ...sources[0], moduleAssociations: [] }],
        'module-a',
      ),
    ).toBeNull();
  });
});

describe('detectRetrievalScope', () => {
  it.each([
    ['¿Qué norma se aplica actualmente?', 'current'],
    ['Compara la norma vigente con la versión anterior.', 'historical'],
    ['¿Qué establecía la normativa de 2024?', 'historical'],
    ['Necesito los antecedentes históricos específicos.', 'archived_explicit'],
    ['Muéstrame el documento archivado.', 'archived_explicit'],
  ] as const)('classifies %s as %s', (question, expected) => {
    expect(detectRetrievalScope(question, 2026)).toBe(expected);
  });

  it('does not unlock history for the current year alone', () => {
    expect(detectRetrievalScope('Normativa vigente de 2026', 2026)).toBe(
      'current',
    );
  });
});

describe('RagService — preguntas por fechas', () => {
  // Redacción real del sello SINAD (expediente y clave anonimizados) pegada a
  // la tabla del cronograma, como la extrae el PDF del oficio del destaque.
  const SEAL =
    'La integridad del documento y la autoría de la(s) firma(s) pueden ser verificadas en https://apps.firmaperu.gob.pe/web/validador.xhtml EXPEDIENTE: DITEN2026-INT-0000000 CLAVE: AB12CD Esto es una copia auténtica imprimible de un documento electrónico archivado en el Ministerio de Educación, aplicando lo dispuesto por el Art. 25 de D.S. 070- 2013-PCM y la Tercera Disposición Complementaria Final del D.S. 026-2016- PCM. Su autenticidad e integridad pueden ser contrastadas a través de la siguiente dirección web: https://esinad.minedu.gob.pe/e_sinadmed_2/VDD_ConsultaDocumento.aspx';
  const SCHEDULE =
    'CRONOGRAMA DE DESTAQUE 2026 ACTIVIDADES RESPONSABLES INICIO FIN RENOVACIÓN DE DESTAQUE 1 Presentación de solicitudes IE/UGEL 13.01.2026 14.01.2026 2 Aplicación de la ficha de evaluación (Anexo 5) IE/UGEL 14.01.2026 15.01.2026 3 Resultados de la evaluación IE/UGEL 16.01.2026';
  const prose = {
    ...source,
    articleReference: null,
    chunkContent:
      'Para el presente año, las solicitudes de destaque se presentan ante la UGEL o DRE de destino, de acuerdo con las fechas del cronograma que se adjunta.',
    chunkId: 'prosa',
    documentTitle: 'Aprobación del cronograma de destaque 2026',
    documentVersionId: 'cronograma-v',
    sectionTitle: null,
    semanticScore: 0.52,
  };
  const row = (
    chunkId: string,
    chunkIndex: number,
    chunkContent: string,
    documentVersionId = 'cronograma-v',
  ) => ({
    articleReference: null,
    chunkContent,
    chunkId,
    chunkIndex,
    documentVersionId,
    numeralReference: null,
    pageEnd: 4,
    pageStart: 3,
    sectionTitle: null,
  });
  /** Un párrafo real del oficio: unas fechas sueltas en mucho texto. */
  const longParagraph = (dated: string) =>
    `${dated} ${'El procedimiento se desarrolla ante la UGEL o DRE de destino conforme a la norma técnica vigente y sus disposiciones complementarias. '.repeat(16)}`;

  let embeddings: { embed: jest.Mock };
  let gateway: { datedChunksOfVersions?: jest.Mock; search: jest.Mock };
  let service: RagService;

  function build(withDatedChunks: boolean) {
    embeddings = {
      embed: jest
        .fn()
        .mockImplementation((queries: string[]) =>
          Promise.resolve(queries.map(() => vector())),
        ),
    };
    gateway = {
      search: jest.fn(),
      ...(withDatedChunks ? { datedChunksOfVersions: jest.fn() } : {}),
    };
    service = new RagService(embeddings, gateway, {
      get: jest.fn((key: string) => (key === 'RAG_MATCH_COUNT' ? 5 : 0.5)),
    } as never);
  }

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('completa «¿cuándo se dan los destaques?» con la tabla del mismo documento', async () => {
    build(true);
    gateway.search.mockResolvedValue([prose]);
    gateway.datedChunksOfVersions?.mockResolvedValue([
      row(
        'oficio',
        3,
        'El destaque rige a partir del 01.03.2026; la asistencia técnica es el 16 de enero.',
      ),
      row('tabla', 4, `de todos los postulantes.\n\n${SEAL} ${SCHEDULE}`),
    ]);

    const result = await service.retrieve('cuando se dan los destaques?', null);

    expect(result.kind).toBe('evidence');
    if (result.kind !== 'evidence') throw new Error('Expected evidence');
    expect(result.sources.map((entry) => entry.chunkId)).toEqual([
      'prosa',
      'tabla',
    ]);
    const table = result.sources[1];
    expect(table?.chunkContent).toContain(SCHEDULE);
    expect(table?.chunkContent).not.toContain('firmaperu');
    expect(table).toMatchObject({
      documentTitle: 'Aprobación del cronograma de destaque 2026',
      documentVersionId: 'cronograma-v',
      pageStart: 3,
      semanticScore: 0.52,
    });
    expect(result.topRelevanceScore).toBe(0.52);
    expect(gateway.datedChunksOfVersions).toHaveBeenCalledWith({
      limitPerVersion: 30,
      versionIds: ['cronograma-v'],
    });
    // Sin búsqueda adicional: el cronograma estaba en un documento ya admitido.
    expect(gateway.search).toHaveBeenCalledTimes(1);
  });

  it('agrega el fragmento contiguo cuando la tabla continúa', async () => {
    build(true);
    gateway.search.mockResolvedValue([prose]);
    gateway.datedChunksOfVersions?.mockResolvedValue([
      row('tabla', 4, SCHEDULE),
      row(
        'tabla-sigue',
        5,
        'UNIDAD FAMILIAR DE DESTAQUE 5 Presentación de solicitudes 19.01.2026 21.01.2026 6 Revisión 19.01.2026 22.01.2026',
      ),
      row(
        'lejano',
        9,
        'Destaque: vigencias del 01.02.2025, 01.03.2025 y 31.12.2025.',
      ),
    ]);

    const result = await service.retrieve('¿Cuándo es el destaque?', null);

    if (result.kind !== 'evidence') throw new Error('Expected evidence');
    expect(result.sources.map((entry) => entry.chunkId)).toEqual([
      'prosa',
      'tabla',
      'tabla-sigue',
    ]);
  });

  it('no busca el cronograma si la pregunta no pide fechas', async () => {
    build(true);
    gateway.search.mockResolvedValue([prose]);

    const result = await service.retrieve('¿Qué es el destaque?', null);

    expect(result).toMatchObject({ kind: 'evidence', sources: [prose] });
    expect(gateway.datedChunksOfVersions).not.toHaveBeenCalled();
  });

  it('no agrega nada ni busca en el módulo cuando la evidencia ya trae la tabla completa', async () => {
    build(true);
    const withTable = { ...prose, chunkContent: SCHEDULE, chunkId: 'tabla' };
    gateway.search.mockResolvedValue([withTable]);
    gateway.datedChunksOfVersions?.mockResolvedValue([
      row('tabla', 4, SCHEDULE),
      row(
        'lejano',
        9,
        'Destaque: vigencias del 01.02.2025, 01.03.2025 y 31.12.2025.',
      ),
    ]);

    const result = await service.retrieve('¿Cuándo es el destaque?', null);

    expect(result).toMatchObject({ kind: 'evidence', sources: [withTable] });
    expect(gateway.search).toHaveBeenCalledTimes(1);
  });

  it('completa la tabla ya entregada con su fragmento contiguo', async () => {
    // La «Modificación del cronograma de contratación docente» llega partida:
    // la búsqueda entrega el fragmento #3 y la tabla sigue en #2 y #4.
    build(true);
    const withTable = { ...prose, chunkContent: SCHEDULE, chunkId: 'tabla' };
    gateway.search.mockResolvedValue([withTable]);
    gateway.datedChunksOfVersions?.mockResolvedValue([
      row('tabla', 4, SCHEDULE),
      row(
        'tabla-sigue',
        5,
        'UNIDAD FAMILIAR 5 Presentación de solicitudes 19.01.2026 21.01.2026 6 Revisión 19.01.2026 22.01.2026',
      ),
    ]);

    const result = await service.retrieve('¿Cuándo es el destaque?', null);

    if (result.kind !== 'evidence') throw new Error('Expected evidence');
    expect(result.sources.map((entry) => entry.chunkId)).toEqual([
      'tabla',
      'tabla-sigue',
    ]);
    expect(gateway.search).toHaveBeenCalledTimes(1);
  });

  it('agrega la tabla aunque la evidencia traiga un párrafo con pocas fechas sueltas', async () => {
    // «¿En qué fechas se presentan las solicitudes de destaque?» recuperaba el
    // párrafo que remite al «cronograma que se adjunta» (tres fechas sueltas)
    // y ese párrafo no reemplaza a la tabla.
    build(true);
    const reference = {
      ...prose,
      chunkContent: longParagraph(
        'Las solicitudes de destaque se presentan de acuerdo con el cronograma que se adjunta. La vigencia es a partir del 01.03.2026; para directivos, desde el 01 de febrero; la asistencia técnica es el 16 de enero.',
      ),
      chunkId: 'remite',
    };
    gateway.search.mockResolvedValue([reference]);
    gateway.datedChunksOfVersions?.mockResolvedValue([
      row('remite', 3, reference.chunkContent),
      row('tabla', 4, SCHEDULE),
    ]);

    const result = await service.retrieve(
      '¿En qué fechas se presentan las solicitudes de destaque?',
      null,
    );

    if (result.kind !== 'evidence') throw new Error('Expected evidence');
    expect(result.sources.map((entry) => entry.chunkId)).toEqual([
      'remite',
      'tabla',
    ]);
  });

  it('busca el cronograma en el módulo cuando ningún documento entregado lo trae', async () => {
    build(false);
    const otherProcess = {
      ...source,
      chunkContent:
        'CRONOGRAMA DE REASIGNACIÓN 2026 Presentación de solicitudes 02.02.2026 06.02.2026 Resultados 20.02.2026',
      chunkId: 'reasignacion',
      documentVersionId: 'reasignacion-v',
      semanticScore: 0.49,
    };
    const destaqueSchedule = {
      ...source,
      chunkContent: SCHEDULE,
      chunkId: 'tabla-otra',
      documentTitle: 'Cronograma de destaque 2026',
      documentVersionId: 'cronograma-otro',
      semanticScore: 0.46,
    };
    gateway.search
      .mockResolvedValueOnce([prose])
      .mockResolvedValueOnce([otherProcess, destaqueSchedule]);

    const result = await service.retrieve(
      '¿Cuándo se dan los destaques 2026?',
      null,
    );

    if (result.kind !== 'evidence') throw new Error('Expected evidence');
    expect(result.sources.map((entry) => entry.chunkId)).toEqual([
      'prosa',
      'tabla-otra',
    ]);
    expect(gateway.search).toHaveBeenLastCalledWith(
      expect.objectContaining({
        matchCount: 10,
        matchThreshold: 0.4,
        query:
          'cronograma de destaques 2026: actividades, fechas de inicio y fin',
        selectedModuleId: 'module-a',
      }),
    );
  });

  it('completa con sus fragmentos contiguos el cronograma hallado en el módulo', async () => {
    build(true);
    const destaqueSchedule = {
      ...source,
      chunkContent: SCHEDULE,
      chunkId: 'tabla-otra',
      documentTitle: 'Cronograma de destaque 2026',
      documentVersionId: 'cronograma-otro',
      semanticScore: 0.46,
    };
    gateway.search
      .mockResolvedValueOnce([prose])
      .mockResolvedValueOnce([destaqueSchedule]);
    gateway.datedChunksOfVersions
      ?.mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        row('tabla-otra', 4, SCHEDULE, 'cronograma-otro'),
        row(
          'tabla-otra-sigue',
          5,
          'UNIDAD FAMILIAR 5 Presentación de solicitudes 19.01.2026 21.01.2026 6 Revisión 19.01.2026 22.01.2026',
          'cronograma-otro',
        ),
      ]);

    const result = await service.retrieve(
      '¿Cuándo se dan los destaques?',
      null,
    );

    if (result.kind !== 'evidence') throw new Error('Expected evidence');
    expect(result.sources.map((entry) => entry.chunkId)).toEqual([
      'prosa',
      'tabla-otra',
      'tabla-otra-sigue',
    ]);
    expect(result.sources[2]).toMatchObject({
      documentTitle: 'Cronograma de destaque 2026',
      semanticScore: 0.46,
    });
    expect(gateway.datedChunksOfVersions).toHaveBeenLastCalledWith({
      limitPerVersion: 30,
      versionIds: ['cronograma-otro'],
    });
  });

  it('no busca en el módulo un seguimiento sin tema propio', async () => {
    build(false);
    gateway.search.mockResolvedValue([prose]);

    const result = await service.retrieve('¿y cuándo?', null);

    expect(result).toMatchObject({ kind: 'evidence', sources: [prose] });
    expect(gateway.search).toHaveBeenCalledTimes(1);
  });

  it('responde con la evidencia hallada si la lectura del cronograma falla', async () => {
    build(true);
    gateway.search.mockResolvedValue([prose]);
    gateway.datedChunksOfVersions?.mockRejectedValue(
      new Error('PostgREST caído'),
    );

    await expect(
      service.retrieve('cuando se dan los destaques?', null),
    ).resolves.toMatchObject({ kind: 'evidence', sources: [prose] });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(Logger.prototype.warn).toHaveBeenCalledTimes(1);
  });

  it('no completa una aclaración entre temas', async () => {
    build(true);
    gateway.search.mockResolvedValue([
      prose,
      {
        ...prose,
        chunkId: 'otro-tema',
        documentVersionId: 'otro-v',
        moduleIds: ['module-b'],
        moduleNames: ['Módulo B'],
      },
    ]);

    await expect(
      service.retrieve('cuando se dan los destaques?', null),
    ).resolves.toMatchObject({ kind: 'ambiguous' });
    expect(gateway.datedChunksOfVersions).not.toHaveBeenCalled();
  });
});
