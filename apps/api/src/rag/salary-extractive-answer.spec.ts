import type { RetrievedChunk } from './retrieval.gateway';
import { buildExtractiveSalaryAnswer } from './salary-extractive-answer';

const source = (
  chunkContent: string,
  overrides: Partial<RetrievedChunk> = {},
) =>
  ({
    articleReference: null,
    chunkContent,
    chunkId: 'chunk-1',
    documentId: 'document-1',
    documentSituation: 'current',
    documentTitle: 'Remuneraciones del auxiliar de educación',
    documentVersionId: 'version-1',
    lexicalScore: 0.8,
    moduleIds: ['module-1'],
    moduleNames: ['Remuneraciones'],
    numeralReference: null,
    pageEnd: 1,
    pageStart: 1,
    sectionTitle: null,
    semanticScore: 0.9,
    versionNumber: 1,
    ...overrides,
  }) satisfies RetrievedChunk;

describe('buildExtractiveSalaryAnswer', () => {
  it('conserva literalmente el importe, el período y la reserva de la fuente', () => {
    const content =
      'La remuneración mensual bruta del auxiliar de educación privado es S/ 2 000,00, solo para jornada de 30 horas.';
    const result = buildExtractiveSalaryAnswer(
      [source(content)],
      '¿Cuánto gana un auxiliar privado?',
      'current',
    );

    expect(result?.answer).toContain(content);
    expect(result?.answer).toContain('[1]');
    expect(result?.sources).toHaveLength(1);
  });

  it('no sustituye una fuente pública por respuesta a una consulta privada', () => {
    expect(
      buildExtractiveSalaryAnswer(
        [
          source(
            'La remuneración mensual del auxiliar del sector público es S/ 2 000,00.',
          ),
        ],
        '¿Cuánto gana un auxiliar en el sector privado?',
        'current',
      ),
    ).toBeNull();
  });

  it('no presenta un fragmento sin sector declarado como respuesta privada', () => {
    expect(
      buildExtractiveSalaryAnswer(
        [source('La remuneración mensual del auxiliar es S/ 2 000,00.')],
        '¿Cuánto gana un auxiliar en el sector privado?',
        'current',
      ),
    ).toBeNull();
  });

  it('no atribuye al sector privado una cifra pública con una mención negativa', () => {
    expect(
      buildExtractiveSalaryAnswer(
        [
          source(
            'La remuneración mensual del auxiliar de educación del sector público es S/ 2 000,00. Esta escala no se aplica al sector privado.',
          ),
        ],
        '¿Cuánto gana un auxiliar en el sector privado?',
        'current',
      ),
    ).toBeNull();
  });

  it('descarta una mención negativa del sector en la misma afirmación salarial', () => {
    expect(
      buildExtractiveSalaryAnswer(
        [
          source(
            'La remuneración mensual del auxiliar de educación del sector público es S/ 2 000,00; esta escala no se aplica al sector privado.',
          ),
        ],
        '¿Cuánto gana un auxiliar en el sector privado?',
        'current',
      ),
    ).toBeNull();
  });

  it('descarta una negación de la propia cifra salarial', () => {
    expect(
      buildExtractiveSalaryAnswer(
        [
          source(
            'La remuneración mensual del auxiliar de educación del sector privado no es S/ 2 000,00.',
          ),
        ],
        '¿Cuánto gana un auxiliar en el sector privado?',
        'current',
      ),
    ).toBeNull();
  });

  it('descarta un sector incidental que no tiene una cifra propia', () => {
    expect(
      buildExtractiveSalaryAnswer(
        [
          source(
            'La remuneración mensual del auxiliar de educación del sector público es S/ 2 000,00; en el sector privado la jornada es de 40 horas.',
          ),
        ],
        '¿Cuánto gana un auxiliar en el sector privado?',
        'current',
      ),
    ).toBeNull();
  });

  it('no toma el cargo solo desde el título del documento', () => {
    expect(
      buildExtractiveSalaryAnswer(
        [source('La remuneración mensual del profesor es S/ 3 300,60.')],
        '¿Cuánto gana un auxiliar de educación?',
        'current',
      ),
    ).toBeNull();
  });

  it.each(['administrativo', 'de servicios'])(
    'no confunde auxiliar %s con auxiliar de educación',
    (qualification) => {
      expect(
        buildExtractiveSalaryAnswer(
          [
            source(
              `La remuneración mensual del auxiliar ${qualification} del sector privado es S/ 2 000,00.`,
            ),
          ],
          '¿Cuánto gana un auxiliar de educación en el sector privado?',
          'current',
        ),
      ).toBeNull();
    },
  );

  it('descarta un segundo cargo que no comparte la afirmación salarial', () => {
    expect(
      buildExtractiveSalaryAnswer(
        [
          source(
            'La remuneración mensual del profesor del sector público es S/ 3 300,60; el auxiliar del sector privado tiene otra escala.',
          ),
        ],
        '¿Cuánto gana un auxiliar en el sector privado?',
        'current',
      ),
    ).toBeNull();
  });

  it('descarta dos cargos aunque solo uno comparta el sector consultado', () => {
    expect(
      buildExtractiveSalaryAnswer(
        [
          source(
            'La remuneración mensual del profesor del sector privado es S/ 3 300,60; el auxiliar de educación tiene otra escala.',
          ),
        ],
        '¿Cuánto gana un auxiliar en el sector privado?',
        'current',
      ),
    ).toBeNull();
  });

  it('reconoce el cargo y sector que comparten una fila de tabla', () => {
    const result = buildExtractiveSalaryAnswer(
      [
        source(
          '| Cargo | Remuneración |\n| --- | --- |\n| Auxiliar de educación privado | S/ 2 000,00 |',
        ),
      ],
      '¿Cuánto gana un auxiliar en el sector privado?',
      'current',
    );

    expect(result?.answer).toContain('Auxiliar de educación privado');
  });

  it('advierte el sector ausente en un panorama solicitado de forma expresa', () => {
    const result = buildExtractiveSalaryAnswer(
      [
        source(
          'La remuneración mensual del auxiliar de educación del sector privado es S/ 2 000,00.',
        ),
        source(
          'La remuneración mensual del auxiliar de educación del sector privado es S/ 2 100,00.',
          { chunkId: 'chunk-2' },
        ),
      ],
      '¿Cuánto gana un auxiliar en el sector público y privado?',
      'current',
    );

    expect(result?.answer).toContain('sector publico');
  });

  it('prioriza un fragmento de cada sector en la pregunta general', () => {
    const result = buildExtractiveSalaryAnswer(
      [
        source(
          'La remuneración mensual del auxiliar de educación del sector público es S/ 2 000,00.',
        ),
        source(
          'La remuneración mensual del auxiliar de educación del sector público es S/ 2 100,00.',
          { chunkId: 'chunk-2' },
        ),
        source(
          'La remuneración mensual del auxiliar de educación del sector público es S/ 2 200,00.',
          { chunkId: 'chunk-3' },
        ),
        source(
          'La remuneración mensual del auxiliar de educación del sector privado es S/ 2 300,00.',
          { chunkId: 'chunk-4' },
        ),
      ],
      '¿Cuánto gana un auxiliar?',
      'current',
    );

    expect(result?.answer).toContain('sector público es S/ 2 000,00.\n[1]');
    expect(result?.answer).toContain('sector privado es S/ 2 300,00.\n[2]');
  });

  it('no exhibe una afirmación de otro cargo que comparte el mismo fragmento', () => {
    const result = buildExtractiveSalaryAnswer(
      [
        source(
          'La remuneración mensual del auxiliar de educación del sector público es S/ 2 000,00. La remuneración mensual del docente del sector privado es S/ 4 000,00.',
        ),
      ],
      '¿Cuánto gana un auxiliar de educación?',
      'current',
    );

    expect(result?.answer).toContain('S/ 2 000,00');
    expect(result?.answer).not.toContain('S/ 4 000,00');
    expect(result?.answer).toContain('sector privado');
  });

  it('no exhibe una fila de otro cargo que comparte la misma tabla', () => {
    const result = buildExtractiveSalaryAnswer(
      [
        source(
          '| Cargo | Sector | Remuneración |\n| --- | --- | --- |\n| Auxiliar de educación | Público | S/ 2 000,00 |\n| Docente | Privado | S/ 4 000,00 |',
        ),
      ],
      '¿Cuánto gana un auxiliar de educación?',
      'current',
    );

    expect(result?.answer).toContain('Auxiliar de educación');
    expect(result?.answer).toContain('S/ 2 000,00');
    expect(result?.answer).not.toContain('Docente');
    expect(result?.answer).not.toContain('S/ 4 000,00');
  });

  it('descarta fragmentos que podrían crear una cita ajena en la interfaz', () => {
    expect(
      buildExtractiveSalaryAnswer(
        [
          source(
            'La remuneración mensual del auxiliar privado es S/ 2 000,00. [2]',
          ),
        ],
        '¿Cuánto gana un auxiliar privado?',
        'current',
      ),
    ).toBeNull();
  });
});
