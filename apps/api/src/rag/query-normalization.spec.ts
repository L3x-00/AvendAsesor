import {
  normalizeDomainQuery,
  recoverDomainQuery,
} from './query-normalization';

describe('normalizeDomainQuery', () => {
  it.each([
    [
      '¿Qué dice la RM 123-2026?',
      '¿Qué dice la resolución ministerial 123-2026?',
    ],
    [
      'la RD 045 y el DS 004',
      'la resolución directoral 045 y el decreto supremo 004',
    ],
    [
      'sigo la RV del MEMO',
      'sigo la resolución viceministerial del memorándum',
    ],
    [
      'la RSG 326-2017-MINEDU y la RVM 158-2025-MINEDU',
      'la resolución de secretaría general 326-2017-MINEDU y la resolución viceministerial 158-2025-MINEDU',
    ],
    ['el DL 276 y la ley', 'el decreto legislativo 276 y la ley'],
  ])('expande abreviaturas en "%s"', (input, expected) => {
    expect(normalizeDomainQuery(input)).toBe(expected);
  });

  it.each([
    ['cuanto es mi renumeracion', 'cuanto es mi remuneración'],
    ['las renumeraciones de julio', 'las remuneraciones de julio'],
    ['las renumreaciones de julio', 'las remuneraciones de julio'],
    ['tengo una licensia por salud', 'tengo una licencia por salud'],
    ['mi nombramineto salió', 'mi nombramiento salió'],
    ['la ratificasion del director', 'la ratificación del director'],
  ])('corrige el error frecuente en "%s"', (input, expected) => {
    expect(normalizeDomainQuery(input)).toBe(expected);
  });

  it('corrige solo la combinación tipográfica salarial observada', () => {
    expect(normalizeDomainQuery('cuanto ganau nprofesro')).toBe(
      'cuanto gana un profesor',
    );
    expect(normalizeDomainQuery('¿cuánto ganau nprofesro?')).toBe(
      'cuanto gana un profesor',
    );
    expect(normalizeDomainQuery('¿quién ganau nprofesro?')).toBe(
      '¿quién ganau nprofesro?',
    );
    expect(normalizeDomainQuery('dime cuanto ganau nprofesro')).toBe(
      'dime cuanto ganau nprofesro',
    );
  });

  // OBS-004: la campaña real escribió «renumeración» con tilde. El corrector
  // anterior solo reconocía la variante sin tilde y el vocabulario dinámico
  // empataba entre «remuneración» y «remuneraciones», así que la consulta
  // llegaba intacta a la búsqueda y no recuperaba los 26 documentos.
  it.each([
    [
      '¿Qué incremento de renumeración corresponde a los profesores?',
      '¿Qué incremento de remuneración corresponde a los profesores?',
    ],
    ['RENUMERACIÓN de los auxiliares', 'REMUNERACIÓN de los auxiliares'],
    ['cuánto es mi Renumeración mensual', 'cuánto es mi Remuneración mensual'],
    ['las renumeraciónes de julio', 'las remuneraciones de julio'],
  ])('corrige el error frecuente con tilde en "%s"', (input, expected) => {
    expect(normalizeDomainQuery(input)).toBe(expected);
  });

  it('no altera palabras válidas cercanas al error frecuente', () => {
    // «numeración», «enumeración» y el término correcto son palabras reales:
    // una corrección difusa las habría deformado.
    expect(normalizeDomainQuery('la numeración de las plazas')).toBe(
      'la numeración de las plazas',
    );
    expect(normalizeDomainQuery('la enumeración del artículo 5')).toBe(
      'la enumeración del artículo 5',
    );
    expect(normalizeDomainQuery('mi remuneración mensual')).toBe(
      'mi remuneración mensual',
    );
    // Términos jurídicos distintos no se convierten por distancia de edición.
    expect(normalizeDomainQuery('solicito la rectificación del acto')).toBe(
      'solicito la rectificación del acto',
    );
    expect(normalizeDomainQuery('solicito la ratificación del acto')).toBe(
      'solicito la ratificación del acto',
    );
    expect(normalizeDomainQuery('mis remuneraciones de julio')).toBe(
      'mis remuneraciones de julio',
    );
  });

  it('corrige las variantes heredadas de encargatura', () => {
    // El corrector anterior cubría `encargatura?z?`; el mapa por palabra
    // completa conserva esas variantes para no perder ninguna corrección.
    expect(normalizeDomainQuery('tengo una encargaturz')).toBe(
      'tengo una encargatura',
    );
    expect(normalizeDomainQuery('tengo una encargatur')).toBe(
      'tengo una encargatura',
    );
    expect(normalizeDomainQuery('la encargatura de la UGEL')).toBe(
      'la encargatura de la UGEL',
    );
  });

  it('recupera automáticamente omisiones y transposiciones únicas del léxico docente', () => {
    expect(recoverDomainQuery('docente nombrdo con 30 oras')).toEqual({
      clarification: null,
      normalizedQuestion: 'docente nombrado con 30 horas',
    });
    expect(normalizeDomainQuery('mi profesro es nombrdo')).toBe(
      'mi profesor es nombrado',
    );
  });

  it('no adivina un error de dos letras: propone la consulta y espera confirmación', () => {
    expect(recoverDomainQuery('cuanto gana profeszz')).toEqual({
      clarification: {
        originalWord: 'profeszz',
        suggestions: ['profesor'],
        suggestedQuestion: 'cuanto gana profesor',
      },
      normalizedQuestion: 'cuanto gana profeszz',
    });
  });

  it('mantiene la primera duda y conserva las correcciones mecánicas a ambos lados', () => {
    expect(recoverDomainQuery('docente nombrdo profeszz con oras')).toEqual({
      clarification: {
        originalWord: 'profeszz',
        suggestions: ['profesor'],
        suggestedQuestion: 'docente nombrado profesor con horas',
      },
      normalizedQuestion: 'docente nombrado profeszz con horas',
    });
  });

  it('conserva formas válidas y palabras españolas aunque sean cercanas al léxico docente', () => {
    expect(normalizeDomainQuery('¿Cuánto ganan las profesoras?')).toBe(
      '¿Cuánto ganan las profesoras?',
    );
    expect(normalizeDomainQuery('Los docentes tienen permisos')).toBe(
      'Los docentes tienen permisos',
    );
    expect(recoverDomainQuery('El suelo de la escuela')).toEqual({
      clarification: null,
      normalizedQuestion: 'El suelo de la escuela',
    });
    expect(recoverDomainQuery('hola profeszz')).toEqual({
      clarification: null,
      normalizedQuestion: 'hola profeszz',
    });
  });

  it('no prepara una consulta aceptable con sí cuando las alternativas empatan', () => {
    expect(recoverDomainQuery('requisitos para nombrad')).toEqual({
      clarification: {
        originalWord: 'nombrad',
        suggestions: ['nombrada', 'nombrado'],
        suggestedQuestion: null,
      },
      normalizedQuestion: 'requisitos para nombrad',
    });
  });

  it('no altera números de norma, años, siglas ni nombres propios', () => {
    const question =
      '¿Qué dispone la RSG N.° 326-2017-MINEDU y el DS N.° 049-2025-EF para el 2026?';
    expect(normalizeDomainQuery(question)).toBe(
      '¿Qué dispone la resolución de secretaría general N.° 326-2017-MINEDU y el decreto supremo N.° 049-2025-EF para el 2026?',
    );
    expect(
      normalizeDomainQuery('Rosa Quispe presentó su renumeración en la UGEL'),
    ).toBe('Rosa Quispe presentó su remuneración en la UGEL');
    expect(normalizeDomainQuery('Quiero ver esa RM 123')).toBe(
      'Quiero ver esa resolución ministerial 123',
    );
    expect(recoverDomainQuery('Quiero ver esa RM 123').clarification).toBe(
      null,
    );
    expect(recoverDomainQuery('Hola, buenos días').clarification).toBe(null);
    expect(normalizeDomainQuery('la resignación no es una reasignación')).toBe(
      'la resignación no es una reasignación',
    );
    expect(recoverDomainQuery('contrato docente').clarification).toBe(null);
  });

  it('deja intacto el texto correcto', () => {
    expect(normalizeDomainQuery('¿Cuánto dura la licencia por salud?')).toBe(
      '¿Cuánto dura la licencia por salud?',
    );
  });
});
