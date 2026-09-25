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
        text: Array.from({ length: 6 }, (_, block) =>
          Array.from({ length: 300 }, (_, index) => `b${block}w${index}`).join(
            ' ',
          ),
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

describe('ChunkingService — revisión de ingesta (2026-09-24)', () => {
  const service = new ChunkingService();
  const words = (prefix: string, count: number) =>
    Array.from({ length: count }, (_, index) => `${prefix}w${index}`).join(' ');

  it('respects the token limit counting separators (tables with many short cells)', () => {
    const cells = ['1', 'Requisito 1', '5 días', 'Sí'];
    const table = Array.from(
      { length: 600 },
      (_, index) => cells[index % cells.length],
    ).join('\n\n');
    const chunks = service.chunk([
      { pageNumber: 1, text: table },
      {
        pageNumber: 2,
        text: `${words('a', 450)}\n\nArtículo 3. Título breve.\n\n${words('b', 560)}`,
      },
    ]);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks)
      expect(chunk.tokenCount).toBeLessThanOrEqual(800);
  });

  it('chunks a long table-like document in linear time', () => {
    const page = Array.from(
      { length: 120 },
      (_, index) => `Celda ${index} del anexo`,
    ).join('\n\n');
    const pages = Array.from({ length: 40 }, (_, index) => ({
      pageNumber: index + 1,
      text: page,
    }));

    const started = performance.now();
    const chunks = service.chunk(pages);
    // Antes: recodificaba todo lo pendiente por cada celda (≈0,7 s por página).
    expect(performance.now() - started).toBeLessThan(5_000);
    expect(chunks.length).toBeGreaterThan(5);
  });

  it('bounds long runs without spaces before encoding', () => {
    const started = performance.now();
    const chunks = service.chunk([
      {
        pageNumber: 1,
        text: `Índice ${'.'.repeat(20_000)} 5\n\n${'a'.repeat(12_000)}`,
      },
    ]);
    expect(performance.now() - started).toBeLessThan(5_000);
    expect(chunks[0].chunkContent).toContain('Índice ... 5');
    for (const chunk of chunks)
      expect(chunk.tokenCount).toBeLessThanOrEqual(800);
  });

  const encoding = getEncoding('o200k_base');
  /** Texto de `count` tokens como mínimo, con palabras únicas marcadas. */
  const tokensOf = (prefix: string, count: number) => {
    const parts: string[] = [];
    while (encoding.encode(parts.join(' ')).length < count) {
      parts.push(`${prefix}w${parts.length}`);
    }
    return parts.join(' ');
  };

  it('labels every chunk with the pages its text really comes from', () => {
    const sizes = [700, 40, 500, 60, 90, 700, 30, 820, 40, 1_300, 15, 600];
    const pages = sizes.map((size, index) => ({
      pageNumber: index + 1,
      text: tokensOf(`p${index + 1}x`, size),
    }));
    const chunks = service.chunk(pages);

    expect(chunks.length).toBeGreaterThan(4);
    for (const chunk of chunks) {
      for (const match of chunk.chunkContent.matchAll(/\bp(\d+)x/gu)) {
        const page = Number(match[1]);
        expect(page).toBeGreaterThanOrEqual(chunk.pageStart);
        expect(page).toBeLessThanOrEqual(chunk.pageEnd);
      }
    }
  });

  it('opens the overlap at the page where its text starts', () => {
    const chunks = service.chunk([
      {
        pageNumber: 1,
        text: `${tokensOf('uno', 690)} El plazo de reclamo es de quince días hábiles.`,
      },
      {
        pageNumber: 2,
        text: `Artículo 9. Requisitos del trámite.\n\n${tokensOf('dos', 500)}`,
      },
    ]);
    const withSentence = chunks.filter((chunk) =>
      chunk.chunkContent.includes('quince días hábiles'),
    );
    expect(withSentence.length).toBeGreaterThan(0);
    for (const chunk of withSentence) expect(chunk.pageStart).toBe(1);
  });

  it('never leaves broken multi-token characters at window edges', () => {
    const form = Array.from(
      { length: 400 },
      (_, index) => `☐ Sí ☐ No 📌 ítem ${index}`,
    ).join(' ');
    const chunks = service.chunk([{ pageNumber: 1, text: form }]);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.chunkContent).not.toContain('�');
    }
  });

  it('keeps an article heading with its long body instead of the previous chunk', () => {
    const chunks = service.chunk([
      {
        pageNumber: 1,
        text: [
          'Artículo 13. Plazos.',
          words('trece', 300),
          'Artículo 14. Requisitos para la reasignación.',
          words('catorce', 1_500),
        ].join('\n\n'),
      },
    ]);

    const article13 = chunks.filter((chunk) =>
      chunk.chunkContent.includes('trecew1 '),
    );
    expect(article13).toHaveLength(1);
    expect(article13[0].chunkContent).not.toContain('Artículo 14');
    expect(article13[0].articleReference).toBe('Artículo 13.');

    const article14 = chunks.filter((chunk) =>
      /catorcew\d/u.test(chunk.chunkContent),
    );
    expect(article14.length).toBeGreaterThan(1);
    for (const chunk of article14) {
      expect(chunk.chunkContent.startsWith('Artículo 14.')).toBe(true);
      expect(chunk.articleReference).toBe('Artículo 14.');
      expect(chunk.tokenCount).toBeLessThanOrEqual(800);
    }
  });
});
