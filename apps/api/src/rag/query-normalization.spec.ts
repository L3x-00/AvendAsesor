import { normalizeDomainQuery } from './query-normalization';

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
    ['el DL 276 y la ley', 'el decreto legislativo 276 y la ley'],
  ])('expande abreviaturas en "%s"', (input, expected) => {
    expect(normalizeDomainQuery(input)).toBe(expected);
  });

  it.each([
    ['cuanto es mi renumeracion', 'cuanto es mi remuneración'],
    ['las renumeraciones de julio', 'las remuneraciones de julio'],
    ['tengo una licensia por salud', 'tengo una licencia por salud'],
    ['mi nombramineto salió', 'mi nombramiento salió'],
    ['la ratificasion del director', 'la ratificación del director'],
  ])('corrige el error frecuente en "%s"', (input, expected) => {
    expect(normalizeDomainQuery(input)).toBe(expected);
  });

  it('deja intacto el texto correcto', () => {
    expect(normalizeDomainQuery('¿Cuánto dura la licencia por salud?')).toBe(
      '¿Cuánto dura la licencia por salud?',
    );
  });
});
