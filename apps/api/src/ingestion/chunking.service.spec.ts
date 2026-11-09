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

  it('captures a numeral and literal as a precise subreference', () => {
    const chunks = service.chunk([
      {
        pageNumber: 14,
        text: 'Sección III. Requisitos\n\n2.1. Condiciones\n\nLiteral a) Haber prestado servicios en el nivel inicial.',
      },
    ]);

    const literal = chunks.find(
      (chunk) => chunk.numeralReference === '2.1 · Literal a)',
    );
    expect(literal).toMatchObject({
      numeralReference: '2.1 · Literal a)',
      pageEnd: 14,
      pageStart: 14,
    });
    expect(literal?.sectionTitle).toMatch(/^Sección III/u);
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

  it('no presenta una pregunta descriptiva como título estructural', () => {
    const chunks = service.chunk([
      {
        pageNumber: 1,
        text: `${tokensOf('previo', 790)} Cierre del primer bloque.`,
      },
      {
        pageNumber: 2,
        text: '¿Cuáles son los requisitos para postular?\n\nLos postulantes presentan su expediente completo.',
      },
    ]);
    const target = chunks.at(-1);

    expect(target?.chunkContent).toContain('¿Cuáles son los requisitos');
    expect(target?.sectionTitle).toBeUndefined();
  });

  it('no inventa un título para las ventanas de un párrafo largo', () => {
    const chunks = service.chunk([
      {
        pageNumber: 1,
        text: `¿Qué documentos se presentan? ${words('cuerpo', 1_300)}`,
      },
    ]);
    const windows = chunks.filter((chunk) =>
      /cuerpow\d/u.test(chunk.chunkContent),
    );

    expect(windows.length).toBeGreaterThan(1);
    for (const chunk of windows) {
      expect(chunk.sectionTitle).toBeUndefined();
    }
  });

  it('no deriva del corte cuando el párrafo largo no tiene sustento propio', () => {
    const chunks = service.chunk([
      { pageNumber: 1, text: `No. ${words('cuerpo', 1_300)}` },
    ]);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.sectionTitle).toBeUndefined();
    }
  });

  it('no convierte una oración normativa en título de sección', () => {
    const chunks = service.chunk([
      {
        pageNumber: 1,
        text: 'Art. 5. La presente norma entra en vigencia al día siguiente de su publicación.',
      },
    ]);

    expect(chunks[0].sectionTitle).toBeUndefined();
    expect(chunks[0].articleReference).toBeUndefined();
  });

  it.each([
    'Artículo 3.- Modifíquese el artículo 2.',
    'Artículo 4.- Apruébase el reglamento adjunto.',
    'Artículo 5.- Dispóngase su publicación inmediata.',
    'Artículo 6.- La remuneración mensual es de S/ 2 666.',
    'Artículo 7.- El profesor percibe S/ 3 000.',
    'Artículo 8.- La asignación corresponde al cargo docente.',
  ])('no convierte la disposición «%s» en subtítulo', (text) => {
    const [chunk] = service.chunk([{ pageNumber: 1, text }]);

    expect(chunk.articleReference).toMatch(/^Artículo/u);
    expect(chunk.sectionTitle).toBeUndefined();
  });

  it('no convierte sellos ni contenido corrido en título de sección', () => {
    const [chunk] = service.chunk([
      {
        pageNumber: 2,
        text: [
          'Documento electrónico firmado digitalmente en el marco de la Ley N° 27269.',
          'La integridad del documento y la autoría de las firmas pueden verificarse en el validador.',
          'La evaluación del expediente considera la formación académica y la experiencia laboral.',
        ].join(' '),
      },
    ]);

    expect(chunk.sectionTitle).toBeUndefined();
  });

  it('no usa una oración posterior a un corte como ubicación estructural', () => {
    const [chunk] = service.chunk([
      {
        pageNumber: 4,
        text: 'puntos. La experiencia laboral se acredita por cada mes de trabajo realizado. ¿Qué pasa si el postulante no está de acuerdo?',
      },
    ]);

    expect(chunk.sectionTitle).toBeUndefined();
  });

  it('no toma números mencionados dentro del texto como numeral de la norma', () => {
    const [chunk] = service.chunk([
      {
        pageNumber: 1,
        text: 'Puntaje 0.25 por formación académica y 2.4 de la norma técnica.',
      },
    ]);

    expect(chunk.numeralReference).toBeUndefined();
  });

  it('no atribuye texto previo al artículo que aparece después en el documento', () => {
    const chunks = service.chunk([
      {
        pageNumber: 1,
        text: [
          'El docente coordinador de ONDEC percibe la asignación indicada para su cargo.',
          'Artículo 3.- Implementación de la medida por las entidades responsables.',
        ].join('\n\n'),
      },
    ]);

    const ondec = chunks.find((chunk) => chunk.chunkContent.includes('ONDEC'));
    const article = chunks.find((chunk) =>
      chunk.chunkContent.startsWith('Artículo 3.-'),
    );

    expect(ondec?.articleReference).toBeUndefined();
    expect(ondec?.sectionTitle).toBeUndefined();
    expect(article?.articleReference).toBe('Artículo 3.-');
  });

  it('propaga un encabezado estructural real sin usar frases vecinas', () => {
    const [chunk] = service.chunk([
      {
        pageNumber: 7,
        text: [
          'CAPÍTULO II',
          'Condiciones aplicables a la jornada laboral del personal docente.',
        ].join('\n\n'),
      },
    ]);

    expect(chunk.sectionTitle).toBe('CAPÍTULO II');
    expect(chunk.articleReference).toBeUndefined();
  });

  it('no confunde cabeceras editoriales ni siglas aisladas con secciones', () => {
    const [chunk] = service.chunk([
      {
        pageNumber: 1,
        text: [
          'NORMAS LEGALES',
          'ONDEC',
          'La asignación corresponde a los cargos descritos en la norma.',
        ].join('\n\n'),
      },
    ]);

    expect(chunk.sectionTitle).toBeUndefined();
  });

  it('no confunde un importe en mayúsculas con un subtítulo', () => {
    const [chunk] = service.chunk([
      {
        pageNumber: 1,
        text: [
          'DOS MIL SEISCIENTOS SESENTA Y SEIS SOLES',
          'La remuneración corresponde al supuesto descrito por la norma.',
        ].join('\n\n'),
      },
    ]);

    expect(chunk.sectionTitle).toBeUndefined();
  });

  it('separa el primer literal del texto general del artículo', () => {
    const chunks = service.chunk([
      {
        pageNumber: 3,
        text: [
          'Artículo 3. Requisitos para la asignación',
          'La asignación se entrega al personal que cumple estas condiciones.',
          'a) Acreditar vínculo laboral vigente.',
        ].join('\n\n'),
      },
    ]);

    const general = chunks.find((chunk) =>
      chunk.chunkContent.includes('se entrega al personal'),
    );
    const literal = chunks.find((chunk) =>
      chunk.chunkContent.startsWith('a) Acreditar'),
    );
    expect(general?.numeralReference).toBeUndefined();
    expect(general?.chunkContent).not.toContain('a) Acreditar');
    expect(literal).toMatchObject({
      articleReference: 'Artículo 3.',
      numeralReference: 'Literal a)',
      sectionTitle: 'Requisitos para la asignación',
    });
  });

  it('conserva artículos y numerales de un PDF con saltos simples de línea', () => {
    const chunks = service.chunk([
      {
        pageNumber: 10,
        text: [
          'El texto anterior termina aquí.',
          'Artículo 41. Derechos',
          'Los profesores tienen derecho a la estabilidad',
          'con sujeción a las condiciones establecidas en la ley.',
        ].join('\n'),
      },
      {
        pageNumber: 12,
        text: [
          'Nota de la edición oficial.',
          '“Artículo 49. Destitución',
          '49.5. La destitución es impuesta por el titular',
          'de la UGEL, DRE o MINEDU, según corresponda.',
          '49.6. Procede la destitución de oficio en los supuestos previstos.',
          '',
          'El texto menciona como referencia el',
          'Artículo 41. Derechos de los profesores',
          'y continúa con la disposición.',
          '(*) Nota editorial sobre la publicación.',
        ].join('\n'),
      },
      {
        pageNumber: 42,
        text: [
          'Nota del Reglamento publicada el 10 de julio de 2015.',
          'Artículo 83.- Destitución',
          '83.1. La destitución termina la carrera magisterial.',
          '83.2. La sanción se oficializa por resolución,',
          'previo proceso administrativo disciplinario.',
        ].join('\n'),
      },
    ]);

    expect(
      chunks.find((chunk) => chunk.chunkContent.includes('estabilidad')),
    ).toMatchObject({ articleReference: 'Artículo 41.', pageStart: 10 });
    expect(
      chunks.find((chunk) => chunk.chunkContent.includes('según corresponda')),
    ).toMatchObject({
      articleReference: 'Artículo 49.',
      numeralReference: '49.5',
      pageStart: 12,
    });
    expect(
      chunks.find((chunk) => chunk.chunkContent.includes('de oficio')),
    ).toMatchObject({
      articleReference: 'Artículo 49.',
      numeralReference: '49.6',
      pageStart: 12,
    });
    expect(
      chunks.find((chunk) => chunk.chunkContent.includes('previo proceso')),
    ).toMatchObject({
      articleReference: 'Artículo 83.-',
      numeralReference: '83.2',
      pageStart: 42,
    });
    expect(
      chunks.filter((chunk) => chunk.articleReference === 'Artículo 41.'),
    ).toHaveLength(1);
    const note = chunks.find((chunk) =>
      chunk.chunkContent.includes('Nota editorial'),
    );
    expect(note).toBeDefined();
    expect(note?.articleReference).toBeUndefined();
    expect(note?.numeralReference).toBeUndefined();
    const crossReference = chunks.find((chunk) =>
      chunk.chunkContent.includes('El texto menciona como referencia el'),
    );
    expect(crossReference?.chunkContent).toContain('Artículo 41. Derechos');
    expect(crossReference?.articleReference).toBeUndefined();
  });

  it.each(['SUB CAPÍTULO II', 'Subcapítulo III', 'SECCIÓN IV'])(
    'separa los artículos que rodean %s aunque el epígrafe abarque varias líneas',
    (section) => {
      const chunks = service.chunk([
        {
          pageNumber: 24,
          text: [
            'Artículo 9.- Formación',
            '9.2. Se evalúan las metas de acreditación.',
            section,
            'DE LA FORMACIÓN Y',
            'LOS REQUISITOS DOCENTES',
            '“Artículo 10. Finalidad de la formación',
            'inicial de los docentes',
            'La formación inicial prepara para la docencia.',
          ].join('\n'),
        },
      ]);

      const oldRule = chunks.find((chunk) =>
        chunk.chunkContent.includes('metas de acreditación'),
      );
      const nextRule = chunks.find((chunk) =>
        chunk.chunkContent.includes('prepara para la docencia'),
      );
      expect(oldRule).toMatchObject({
        articleReference: 'Artículo 9.-',
        numeralReference: '9.2',
      });
      expect(oldRule?.chunkContent).not.toContain('Artículo 10');
      expect(nextRule).toMatchObject({
        articleReference: 'Artículo 10.',
        pageStart: 24,
      });
      expect(nextRule?.numeralReference).toBeUndefined();
      expect(chunks.map((chunk) => chunk.chunkContent).join(' ')).toContain(
        'LOS REQUISITOS DOCENTES',
      );
    },
  );

  it.each(['. Artículo 5.-', '; Artículo 5.-', '; Art. 5.-'])(
    'omite la ubicación ambigua en un párrafo aplanado con separador %j',
    (separator) => {
      const mixed = `Artículo 4. La solicitud lleva firma${separator} La autoridad valida la firma.`;
      const [chunk] = service.chunk([{ pageNumber: 9, text: mixed }]);

      expect(chunk).toMatchObject({
        chunkContent: mixed,
        pageStart: 9,
        pageEnd: 9,
      });
      expect(chunk.articleReference).toBeUndefined();
      expect(chunk.numeralReference).toBeUndefined();
    },
  );

  it.each([
    ['Artículo 8.º Obligaciones', 'Artículo 8.º'],
    ['Artículo VIII. Obligaciones', 'Artículo VIII.'],
    ['“Artículo 8.- obligaciones', 'Artículo 8.-'],
    ['Art. 8. Obligaciones', undefined],
  ])('cierra la ubicación previa ante el rótulo %j', (label, reference) => {
    const chunks = service.chunk([
      {
        pageNumber: 9,
        text: `Artículo 7. Beneficios\n7.2. Se reconoce la asignación.\n${label}\nEl titular responde por la ejecución.`,
      },
    ]);
    const next = chunks.find((chunk) =>
      chunk.chunkContent.includes('responde por la ejecución'),
    );
    expect(next?.chunkContent).toContain(label);
    expect(next?.articleReference).toBe(reference);
    expect(next?.numeralReference).toBeUndefined();
  });

  it.each([
    'Decreto Supremo Nº 019-2025-MINEDU',
    'DECRETO SUPREMO 004-2013-ED',
    'DECRETO SUPREMO\nN° 004-2013-ED',
  ])('cierra el artículo previo al comenzar el instrumento %j', (header) => {
    const chunks = service.chunk([
      {
        pageNumber: 1,
        text: 'Artículo 7. Beneficios\n\n7.2. Se reconoce la asignación.',
      },
      {
        pageNumber: 2,
        text: `${header}\nEL PRESIDENTE DE LA REPÚBLICA\nCONSIDERANDO:\nQue corresponde aprobar el reglamento.`,
      },
    ]);

    expect(chunks[0]).toMatchObject({
      articleReference: 'Artículo 7.',
      numeralReference: '7.2',
      pageEnd: 1,
    });
    const decree = chunks.find((chunk) =>
      chunk.chunkContent.includes('aprobar el reglamento'),
    );
    expect(decree).toMatchObject({ pageStart: 2, pageEnd: 2 });
    expect(decree?.articleReference).toBeUndefined();
    expect(decree?.numeralReference).toBeUndefined();
  });

  it('no convierte una cita al inicio de un párrafo en la referencia del fragmento', () => {
    const text =
      'Artículo 25 de la Ley del Servicio Civil se menciona como referencia.';
    const [chunk] = service.chunk([{ pageNumber: 6, text }]);

    expect(chunk.chunkContent).toBe(text);
    expect(chunk.articleReference).toBeUndefined();
  });

  it.each([' por\n', '. '])(
    'omite el numeral ambiguo ante un separador %j',
    (join) => {
      const chunks = service.chunk([
        {
          pageNumber: 8,
          text: `Artículo 7. Beneficios\n7.2. El profesor tiene derecho a la licencia${join}7.3. La prohibición se aplica en todo caso.`,
        },
      ]);
      const chunk = chunks.find((item) =>
        item.chunkContent.includes('El profesor tiene derecho a la licencia'),
      );

      expect(chunk).toMatchObject({
        articleReference: 'Artículo 7.',
        pageStart: 8,
      });
      expect(chunk?.chunkContent).toContain('7.3. La prohibición se aplica');
      expect(chunk?.numeralReference).toBeUndefined();
    },
  );

  it('conserva el contenido sin combinar un artículo con un numeral de otra serie', () => {
    const chunks = service.chunk([
      {
        pageNumber: 3,
        text: 'Artículo 7. Beneficios\n\n7.2. Se reconoce la asignación.\n\n8.2. La excepción se aplica en otro ámbito.',
      },
    ]);

    const exception = chunks.find((chunk) =>
      chunk.chunkContent.includes('otro ámbito'),
    );
    expect(exception).toMatchObject({ pageStart: 3 });
    expect(exception?.articleReference).toBeUndefined();
    expect(exception?.numeralReference).toBe('8.2');
  });

  it('no traslada el artículo inferido a otro capítulo o a una página sin anclaje', () => {
    const chunks = service.chunk([
      {
        pageNumber: 19,
        text: [
          'Artículo 79. Alcance',
          '79.1. Se conserva el ámbito.',
          'Artículo 79-A. Modalidades',
          'El desarrollo se organiza en cuatro modalidades.',
          'CAPÍTULO X',
          'TÉRMINO DE LA CARRERA',
          '79.5. Cláusula de otra sección.',
          'Artículo 80. Sanciones',
          'La ley prescribe las sanciones.',
        ].join('\n'),
      },
      {
        pageNumber: 20,
        text: 'DECRETO SUPREMO 004-2013-ED\nConsiderandos del reglamento.',
      },
    ]);

    const otherSection = chunks.find((chunk) =>
      chunk.chunkContent.includes('Cláusula de otra sección'),
    );
    expect(otherSection).toBeDefined();
    expect(otherSection?.articleReference).toBeUndefined();
    expect(otherSection?.numeralReference).toBeUndefined();
    expect(
      chunks.find((chunk) => chunk.chunkContent.includes('cuatro modalidades')),
    ).toMatchObject({ articleReference: 'Artículo 79-A.' });
    expect(chunks.find((chunk) => chunk.pageStart === 20)).toMatchObject({
      pageEnd: 20,
      articleReference: undefined,
    });
  });

  it('no mezcla numerales consecutivos aunque no tengan punto después del número', () => {
    const chunks = service.chunk([
      {
        pageNumber: 10,
        text: [
          '“Artículo 42. Reconocimiento',
          '42.1 El Ministerio de Educación reconoce los méritos.',
          '42.2 Los reconocimientos se otorgan mediante resolución.',
        ].join('\n'),
      },
    ]);

    expect(chunks.map((chunk) => chunk.numeralReference)).toEqual([
      '42.1',
      '42.2',
    ]);
    expect(chunks[0].chunkContent).not.toContain(
      'Los reconocimientos se otorgan',
    );
    expect(chunks[1].chunkContent).not.toContain('reconoce los méritos');
  });

  it('mantiene un importe decimal en la oración donde se define el límite', () => {
    const chunks = service.chunk([
      {
        pageNumber: 12,
        text: [
          'Preámbulo breve.',
          'Artículo 49. Límites de la asignación',
          'El tope anual equivale a',
          '49.5 UIT y se aplica al personal nombrado.',
        ].join('\n'),
      },
    ]);

    const limit = chunks.find((chunk) =>
      chunk.chunkContent.includes('El tope anual equivale a 49.5 UIT'),
    );
    expect(limit).toMatchObject({ articleReference: 'Artículo 49.' });
    expect(limit?.numeralReference).toBeUndefined();
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

  it('keeps the article identity without propagating a sentence-like subtitle', () => {
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
      expect(chunk.chunkContent.startsWith('Artículo 14.')).toBe(false);
      expect(chunk.articleReference).toBe('Artículo 14.');
      expect(chunk.sectionTitle).toBeUndefined();
      expect(chunk.tokenCount).toBeLessThanOrEqual(800);
    }
  });

  it('does not take a brief complete article or list items as the heading of a long body (revisión 3)', () => {
    const chunks = service.chunk([
      {
        pageNumber: 1,
        text: [
          'Artículo 3. Vigencia. La presente norma entra en vigencia al día siguiente de su publicación.',
          'Artículo 4. Requisitos para la reasignación',
          words('cuatro', 1_300),
        ].join('\n\n'),
      },
    ]);
    const listChunks = service.chunk([
      {
        pageNumber: 2,
        text: [
          'Son requisitos para el destaque:',
          '1. Copia del DNI vigente.',
          '2. Declaración jurada de no tener antecedentes.',
          words('destaque', 1_300),
        ].join('\n\n'),
      },
    ]);

    const article3 = chunks.find((chunk) =>
      chunk.chunkContent.includes('Vigencia. La presente'),
    );
    expect(article3?.articleReference).toBe('Artículo 3.');
    for (const chunk of chunks.filter((item) =>
      /cuatrow\d/u.test(item.chunkContent),
    )) {
      expect(chunk.chunkContent.startsWith('Artículo 4.')).toBe(true);
      expect(chunk.chunkContent).not.toContain('Vigencia. La presente');
      expect(chunk.articleReference).toBe('Artículo 4.');
    }
    // La lista queda con su introducción, no pegada a cada ventana siguiente.
    const list = listChunks.find((chunk) =>
      chunk.chunkContent.includes('Son requisitos para el destaque:'),
    );
    expect(list?.chunkContent).toContain('1. Copia del DNI vigente.');
    expect(list?.chunkContent).toContain('2. Declaración jurada');
    expect(
      listChunks.filter((chunk) => chunk.chunkContent.includes('1. Copia')),
    ).toHaveLength(1);
  });

  it.each([
    [
      'Artículo 3.- La presente norma entra en vigencia al día siguiente de su publicación.',
      false,
    ],
    [
      'Artículo 2.- Dejar sin efecto la Resolución Viceministerial N° 123-2020-MINEDU.',
      false,
    ],
    ['Artículo 3.- Modifíquese el artículo 2.', false],
    ['Artículo 4.- Apruébase el reglamento adjunto.', false],
    ['Artículo 5.- Dispóngase su publicación inmediata.', false],
    ['DISPOSICIONES COMPLEMENTARIAS FINALES', true],
    ['ANEXOS', true],
    ['Artículo 5. Bienestar docente.', false],
    ['Artículo 14°.- Requisitos para la reasignación por salud:', true],
  ])(
    'prefixes «%s» to the windows of the following long body: %s',
    (heading, prefixed) => {
      const chunks = service.chunk([
        {
          pageNumber: 1,
          text: [
            'Texto previo de la norma.',
            heading,
            words('cuerpo', 1_300),
          ].join('\n\n'),
        },
      ]);
      const windows = chunks.filter((chunk) =>
        /cuerpow\d/u.test(chunk.chunkContent),
      );
      expect(windows.length).toBeGreaterThan(1);
      for (const chunk of windows) {
        expect(chunk.chunkContent.startsWith(heading)).toBe(prefixed);
        expect(chunk.tokenCount).toBeLessThanOrEqual(800);
      }
    },
  );

  it('conserva una tabla Markdown como una unidad con sus filas', () => {
    const chunks = service.chunk([
      {
        pageNumber: 7,
        text: [
          'La escala remunerativa vigente es la siguiente:',
          '',
          '| Nivel | Remuneración |',
          '| --- | --- |',
          '| Inicial | S/ 3 300,60 |',
          '| Primaria | S/ 3 300,60 |',
          '| Secundaria | S/ 3 300,60 |',
          '',
          'La tabla se aplica al personal nombrado.',
        ].join('\n'),
      },
    ]);

    const table = chunks.find((chunk) =>
      chunk.chunkContent.includes('| Nivel | Remuneración |'),
    );
    expect(table?.chunkContent).toContain(
      '| Inicial | S/ 3 300,60 |\n| Primaria | S/ 3 300,60 |\n| Secundaria | S/ 3 300,60 |',
    );
    expect(table).toMatchObject({ pageStart: 7, pageEnd: 7 });
  });
});
