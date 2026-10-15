import type { RetrievedChunk } from './retrieval.gateway';
import {
  orderSourcesForDelivery,
  splitDeliverySources,
} from './temporal-precedence';

function chunk(overrides: Partial<RetrievedChunk> = {}): RetrievedChunk {
  return {
    articleReference: null,
    chunkContent: 'Contenido.',
    chunkId: 'chunk-1',
    documentId: 'document-1',
    documentSituation: 'current',
    documentTitle: 'Norma interna',
    documentVersionId: 'version-1',
    issuanceYear: 2025,
    lexicalScore: 0.3,
    moduleIds: ['module-a'],
    moduleNames: ['Módulo A'],
    numeralReference: null,
    pageEnd: 1,
    pageStart: 1,
    sectionTitle: null,
    semanticScore: 0.7,
    versionNumber: 1,
    ...overrides,
  };
}

describe('orderSourcesForDelivery', () => {
  // CR-03: la situación documental pesa más que el año. Un documento
  // reemplazado no vuelve a ser actual por ser más reciente.
  it('coloca lo vigente antes que lo reemplazado aunque el reemplazado sea más reciente', () => {
    const ordered = orderSourcesForDelivery([
      chunk({
        chunkId: 'reemplazado',
        documentSituation: 'replaced',
        issuanceYear: 2026,
      }),
      chunk({
        chunkId: 'vigente',
        documentSituation: 'current',
        issuanceYear: 2019,
      }),
      chunk({
        chunkId: 'archivado',
        documentSituation: 'archived',
        issuanceYear: 2027,
      }),
    ]);

    expect(ordered.map((source) => source.chunkId)).toEqual([
      'vigente',
      'reemplazado',
      'archivado',
    ]);
  });

  // Requisito 6: una comparación histórica se ordena de lo más reciente a lo
  // más antiguo.
  it('ordena la comparación histórica de lo más reciente a lo más antiguo', () => {
    const ordered = orderSourcesForDelivery([
      chunk({ chunkId: '2017', issuanceYear: 2017, documentVersionId: 'v-3' }),
      chunk({ chunkId: '2025', issuanceYear: 2025, documentVersionId: 'v-1' }),
      chunk({ chunkId: '2022', issuanceYear: 2022, documentVersionId: 'v-2' }),
    ]);

    expect(ordered.map((source) => source.chunkId)).toEqual([
      '2025',
      '2022',
      '2017',
    ]);
  });

  it('conserva el orden de recuperación ante un empate real', () => {
    const sources = [
      chunk({ chunkId: 'b', documentVersionId: 'v-2' }),
      chunk({ chunkId: 'a', documentVersionId: 'v-1' }),
      chunk({
        chunkId: 'c',
        documentVersionId: 'v-1',
        pageStart: 4,
        pageEnd: 4,
      }),
    ];

    // La recuperación ya entrega un orden total; ante un empate no se reordena.
    expect(
      orderSourcesForDelivery(sources).map((source) => source.chunkId),
    ).toEqual(['b', 'a', 'c']);
    expect(
      orderSourcesForDelivery(sources).map((source) => source.chunkId),
    ).toEqual(
      orderSourcesForDelivery([...sources]).map((source) => source.chunkId),
    );
  });

  it('respeta la aplicabilidad al concepto antes que el año', () => {
    const ordered = orderSourcesForDelivery(
      [
        chunk({ chunkId: 'especial', issuanceYear: 2025 }),
        chunk({ chunkId: 'aplicable', issuanceYear: 2022 }),
      ],
      {
        applicability: (source) => (source.chunkId === 'aplicable' ? 0 : 2),
      },
    );

    expect(ordered.map((source) => source.chunkId)).toEqual([
      'aplicable',
      'especial',
    ]);
  });

  it('separa el material vigente de los antecedentes', () => {
    const separated = splitDeliverySources([
      chunk({ chunkId: 'vigente' }),
      chunk({ chunkId: 'reemplazado', documentSituation: 'replaced' }),
    ]);

    expect(separated.current.map((source) => source.chunkId)).toEqual([
      'vigente',
    ]);
    expect(separated.historical.map((source) => source.chunkId)).toEqual([
      'reemplazado',
    ]);
  });
});
