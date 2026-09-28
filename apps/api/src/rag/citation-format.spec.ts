import {
  CitationGroupNormalizer,
  normalizeCitationGroups,
} from './citation-format';

describe('normalizeCitationGroups', () => {
  it.each([
    ['plazo [1, 2].', 'plazo [1][2].'],
    ['plazo [1-3].', 'plazo [1][2][3].'],
    ['plazo [1 y 2].', 'plazo [1][2].'],
    ['plazo [[4]].', 'plazo [4].'],
    ['plazo [1][2].', 'plazo [1][2].'],
  ])('normaliza "%s" a "%s"', (input, expected) => {
    expect(normalizeCitationGroups(input)).toBe(expected);
  });

  it('conserva fechas y rangos absurdos entre corchetes', () => {
    expect(normalizeCitationGroups('Fecha [12-05-2024].')).toBe(
      'Fecha [12-05-2024].',
    );
    expect(normalizeCitationGroups('Norma [1-2012].')).toBe('Norma [1-2012].');
    expect(normalizeCitationGroups('Clave [abc].')).toBe('Clave [abc].');
  });
});

describe('CitationGroupNormalizer', () => {
  it('retiene una cita incompleta hasta que cierra', () => {
    const normalizer = new CitationGroupNormalizer();

    expect(normalizer.push('El plazo es de 5 días [1, ')).toBe(
      'El plazo es de 5 días ',
    );
    expect(normalizer.push('2].')).toBe('[1][2].');
    expect(normalizer.flush()).toBe('');
  });

  it('normaliza una cita partida en varios tokens', () => {
    const normalizer = new CitationGroupNormalizer();
    let output = '';

    for (const chunk of ['El plazo ', 'es [', '1-3', '] según ', 'la norma.']) {
      output += normalizer.push(chunk);
    }
    output += normalizer.flush();

    expect(output).toBe('El plazo es [1][2][3] según la norma.');
  });

  it('libera un corchete que nunca cierra para no bloquear el texto', () => {
    const normalizer = new CitationGroupNormalizer();
    const long = `[${'x'.repeat(MAX_PENDING_TEST)}`;

    expect(normalizer.push(long)).toBe(long);
    expect(normalizer.flush()).toBe('');
  });

  it('cierra el remanente con flush', () => {
    const normalizer = new CitationGroupNormalizer();

    expect(normalizer.push('texto [1')).toBe('texto ');
    expect(normalizer.flush()).toBe('[1');
  });
});

const MAX_PENDING_TEST = 100;
