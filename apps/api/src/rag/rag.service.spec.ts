import {
  detectRetrievalScope,
  RagService,
  resolveDetectedSubmodule,
} from './rag.service';
import type { RetrievalGateway } from './retrieval.gateway';

function vector(value = 0.1): number[] {
  return Array.from({ length: 1536 }, () => value);
}

const source = {
  articleReference: 'Artículo 1.',
  chunkContent: 'Contenido recuperado.',
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
  let gateway: { search: jest.Mock };
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
    gateway = { search: jest.fn() };
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
        chunkId: 'chunk-b',
        chunkContent: 'Contenido chunk-b.',
        moduleIds: ['module-b'],
        moduleNames: ['Módulo B'],
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

    const embeddingCalls = embeddings.embed.mock.calls as Array<[string[]]>;
    expect(embeddingCalls[0]?.[0]).toHaveLength(1);
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

  it('keeps the context in the module search for a self-contained follow-up', async () => {
    gateway.search.mockResolvedValue([source]);

    await service.retrieve('¿y para una permuta?', 'module-a', [
      'requisitos para una reasignación',
    ]);

    const searchCalls = gateway.search.mock.calls as Array<
      [Parameters<RetrievalGateway['search']>[0]]
    >;
    expect(searchCalls[0]?.[0].query).toBe('¿y para una permuta?');
    expect(searchCalls[1]?.[0].query).toContain(
      'requisitos para una reasignación',
    );
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
    const main = [0.665, 0.665, 0.595].map((semanticScore, index) => ({
      ...source,
      chunkContent: `Destitución ${index}.`,
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
      sources: main,
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
      { ...source, chunkContent: 'Otro contenido.', chunkId: 'other' },
    ]);

    const result = await service.retrieve('Consulta', null);
    if (result.kind !== 'evidence') throw new Error('Expected evidence.');
    expect(result.sources.map((item) => item.chunkId)).toEqual([
      'chunk-id',
      'other',
    ]);
  });

  it('drops a legacy chunk contained in a better one of the same version, not of another', async () => {
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

  it('keeps only the sources within the relevance band of the best one, capped at the match count', async () => {
    const scores = [0.8, 0.78, 0.76, 0.74, 0.72, 0.7, 0.6];
    gateway.search.mockResolvedValue(
      scores.map((semanticScore, index) => ({
        ...source,
        chunkContent: `Fragmento ${index}.`,
        chunkId: `band-${index}`,
        semanticScore,
      })),
    );

    const result = await service.retrieve('Consulta', null);
    if (result.kind !== 'evidence') throw new Error('Expected evidence.');
    expect(result.sources.map((item) => item.semanticScore)).toEqual([
      0.8, 0.78, 0.76, 0.74, 0.72,
    ]);
  });

  it('adds global evidence of a sibling subtopic inside the selected module', async () => {
    const reasignacion = {
      ...source,
      chunkContent: 'Reasignación.',
      chunkId: 'r',
      semanticScore: 0.7,
    };
    const permuta = {
      ...source,
      chunkContent: 'Permuta.',
      chunkId: 'p',
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
      chunkContent: 'Contenido chunk-b.',
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
      chunkId: 'chunk-b',
      chunkContent: 'Contenido chunk-b.',
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

  it('caps competing clarification evidence at ten while retaining both modules', async () => {
    const globalSources = Array.from({ length: 10 }, (_value, index) => ({
      ...source,
      chunkId: `global-${index}`,
      chunkContent: `Contenido global-${index}.`,
      moduleIds: ['module-b'],
      moduleNames: ['Módulo B'],
      semanticScore: 0.95 - index / 1_000,
    }));
    const selectedSources = Array.from({ length: 10 }, (_value, index) => ({
      ...source,
      chunkId: `selected-${index}`,
      chunkContent: `Contenido selected-${index}.`,
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
        chunkId: 'chunk-b',
        chunkContent: 'Contenido chunk-b.',
        moduleIds: ['module-b'],
        moduleNames: ['Módulo B'],
      },
      {
        ...source,
        chunkId: 'chunk-c',
        chunkContent: 'Contenido chunk-c.',
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

      expect(gateway.search).toHaveBeenCalledTimes(2);
      expect(gateway.search).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ retrievalScope }),
      );
      expect(gateway.search).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ retrievalScope }),
      );
    },
  );

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
