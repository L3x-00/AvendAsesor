import { ChunkingService } from './chunking.service';
import { getEncoding } from 'js-tiktoken';

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

  it('never emits the same chunk twice after splitting a long paragraph', () => {
    // Regresión (datos reales de producción): el último tramo de un párrafo
    // largo se arrastraba entero como solapamiento y volvía a emitirse idéntico.
    const longParagraph = Array.from(
      { length: 1_300 },
      (_, index) => `palabra${index}`,
    ).join(' ');
    const chunks = service.chunk([
      { pageNumber: 1, text: `${longParagraph}\n\nCierre breve de la página.` },
      {
        pageNumber: 2,
        text: Array.from({ length: 700 }, (_, index) => `pag2w${index}`).join(
          ' ',
        ),
      },
    ]);

    const contents = chunks.map((chunk) => chunk.chunkContent);
    expect(new Set(contents).size).toBe(contents.length);
    expect(chunks.every((chunk) => chunk.tokenCount <= 800)).toBe(true);
    // Ningún chunk queda contenido íntegro dentro del siguiente.
    for (let index = 1; index < contents.length; index += 1) {
      expect(contents[index]).not.toContain(contents[index - 1]);
    }
  });

  it('keeps the overlap between consecutive chunks bounded', () => {
    const chunks = service.chunk([
      {
        pageNumber: 1,
        text: Array.from(
          { length: 6 },
          (_, block) =>
            Array.from(
              { length: 300 },
              (_, index) => `b${block}w${index}`,
            ).join(' '),
        ).join('\n\n'),
      },
    ]);

    expect(chunks.length).toBeGreaterThan(1);
    for (let index = 1; index < chunks.length; index += 1) {
      const previous = chunks[index - 1].chunkContent.split(/\s+/u);
      const current = chunks[index].chunkContent.split(/\s+/u);
      const shared = current.filter((word) => previous.includes(word)).length;
      // ~100 tokens de solapamiento como máximo, nunca un bloque entero.
      expect(shared).toBeLessThan(120);
    }
  });

  it('does not emit a window already contained in the previous one', () => {
    const encoding = getEncoding('o200k_base');
    // Tamaños que antes dejaban una última ventana contenida en la anterior.
    for (const length of [801, 1_450, 1_500, 2_200]) {
      let text = '';
      for (let index = 0; encoding.encode(text).length < length; index += 1) {
        text += `t${index} `;
      }
      const chunks = service.chunk([{ pageNumber: 1, text }]);
      for (let index = 1; index < chunks.length; index += 1) {
        expect(chunks[index - 1].chunkContent).not.toContain(
          chunks[index].chunkContent,
        );
      }
      // Todo el texto queda cubierto: la última palabra está en el último chunk.
      const lastWord = text.trim().split(' ').at(-1)!;
      expect(chunks.at(-1)!.chunkContent).toContain(lastWord);
    }
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
