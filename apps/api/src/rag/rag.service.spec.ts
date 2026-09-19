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
        matchCount: 5,
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

  it('keeps the prior topic on a module-free follow-up (global uses context)', async () => {
    gateway.search.mockResolvedValue([source]);

    await expect(
      service.retrieve('¿Y cuál es el plazo?', null, [
        'Necesito una reasignación por unidad familiar.',
      ]),
    ).resolves.toMatchObject({ kind: 'evidence', sources: [source] });

    const embeddingCalls = embeddings.embed.mock.calls as Array<[string[]]>;
    const embeddedQueries = embeddingCalls[0]?.[0];
    expect(embeddedQueries?.[0]).toBe('¿Y cuál es el plazo?');
    expect(embeddedQueries?.[1]).toContain(
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
    expect(globalSearch?.query).toContain(
      'Necesito una reasignación por unidad familiar.',
    );
    // La global usa el embedding contextual (segunda consulta), no el escueto.
    expect(globalSearch?.embedding[0]).toBeCloseTo(0.11);
  });

  it('uses the contextual query for selected-module follow-up retrieval', async () => {
    gateway.search.mockImplementation(
      (input: { selectedModuleId: string | null }) =>
        Promise.resolve(input.selectedModuleId ? [source] : []),
    );

    await expect(
      service.retrieve('¿Y cuál es el plazo?', 'module-a', [
        'Necesito una licencia por salud.',
      ]),
    ).resolves.toMatchObject({ kind: 'evidence', sources: [source] });
    const embeddingCalls = embeddings.embed.mock.calls as Array<[string[]]>;
    const embeddedQueries = embeddingCalls[0]?.[0];
    expect(embeddedQueries?.[0]).toBe('¿Y cuál es el plazo?');
    expect(embeddedQueries?.[1]).toContain('Necesito una licencia por salud.');
    expect(gateway.search).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        query: '¿Y cuál es el plazo?',
        selectedModuleId: null,
      }),
    );
    const searchCalls = gateway.search.mock.calls as Array<
      [Parameters<RetrievalGateway['search']>[0]]
    >;
    const selectedSearch = searchCalls[1]?.[0];
    expect(selectedSearch?.query).toContain(
      'Pregunta actual: ¿Y cuál es el plazo?',
    );
    expect(selectedSearch?.selectedModuleId).toBe('module-a');
  });

  it('detects a clear topic switch without mixing the former module sources', async () => {
    const switchedSource = {
      ...source,
      chunkId: 'chunk-b',
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
      moduleIds: ['module-b'],
      moduleNames: ['Módulo B'],
      semanticScore: 0.95 - index / 1_000,
    }));
    const selectedSources = Array.from({ length: 10 }, (_value, index) => ({
      ...source,
      chunkId: `selected-${index}`,
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
        moduleIds: ['module-b'],
        moduleNames: ['Módulo B'],
      },
      {
        ...source,
        chunkId: 'chunk-c',
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
