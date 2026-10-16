import {
  exactDocumentReferencesIn,
  normalizeDocumentReferenceKey,
  sourceMatchesExactDocumentReference,
} from './legal-reference';

describe('legal document references', () => {
  it.each([
    [
      'Según la Resolución de Secretaría General N.° 326-2017-MINEDU, ¿cómo se controla la asistencia?',
      '3262017MINEDU',
    ],
    ['¿Qué dispone la RSG 121-2018-MINEDU?', '1212018MINEDU'],
    ['¿Qué dispone la R. S. G. 121-2018-MINEDU?', '1212018MINEDU'],
    ['Explícame el Decreto Supremo N.º 074-2019-EF', '0742019EF'],
    ['Explícame el D.S. N.º 074-2019-EF', '0742019EF'],
    ['Revisa la R. M. 123-2024-MINEDU', '1232024MINEDU'],
    ['¿Qué establece la Ley N° 29944?', '29944'],
  ])('extracts an exact norm identity from %s', (question, key) => {
    expect(exactDocumentReferencesIn(question)).toEqual([
      expect.objectContaining({ key }),
    ]);
  });

  it('extracts and deduplicates more than one explicit norm', () => {
    expect(
      exactDocumentReferencesIn(
        'Compara el DS 305-2017-EF con el Decreto Supremo N.° 306-2017-EF y vuelve al DS 305-2017-EF.',
      ).map((reference) => reference.key),
    ).toEqual(['3052017EF', '3062017EF']);
  });

  it.each([
    '¿Cuánto gana un profesor de 30 horas en 2025?',
    'Dame la página 20 del documento de contratación.',
    '¿Qué dice el artículo 3 sobre la remuneración?',
  ])(
    'does not mistake ordinary numbers for a document identity: %s',
    (text) => {
      expect(exactDocumentReferencesIn(text)).toEqual([]);
    },
  );

  it('normalizes punctuation and casing into a stable lookup key', () => {
    expect(normalizeDocumentReferenceKey('N.° 326-2017-MINEDU')).toBe(
      'N3262017MINEDU',
    );
  });

  it('requires the exact number and the matching document type', () => {
    const reference = exactDocumentReferencesIn(
      'Según la RSG 326-2017-MINEDU, ¿qué corresponde?',
    )[0];
    if (!reference) throw new Error('Expected an exact reference.');

    expect(
      sourceMatchesExactDocumentReference(
        {
          documentTitle: 'Norma de registro y control de asistencia',
          documentType: 'OTRO',
          resolutionNumber: 'RSG N.° 326-2017-MINEDU',
        },
        reference,
      ),
    ).toBe(true);
    expect(
      sourceMatchesExactDocumentReference(
        {
          documentTitle: 'Norma de registro y control de asistencia',
          documentType: 'RESOLUCION_SECRETARIA_GENERAL',
          resolutionNumber: 'RSG N.° 326-2017-MINEDU',
        },
        reference,
      ),
    ).toBe(true);
    expect(
      sourceMatchesExactDocumentReference(
        {
          documentTitle:
            'Resolución de Secretaría General 326-2017-MINEDU para docentes',
          documentType: 'OTRO',
          resolutionNumber: null,
        },
        reference,
      ),
    ).toBe(true);
    expect(
      sourceMatchesExactDocumentReference(
        {
          documentTitle: 'Proceso administrativo disciplinario',
          documentType: 'RESOLUCION_SECRETARIA_GENERAL',
          resolutionNumber: '123-2017-MINEDU',
        },
        reference,
      ),
    ).toBe(false);
    expect(
      sourceMatchesExactDocumentReference(
        {
          documentTitle: 'Ley de ejemplo',
          documentType: 'OTRO',
          resolutionNumber: 'RSG N.° 1326-2017-MINEDU',
        },
        reference,
      ),
    ).toBe(false);
    expect(
      sourceMatchesExactDocumentReference(
        {
          documentTitle: 'Resolución Ministerial N.° 326-2017-MINEDU',
          documentType: 'RESOLUCION_MINISTERIAL',
          resolutionNumber: '326-2017-MINEDU',
        },
        reference,
      ),
    ).toBe(false);
  });

  it('accepts the number the title declares when the registered one is absent', () => {
    const law = exactDocumentReferencesIn(
      '¿Qué establece la Ley N.° 29988?',
    )[0];
    if (!law) throw new Error('Expected an exact reference.');

    expect(
      sourceMatchesExactDocumentReference(
        {
          documentTitle:
            'Año 2019: Habilitante para incremento de remuneraciones  Ley N.° 29988',
          documentType: 'LEY',
          resolutionNumber: null,
        },
        law,
      ),
    ).toBe(true);
    expect(
      sourceMatchesExactDocumentReference(
        {
          documentTitle: 'Año 2019: Otra norma distinta  Ley N.° 29999',
          documentType: 'LEY',
          resolutionNumber: null,
        },
        law,
      ),
    ).toBe(false);
  });

  it('keeps the registered number authoritative over the title', () => {
    const reference = exactDocumentReferencesIn(
      'Revisa la RM 456-2018-MINEDU',
    )[0];
    if (!reference) throw new Error('Expected an exact reference.');

    expect(
      sourceMatchesExactDocumentReference(
        {
          documentTitle: 'Resolución Ministerial N.° 456-2018-MINEDU',
          documentType: 'RESOLUCION_MINISTERIAL',
          resolutionNumber: '123-2019-MINEDU',
        },
        reference,
      ),
    ).toBe(false);
    expect(
      sourceMatchesExactDocumentReference(
        {
          documentTitle: 'Resolución Ministerial N.° 999-2019-MINEDU',
          documentType: 'RESOLUCION_MINISTERIAL',
          resolutionNumber: '456-2018-MINEDU',
        },
        reference,
      ),
    ).toBe(true);
  });
});
