import { Logger } from '@nestjs/common';
import { RagService } from './rag.service';

/**
 * Medición del coste EN MEMORIA del reintento: embeddings, búsqueda y compuertas
 * simulados. No sustituye a la latencia real (embedding + RPC + red), que debe
 * medirse contra el proveedor desplegado; aquí solo se fija que el trabajo
 * añadido dentro del motor no supere el presupuesto de 500 ms en p95.
 */
describe('coste del reintento contextual', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  const vector = () => Array.from({ length: 1536 }, () => 0.01);
  const source = {
    articleReference: null,
    chunkContent:
      'La reasignación docente por emergencia se solicita ante la UGRE de origen con la documentación que acredite el hecho.',
    chunkId: 'retry-source',
    documentId: 'doc',
    documentSituation: 'current' as const,
    documentTitle: 'Resolución Viceministerial de reasignación',
    documentType: 'RESOLUCION_VICEMINISTERIAL',
    documentVersionId: 'version',
    issuanceYear: 2025,
    lexicalScore: 0.5,
    mimeType: 'application/pdf',
    moduleIds: ['module'],
    moduleNames: ['Contratación y desplazamientos'],
    numeralReference: null,
    pageEnd: 2,
    pageStart: 1,
    sectionTitle: 'Del objeto',
    semanticScore: 0.7,
    versionNumber: 1,
  };

  function build(enabled: boolean): RagService {
    const embeddings = {
      embed: jest
        .fn()
        .mockImplementation((queries: string[]) =>
          Promise.resolve(queries.map(() => vector())),
        ),
    };
    const gateway = {
      search: jest
        .fn()
        .mockImplementation(({ query }: { query: string }) =>
          Promise.resolve(
            query.startsWith('reasignación docente') &&
              query.includes('hablame mas')
              ? [source]
              : [],
          ),
        ),
    };
    return new RagService(embeddings, gateway, {
      get: jest.fn((key: string) =>
        key === 'RAG_MATCH_COUNT'
          ? 5
          : key === 'RAG_MATCH_THRESHOLD'
            ? 0.5
            : key === 'RAG_CONTEXTUAL_RETRY_ENABLED'
              ? enabled
              : 0.5,
      ),
    } as never);
  }

  function percentile(values: number[], fraction: number): number {
    const ordered = [...values].sort((a, b) => a - b);
    return ordered[
      Math.min(ordered.length - 1, Math.floor(ordered.length * fraction))
    ];
  }

  it('mantiene el coste añadido por debajo de 500 ms en p95', async () => {
    const samples: Record<'on' | 'off', number[]> = { on: [], off: [] };
    for (const mode of ['off', 'on'] as const) {
      const service = build(mode === 'on');
      for (let index = 0; index < 20; index += 1) {
        const started = process.hrtime.bigint();
        await service.retrieve('hablame mas sobre las situaciones', null, [
          'quiero saber sobre la reasignacion docente por emergencia',
        ]);
        samples[mode].push(Number(process.hrtime.bigint() - started) / 1e6);
      }
    }
    const report = {
      withRetry: {
        p50: percentile(samples.on, 0.5),
        p95: percentile(samples.on, 0.95),
      },
      withoutRetry: {
        p50: percentile(samples.off, 0.5),
        p95: percentile(samples.off, 0.95),
      },
    };
    process.stdout.write(
      `contextual_retry_in_memory_latency_ms=${JSON.stringify(report)}\n`,
    );
    // El criterio es la latencia ADICIONAL: la diferencia de p95 entre correr
    // con y sin reintento, no el tiempo total de la recuperación en memoria.
    expect(report.withRetry.p95 - report.withoutRetry.p95).toBeLessThan(500);
  });
});
