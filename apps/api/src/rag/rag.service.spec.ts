import { RagService } from './rag.service';

function vector(): number[] {
  return Array.from({ length: 1536 }, () => 0.1);
}

const source = {
  articleReference: 'Artículo 1.',
  chunkContent: 'Contenido recuperado.',
  chunkId: 'chunk-id',
  documentId: 'document-id',
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
    embeddings = { embed: jest.fn().mockResolvedValue([vector()]) };
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

  it('enforces an explicit module filter in hybrid retrieval', async () => {
    gateway.search.mockResolvedValue([source]);
    await expect(service.retrieve('Consulta', 'module-a')).resolves.toEqual({
      kind: 'evidence',
      sources: [source],
      topRelevanceScore: 0.9,
    });
    expect(gateway.search).toHaveBeenCalledWith(
      expect.objectContaining({
        matchCount: 5,
        matchThreshold: 0.7,
        selectedModuleId: 'module-a',
      }),
    );
  });

  it('requests clarification when unfiltered evidence spans modules', async () => {
    gateway.search.mockResolvedValue([
      source,
      { ...source, moduleIds: ['module-b'], moduleNames: ['Módulo B'] },
    ]);
    await expect(service.retrieve('Consulta', null)).resolves.toEqual({
      kind: 'ambiguous',
      modules: [
        { id: 'module-a', name: 'Módulo A' },
        { id: 'module-b', name: 'Módulo B' },
      ],
      topRelevanceScore: 0.9,
    });
  });

  it('keeps retrieval answerable when all chunks share one module', async () => {
    gateway.search.mockResolvedValue([
      {
        ...source,
        moduleIds: ['module-a', 'module-b'],
        moduleNames: ['Módulo A', 'Módulo B'],
      },
      { ...source, moduleIds: ['module-b'], moduleNames: ['Módulo B'] },
    ]);

    await expect(service.retrieve('Consulta', null)).resolves.toMatchObject({
      kind: 'evidence',
      topRelevanceScore: 0.9,
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
