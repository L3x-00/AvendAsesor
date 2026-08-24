import { ChunkingService } from './chunking.service';

describe('ChunkingService', () => {
  const service = new ChunkingService();

  it('creates bounded chunks with page and legal structure metadata', () => {
    const chunks = service.chunk([
      {
        pageNumber: 1,
        text: `Artículo 1. Objeto de la norma. ${'contenido normativo '.repeat(900)}`,
      },
      {
        pageNumber: 2,
        text: `2.1. Alcance. ${'contenido adicional '.repeat(500)}`,
      },
    ]);

    expect(chunks.length).toBeGreaterThan(2);
    expect(
      chunks.some((chunk) => chunk.articleReference?.startsWith('Artículo 1')),
    ).toBe(true);
    expect(chunks.some((chunk) => chunk.numeralReference === '2.1')).toBe(true);
    expect(chunks.every((chunk) => chunk.tokenCount <= 800)).toBe(true);
    expect(chunks.map((chunk) => chunk.chunkIndex)).toEqual(
      chunks.map((_, index) => index),
    );
    expect(chunks.some((chunk) => chunk.pageStart === 2)).toBe(true);
  });

  it('removes null bytes and skips empty page fragments', () => {
    const chunks = service.chunk([
      { pageNumber: 3, text: '\u0000\n\n   Texto válido de la página.\n\n' },
      { pageNumber: 4, text: '   ' },
    ]);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      chunkContent: 'Texto válido de la página.',
      pageEnd: 3,
      pageStart: 3,
    });
  });

  it('flushes normal-sized structural units before they exceed the token limit', () => {
    const chunks = service.chunk([
      {
        pageNumber: 5,
        text: `${'primer bloque normativo '.repeat(200)}\n\n${'segundo bloque normativo '.repeat(200)}`,
      },
    ]);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].tokenCount).toBeLessThanOrEqual(800);
    expect(chunks[1].tokenCount).toBeLessThanOrEqual(800);
  });
});
