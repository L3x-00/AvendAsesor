import {
  coversPage,
  documentTypeMatches,
  pageReferenceIn,
} from './page-reference';

/**
 * «Página 24 de la RVM» es una ubicación verificable de un documento, no una
 * consulta de contenido: la detección tiene que acotar la página y, cuando la
 * persona nombra la clase de norma, también el tipo documental.
 */
describe('pageReferenceIn', () => {
  it.each([
    ['pagina 24 de la rvm', 24],
    ['página 24', 24],
    ['pag. 12 del documento', 12],
    ['en la pagina N.° 7', 7],
  ])('reconoce la página en «%s»', (question, page) => {
    expect(pageReferenceIn(question)).toMatchObject({ page });
  });

  it('reconoce el tipo documental nombrado junto a la página', () => {
    // La sigla no se expande antes de llegar aquí: «RVM» tiene que acotar el
    // tipo o el ancla podría tomarse de otro documento del mismo tema.
    expect(pageReferenceIn('pagina 24 de la rvm')).toEqual({
      documentType: 'RESOLUCION_VICEMINISTERIAL',
      page: 24,
    });
    expect(pageReferenceIn('pagina 3 del ds 049-2025')).toEqual({
      documentType: 'DECRETO_SUPREMO',
      page: 3,
    });
    expect(
      pageReferenceIn('página 24 de la resolución viceministerial'),
    ).toEqual({
      documentType: 'RESOLUCION_VICEMINISTERIAL',
      page: 24,
    });
    expect(pageReferenceIn('pagina 3 del decreto supremo')).toEqual({
      documentType: 'DECRETO_SUPREMO',
      page: 3,
    });
  });

  it('deja el tipo en null cuando se nombran dos clases de documento', () => {
    // El orden del catálogo no decide entre RVM y DS: sin un único tipo, el hilo
    // determina el documento del que se pide la página.
    expect(pageReferenceIn('pagina 24 de la rvm y del ds 049')).toEqual({
      documentType: null,
      page: 24,
    });
  });

  it('deja el tipo en null cuando solo se pide la página', () => {
    expect(pageReferenceIn('página 7 del documento')).toEqual({
      documentType: null,
      page: 7,
    });
  });

  it.each([
    'cuanto gana un docente',
    'la pagina web del minedu',
    'página cero',
    'página 999',
    'que dice el procedimiento',
  ])('no reconoce una página en «%s»', (question) => {
    expect(pageReferenceIn(question)).toBeNull();
  });
});

describe('coversPage', () => {
  it('acepta la página incluida en el rango del fragmento', () => {
    expect(coversPage({ pageEnd: 25, pageStart: 24 }, 24)).toBe(true);
    expect(coversPage({ pageEnd: 25, pageStart: 24 }, 25)).toBe(true);
  });

  it('rechaza una página fuera del fragmento', () => {
    expect(coversPage({ pageEnd: 25, pageStart: 24 }, 26)).toBe(false);
    expect(coversPage({ pageEnd: 25, pageStart: 24 }, 23)).toBe(false);
  });

  it('tolera metadatos nulos sin afirmar una cobertura inventada', () => {
    expect(coversPage({ pageEnd: null, pageStart: 24 }, 24)).toBe(true);
    expect(coversPage({ pageEnd: null, pageStart: null }, 24)).toBe(false);
    expect(coversPage({ pageEnd: 24, pageStart: null }, 24)).toBe(false);
  });
});

describe('documentTypeMatches', () => {
  it('compara contra el tipo del catálogo', () => {
    expect(
      documentTypeMatches(
        {
          documentTitle: 'Documento sin título descriptivo',
          documentType: 'RESOLUCION_VICEMINISTERIAL',
        },
        'RESOLUCION_VICEMINISTERIAL',
      ),
    ).toBe(true);
  });

  it('usa el título cuando la ficha no declara el tipo', () => {
    expect(
      documentTypeMatches(
        {
          documentTitle: 'Resolución Viceministerial N.° 158-2025-MINEDU',
          documentType: null,
        },
        'RESOLUCION_VICEMINISTERIAL',
      ),
    ).toBe(true);
    expect(
      documentTypeMatches(
        {
          documentTitle: 'Resolución Ministerial N.° 049-2025-MINEDU',
          documentType: null,
        },
        'RESOLUCION_VICEMINISTERIAL',
      ),
    ).toBe(false);
  });
});
