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

    // Un documento sin tipo declarado ya no responde por una RSG (ADR-0025):
    // mencionarla en el título o en el número registrado no lo convierte en ella.
    expect(
      sourceMatchesExactDocumentReference(
        {
          documentTitle: 'Norma de registro y control de asistencia',
          documentType: 'OTRO',
          resolutionNumber: 'RSG N.° 326-2017-MINEDU',
        },
        reference,
      ),
    ).toBe(false);
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
    ).toBe(false);
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

    const supremeDecree = exactDocumentReferencesIn(
      'Explícame el Decreto Supremo N.° 049-2025-EF',
    )[0];
    if (!supremeDecree) throw new Error('Expected an exact reference.');

    expect(
      sourceMatchesExactDocumentReference(
        {
          documentTitle:
            'Decreto Supremo N.° 049-2025-EF que aprueba el Reglamento de la Ley N.° 29988',
          documentType: 'DECRETO_SUPREMO',
          resolutionNumber: null,
        },
        supremeDecree,
      ),
    ).toBe(true);

    // El número registrado puede traer la etiqueta completa y acentuada: la
    // normalización ignora las tildes y retira la etiqueta del código pedido.
    const registeredWithLabel = exactDocumentReferencesIn(
      '¿Qué dispone la RSG 512-2021-MINEDU?',
    )[0];
    if (!registeredWithLabel) throw new Error('Expected an exact reference.');

    expect(
      sourceMatchesExactDocumentReference(
        {
          documentTitle: 'Año 2021: Norma de control interno',
          documentType: 'RESOLUCION_SECRETARIA_GENERAL',
          resolutionNumber:
            'Resolución de Secretaría General N.° 512-2021-MINEDU',
        },
        registeredWithLabel,
      ),
    ).toBe(true);
  });

  it('does not answer for a norm the title only mentions', () => {
    const mentioned = exactDocumentReferencesIn(
      '¿Qué modifica la RM 654-2019-MINEDU?',
    )[0];
    const ownIdentity = exactDocumentReferencesIn(
      '¿Qué modifica la RM 789-2020-MINEDU?',
    )[0];
    if (!mentioned || !ownIdentity) {
      throw new Error('Expected exact references.');
    }

    const modifyingResolution = {
      documentTitle:
        'Resolución Ministerial N.° 789-2020-MINEDU que modifica la Resolución Ministerial N.° 654-2019-MINEDU',
      documentType: 'RESOLUCION_MINISTERIAL',
      resolutionNumber: null,
    };

    expect(
      sourceMatchesExactDocumentReference(modifyingResolution, mentioned),
    ).toBe(false);
    expect(
      sourceMatchesExactDocumentReference(modifyingResolution, ownIdentity),
    ).toBe(true);

    // El caso equivalente de una bolsa sin tipo declarado que difunde una RSG.
    const diffusedRsg = exactDocumentReferencesIn(
      '¿Qué dispone la RSG 326-2017-MINEDU?',
    )[0];
    if (!diffusedRsg) throw new Error('Expected an exact reference.');

    expect(
      sourceMatchesExactDocumentReference(
        {
          documentTitle:
            'Oficio Múltiple N.° 123-2020-MINEDU que difunde la Resolución de Secretaría General N.° 326-2017-MINEDU',
          documentType: 'OTRO',
          resolutionNumber: null,
        },
        diffusedRsg,
      ),
    ).toBe(false);
  });

  it('reads every reference a title declares, not only the five of a question', () => {
    const rsg = exactDocumentReferencesIn(
      '¿Qué dispone la RSG 5555-2020-MINEDU?',
    )[0];
    if (!rsg) throw new Error('Expected an exact reference.');

    expect(
      sourceMatchesExactDocumentReference(
        {
          documentTitle:
            'Decreto Supremo N.° 001-2020-EF, Ley N.° 1111, Resolución Ministerial N.° 2222-2020-MINEDU, Resolución Viceministerial N.° 3333-2020-MINEDU, Resolución Directoral N.° 4444-2020-MINEDU y Resolución de Secretaría General N.° 5555-2020-MINEDU',
          documentType: 'RESOLUCION_SECRETARIA_GENERAL',
          resolutionNumber: null,
        },
        rsg,
      ),
    ).toBe(true);
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
