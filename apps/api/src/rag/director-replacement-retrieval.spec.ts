import {
  directorReplacementEvidenceQueries,
  isDirectorReplacementQuestion,
} from './director-replacement-retrieval';

describe('reemplazo del director', () => {
  it.each([
    'quién reemplaza al director cuando está de licencia',
    'mi director está de licencia y no sabemos quién se queda a cargo',
    'cuando el director está de licencia quién se queda a cargo',
    'quién asume el cargo si la directora está de licencia',
    'quién se encarga de la escuela mientras el director está ausente',
    'quién se queda con la escuela cuando el director está de licencia',
    'quién está a cargo si el director está de licencia',
    'quién asume la dirección si la directora está de licencia',
  ])('reconoce la pregunta coloquial: %s', (question) => {
    expect(isDirectorReplacementQuestion(question)).toBe(true);
    expect(directorReplacementEvidenceQueries(question)).toHaveLength(1);
  });

  it.each([
    'cuánto gana un profesor en peru',
    'qué es el cuadro de distribución de horas',
    'quién reemplaza al auxiliar cuando está de licencia',
    'el director reemplaza al profesor de licencia',
    'quién se encarga de las planillas si el director está de baja',
    'mi director quiere ascender de escala',
  ])('no la confunde con otro tema: %s', (question) => {
    expect(isDirectorReplacementQuestion(question)).toBe(false);
    expect(directorReplacementEvidenceQueries(question)).toEqual([]);
  });

  it('usa el vocabulario de la norma, sin añadir la frase coloquial', () => {
    const [query] = directorReplacementEvidenceQueries(
      'quién se queda a cargo si el director está de licencia',
    );
    expect(query).toContain('encargatura');
    expect(query).toContain('DRE UGEL');
    expect(query).not.toContain('se queda a cargo');
  });
});
