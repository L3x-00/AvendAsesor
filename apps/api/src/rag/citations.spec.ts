import { citedIndexes, citesAnySource, withoutCitations } from './citations';

describe('citations', () => {
  it.each([
    ['plazo de 5 días [1].', [1]],
    ['plazo [[2]] y requisitos [3].', [2, 3]],
    ['plazo [1, 2].', [1, 2]],
    ['plazo [1-3].', [1, 2, 3]],
    ['plazo [1–2].', [1, 2]],
    ['plazo [1 y 3].', [1, 3]],
    ['plazo [1][2].', [1, 2]],
    ['sin citas.', []],
  ])('lee las citas de «%s»', (text, expected) => {
    expect(citedIndexes(text)).toEqual(expected);
  });

  it('solo cuenta citas a fuentes entregadas', () => {
    expect(citesAnySource('Ley de Reforma Magisterial [2012].', 3)).toBe(false);
    expect(citesAnySource('Plazo de 10 días [7].', 3)).toBe(false);
    expect(citesAnySource('Plazo de 10 días [0].', 3)).toBe(false);
    expect(citesAnySource('Plazo de 10 días [1, 7].', 3)).toBe(true);
    // Una fecha o un rango absurdo no es una cita.
    expect(citedIndexes('[1-2012]')).toEqual([]);
    expect(citedIndexes('Fecha [12-05-2024].')).toEqual([]);
    expect(citesAnySource('Plazo [1-2012].', 3)).toBe(false);
  });

  it('quita las citas para medir la sustancia de una afirmación', () => {
    expect(withoutCitations('Plazo de 5 días [1, 2].').trim()).toBe(
      'Plazo de 5 días  .',
    );
  });
});
