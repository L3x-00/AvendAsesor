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

  it('descarta referencias inventadas y duplicadas sin tocar años', () => {
    expect(normalizeCitationGroups('Plazo [1, 7].', 2)).toBe('Plazo [1].');
    expect(normalizeCitationGroups('Plazo [3].', 2)).toBe('Plazo .');
    expect(normalizeCitationGroups('Plazo [2, 2].', 2)).toBe('Plazo [2].');
    expect(normalizeCitationGroups('Año [2012].', 2)).toBe('Año [2012].');
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

  it('espera el cierre de una cita doble y descarta el índice inválido', () => {
    const normalizer = new CitationGroupNormalizer(1);
    expect(normalizer.push('Texto [')).toBe('Texto ');
    expect(normalizer.push('[2]')).toBe('');
    expect(normalizer.push('] y otro [')).toBe(' y otro ');
    expect(normalizer.push('[1]')).toBe('');
    expect(normalizer.push('].')).toBe('[1].');
  });
});

const MAX_PENDING_TEST = 100;
