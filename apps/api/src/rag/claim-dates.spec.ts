import {
  extractDates,
  mentionsUnparsedMonth,
  sourceHasDate,
} from './claim-dates';
import type { RetrievedChunk } from './retrieval.gateway';

function source(chunkContent: string): RetrievedChunk {
  return {
    articleReference: null,
    chunkContent,
    chunkId: 'chunk-id',
    documentId: 'document-id',
    documentSituation: 'current',
    documentTitle: 'Documento',
    documentVersionId: 'version-id',
    lexicalScore: 0.1,
    moduleIds: [],
    moduleNames: [],
    numeralReference: null,
    pageEnd: 1,
    pageStart: 1,
    sectionTitle: null,
    semanticScore: 0.9,
    versionNumber: 1,
  };
}

describe('extractDates', () => {
  it.each([
    ['el 16 de enero de 2026', [{ day: 16, month: 1, year: 2026 }]],
    ['el 16 de enero del 2026', [{ day: 16, month: 1, year: 2026 }]],
    ['el 16.01.2026', [{ day: 16, month: 1, year: 2026 }]],
    ['el 5/3/2026', [{ day: 5, month: 3, year: 2026 }]],
    ['el 15 de setiembre de 2026', [{ day: 15, month: 9, year: 2026 }]],
    [
      'del 14 al 15 de enero de 2026',
      [
        { day: 14, month: 1, year: 2026 },
        { day: 15, month: 1, year: 2026 },
      ],
    ],
    [
      'el 13 y 14 de Enero de 2026',
      [
        { day: 13, month: 1, year: 2026 },
        { day: 14, month: 1, year: 2026 },
      ],
    ],
    [
      'del 30 de enero al 2 de febrero de 2026',
      [
        { day: 30, month: 1, year: 2026 },
        { day: 2, month: 2, year: 2026 },
      ],
    ],
    [
      'del 30 de diciembre de 2025 al 5 de enero de 2026',
      [
        { day: 30, month: 12, year: 2025 },
        { day: 5, month: 1, year: 2026 },
      ],
    ],
  ])('lee «%s»', (text, expected) => {
    const { dates, rest } = extractDates(text);

    expect(dates).toEqual(expected);
    expect(rest.replace(/\s+/gu, ' ').trim()).toBe(text.split(' ')[0]);
  });

  it('no inventa una fecha al leer un periodo numérico que cruza de año', () => {
    // «25 al 5 de enero de 2026» no es una fecha: «25» es el final de «2025».
    const { dates } = extractDates('del 30.12.2025 al 5 de enero de 2026');

    expect(dates).not.toContainEqual({ day: 25, month: 1, year: 2026 });
    expect(dates).toEqual(
      expect.arrayContaining([
        { day: 30, month: 12, year: 2025 },
        { day: 5, month: 1, year: 2026 },
      ]),
    );
    expect(dates).toHaveLength(2);
  });

  it('deja sin leer una fecha sin año', () => {
    const { dates, rest } = extractDates('el 13 de enero');

    expect(dates).toEqual([]);
    expect(rest).toBe('el 13 de enero');
  });
});

describe('mentionsUnparsedMonth', () => {
  it('detecta un mes que no forma parte de una fecha completa', () => {
    expect(mentionsUnparsedMonth('Se evalúa en enero.')).toBe(true);
    expect(mentionsUnparsedMonth('el 13 de Setiembre')).toBe(true);
    expect(mentionsUnparsedMonth('Se evalúa durante el año.')).toBe(false);
  });
});

describe('sourceHasDate', () => {
  const january = { day: 13, month: 1, year: 2026 };

  it('reconoce la fecha numérica con o sin ceros', () => {
    expect(sourceHasDate(source('del 13.01.2026'), january)).toBe(true);
    expect(sourceHasDate(source('del 13/1/2026'), january)).toBe(true);
    expect(
      sourceHasDate(source('el 05.01.2026'), { day: 5, month: 1, year: 2026 }),
    ).toBe(true);
  });

  it('reconoce la fecha con letras, con o sin cero y «de»/«del»', () => {
    expect(sourceHasDate(source('el 13 de enero de 2026'), january)).toBe(true);
    expect(sourceHasDate(source('el 13 de enero del 2026'), january)).toBe(
      true,
    );
    expect(
      sourceHasDate(source('el 05 de enero de 2026'), {
        day: 5,
        month: 1,
        year: 2026,
      }),
    ).toBe(true);
    expect(
      sourceHasDate(source('el 15 de setiembre de 2026'), {
        day: 15,
        month: 9,
        year: 2026,
      }),
    ).toBe(true);
  });

  it('no acepta otro mes, otro año ni un día contenido en otro número', () => {
    expect(sourceHasDate(source('del 13.02.2026'), january)).toBe(false);
    expect(sourceHasDate(source('del 13.01.2027'), january)).toBe(false);
    expect(sourceHasDate(source('del 113.01.2026'), january)).toBe(false);
    expect(
      sourceHasDate(source('del 15.01.2026'), { day: 5, month: 1, year: 2026 }),
    ).toBe(false);
  });
});
