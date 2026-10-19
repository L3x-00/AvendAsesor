import { parseMineruMarkdown } from './mineru-markdown.service';

describe('parseMineruMarkdown', () => {
  it('conserva las páginas físicas y las tablas del Markdown de MinerU', () => {
    const pages = parseMineruMarkdown(
      [
        '<!-- page 1 of 3 -->',
        '# Título',
        '',
        '| Nivel | Remuneración |',
        '| --- | --- |',
        '| Inicial | S/ 3 300,60 |',
        '| Primaria | S/ 3 300,60 |',
        '<!-- page 2 of 3 -->',
        '## Requisitos',
        '',
        '- Título profesional',
        '<!-- page 3 of 3 -->',
        'Texto final. ![sello](images/sello.png)',
      ].join('\n'),
      3,
    );

    expect(pages).toEqual([
      {
        pageNumber: 1,
        text: '# Título\n\n| Nivel | Remuneración |\n| --- | --- |\n| Inicial | S/ 3 300,60 |\n| Primaria | S/ 3 300,60 |',
      },
      {
        pageNumber: 2,
        text: '## Requisitos\n\n- Título profesional',
      },
      { pageNumber: 3, text: 'Texto final. sello' },
    ]);
  });

  it('rechaza un sidecar sin marcadores de página', () => {
    expect(parseMineruMarkdown('# Documento sin páginas\n\nTexto.')).toBeNull();
  });

  it('rechaza un hueco entre páginas o una página vacía', () => {
    expect(
      parseMineruMarkdown(
        '<!-- page 1 of 3 -->\nPrimera.\n<!-- page 3 of 3 -->\nTercera.',
        3,
      ),
    ).toBeNull();
    expect(
      parseMineruMarkdown(
        '<!-- page 1 of 2 -->\nPrimera.\n<!-- page 2 of 2 -->\n\n',
        2,
      ),
    ).toBeNull();
  });

  it('rechaza una conversión parcial que no llega a la última página', () => {
    expect(
      parseMineruMarkdown(
        '<!-- page 1 of 3 -->\nPrimera.\n<!-- page 2 of 3 -->\nSegunda.',
        3,
      ),
    ).toBeNull();
  });

  it('rechaza una página fuera del total verificado del PDF', () => {
    expect(parseMineruMarkdown('<!-- page 4 of 3 -->\nTexto.', 3)).toBeNull();
  });

  it('rechaza contenido binario o corrupto', () => {
    expect(
      parseMineruMarkdown('<!-- page 1 -->\nTexto\u0000binario'),
    ).toBeNull();
    expect(parseMineruMarkdown('<!-- page 1 -->\nTexto\uFFFD')).toBeNull();
  });

  it('devuelve null si no queda texto útil', () => {
    expect(parseMineruMarkdown('<!-- page 1 of 1 -->\n\n')).toBeNull();
  });
});
