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
    expect(result?.hasVerifiedAmount).toBe(true);
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

    expect(result?.answer).toContain('sector público');
    expect(result?.answer).toContain(
      'No tengo un monto para el sector público',
    );
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

    expect(result?.answer).toContain('sector público es S/ 2 000,00. [1]');
    expect(result?.answer).toContain('sector privado es S/ 2 300,00. [2]');
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
    expect(result?.answer).not.toContain('sector privado');
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

  it('no considera el monto de otra unidad como monto verificable del cargo', () => {
    const result = buildExtractiveSalaryAnswer(
      [
        source(
          'La remuneración del auxiliar de educación del sector público se regula por la normativa vigente. La remuneración mensual del docente del sector privado es S/ 4 000,00.',
        ),
      ],
      '¿Cuánto gana un auxiliar de educación?',
      'current',
    );

    expect(result?.hasVerifiedAmount).toBe(false);
    expect(result?.answer).not.toContain('S/ 4 000,00');
  });

  it('no confunde una bonificación con el monto de la remuneración', () => {
    const result = buildExtractiveSalaryAnswer(
      [
        source(
          'La remuneración del auxiliar de educación del sector público se regula por normativa; la bonificación temporal es S/ 500,00.',
        ),
      ],
      '¿Cuánto gana un auxiliar de educación?',
      'current',
    );

    expect(result).toBeNull();
  });

  it('no toma una bonificación incluida en la misma cláusula como sueldo', () => {
    const result = buildExtractiveSalaryAnswer(
      [
        source(
          'La remuneración del auxiliar de educación del sector público incluye una bonificación temporal de S/ 500,00.',
        ),
      ],
      '¿Cuánto gana un auxiliar de educación?',
      'current',
    );

    expect(result).toBeNull();
  });

  it('no toma la CTS incluida en la cláusula como sueldo', () => {
    const result = buildExtractiveSalaryAnswer(
      [
        source(
          'La remuneración del auxiliar de educación del sector público incluye CTS de S/ 500,00.',
        ),
      ],
      '¿Cuánto gana un auxiliar de educación?',
      'current',
    );

    expect(result).toBeNull();
  });

  it.each([
    'Bonificación temporal',
    'Beneficio temporal',
    'Incentivo temporal',
  ])('no toma una fila de tabla con %s como sueldo', (concept) => {
    const result = buildExtractiveSalaryAnswer(
      [
        source(
          `| Cargo | Sector | Remuneración | Concepto |\n| --- | --- | --- | --- |\n| Auxiliar de educación | Público | S/ 500,00 | ${concept} |`,
        ),
      ],
      '¿Cuánto gana un auxiliar de educación?',
      'current',
    );

    expect(result).toBeNull();
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

  describe('escala aplanada del profesor contratado', () => {
    const scheduleText = (amount: string) =>
      `6 NORMAS LEGALES Sábado 29 de noviembre de 2025 El Peruano / Artículo 2.- Monto de la remuneración mensual a otorgarse al profesor contratado 2.1 El profesor contratado en el marco del Contrato de Servicio Docente de la Ley N° 30328 percibe una remuneración mensual de acuerdo con la jornada laboral establecida para la modalidad, forma, nivel o ciclo en que presta sus servicios, conforme al siguiente detalle: Modalidad / Forma Nivel / Ciclo Jornada laboral Remuneración mensual S/ Educación Básica Regular - EBR Inicial 30 ${amount} Primaria 30 ${amount} Secundaria 30 ${amount} Educación Básica Especial - EBE Inicial 30 ${amount} Primaria 30 ${amount} Educación Básica Alternativa - EBA Inicial / Intermedio 30 ${amount} Avanzado 30 ${amount} Educación Técnico Productiva - ETP Básico y Medio 30 ${amount} 2.2 El profesor contratado que labora menos de la jornada laboral establecida percibe la remuneración mensual de forma proporcional a las horas contratadas.`;

    const scheduleSource = (
      amount: string,
      year: number,
      id: string,
      situation: 'current' | 'replaced' = 'current',
    ) =>
      source(scheduleText(amount), {
        chunkId: `chunk-${id}`,
        documentSituation: situation,
        documentTitle: `Norma ${id}`,
        documentVersionId: `version-${id}`,
        issuanceYear: year,
      });

    it('presenta una tabla con el monto de la norma más reciente y descarta las anteriores', () => {
      const result = buildExtractiveSalaryAnswer(
        [
          scheduleSource('3 500,70', 2026, 'nueva'),
          scheduleSource('3 300,60', 2025, 'media'),
          scheduleSource('2 850,00', 2023, 'antigua'),
        ],
        '¿Cuánto gana un docente?',
        'current',
      );

      expect(result?.hasVerifiedAmount).toBe(true);
      expect(result?.sources).toHaveLength(1);
      expect(result?.answer).toContain(
        '| Modalidad / Forma | Nivel / Ciclo | Jornada laboral | Remuneración mensual | Cita |',
      );
      expect(result?.answer).toContain('| [1] |');
      expect(result?.answer.match(/^\| Educación/gmu)).toHaveLength(8);
      expect(result?.answer).toContain('S/ 3 500,70');
      expect(result?.answer).not.toContain('S/ 3 300,60');
      expect(result?.answer).not.toContain('S/ 2 850,00');
      expect(result?.answer).not.toContain('Fragmento recuperado');
      expect(result?.answer).toContain(
        'La remuneración mensual del profesor contratado es S/ 3 500,70',
      );
      expect(result?.answer).toContain('jornada de 30 horas');
      expect(result?.answer).toContain('proporcional a las horas contratadas');
      expect(result?.answer).toContain('[1]');
    });

    it('no afirma un monto único cuando la escala trae importes distintos', () => {
      const content =
        'La remuneración mensual del profesor contratado, conforme al siguiente detalle: Modalidad / Forma Nivel / Ciclo Jornada laboral Remuneración mensual S/ Educación Básica Regular - EBR Inicial 30 3 500,70 Secundaria 30 3 800,90 2.2 El profesor contratado que labora menos de la jornada percibe la remuneración de forma proporcional a las horas contratadas.';
      const result = buildExtractiveSalaryAnswer(
        [
          source(content, {
            documentTitle: 'Escala diferenciada',
            documentVersionId: 'version-diferenciada',
            issuanceYear: 2026,
          }),
        ],
        '¿Cuánto gana un docente?',
        'current',
      );

      expect(result?.answer).toContain('según la tabla del documento');
      expect(result?.answer).not.toContain('es S/ 3 500,70 para una jornada');
      expect(result?.answer).toContain('S/ 3 500,70');
      expect(result?.answer).toContain('S/ 3 800,90');
    });

    it('no elige en silencio entre dos montos del mismo año', () => {
      const result = buildExtractiveSalaryAnswer(
        [
          scheduleSource('3 500,70', 2025, 'a'),
          scheduleSource('3 300,60', 2025, 'b'),
        ],
        '¿Cuánto gana un docente?',
        'current',
      );

      expect(result?.sources).toHaveLength(2);
      expect(result?.answer).toContain('S/ 3 500,70');
      expect(result?.answer).toContain('S/ 3 300,60');
      expect(result?.answer).toContain(
        'del mismo año registra un monto distinto',
      );
    });

    it('no afirma que dos fuentes sin año son del mismo año', () => {
      const content = (amount: string, id: string) =>
        source(
          `La remuneración mensual del profesor contratado, conforme al siguiente detalle: Modalidad / Forma Nivel / Ciclo Jornada laboral Remuneración mensual S/ Educación Básica Regular - EBR Inicial 30 ${amount} Primaria 30 ${amount}`,
          { chunkId: `chunk-${id}`, documentVersionId: `version-${id}` },
        );

      const result = buildExtractiveSalaryAnswer(
        [content('3 500,70', 'a'), content('3 300,60', 'b')],
        '¿Cuánto gana un docente?',
        'current',
      );

      expect(result?.answer).toContain('S/ 3 300,60');
      expect(result?.answer).not.toContain('del mismo año');
    });

    it('identifica el sector de la tabla cuando la fuente lo declara', () => {
      const content =
        'La remuneración mensual del auxiliar de educación del sector privado, conforme al siguiente detalle: Modalidad / Forma Nivel / Ciclo Jornada laboral Remuneración mensual S/ Educación Básica Regular - EBR Inicial 30 2 000,00 Primaria 30 2 000,00';
      const result = buildExtractiveSalaryAnswer(
        [
          source(content, {
            documentTitle: 'Escala privada',
            documentVersionId: 'version-privada',
            issuanceYear: 2026,
          }),
        ],
        '¿Cuánto gana un auxiliar en el sector privado?',
        'current',
      );

      expect(result?.answer).toContain(
        'La remuneración mensual del auxiliar de educación del sector privado',
      );
      expect(result?.hasVerifiedAmount).toBe(true);
    });

    it('conserva la excepción del profesor coordinador que trae otro monto', () => {
      const content = `${scheduleText(
        '3 500,70',
      )} 2.3 Los profesores contratados que prestan servicios como Profesor Coordinador en el Programa No Escolarizado de Educación Inicial o como Docente Coordinador en la ONDEC u ODEC perciben una remuneración mensual de S/ 4 667,60.`;
      const result = buildExtractiveSalaryAnswer(
        [
          source(content, {
            documentTitle: 'Escala con excepción',
            documentVersionId: 'version-excepcion',
            issuanceYear: 2026,
          }),
        ],
        '¿Cuánto gana un docente?',
        'current',
      );

      expect(result?.answer).toContain('S/ 3 500,70');
      expect(result?.answer).toContain(
        'Otras condiciones que constan en la misma fuente',
      );
      expect(result?.answer).toContain('S/ 4 667,60');
      expect(result?.answer).toContain('Profesor Coordinador');
    });

    it('no responde con el monto de otro año cuando no recuperó el pedido', () => {
      const result = buildExtractiveSalaryAnswer(
        [scheduleSource('3 500,70', 2026, 'nueva')],
        '¿Cuánto ganaba un docente en 2023?',
        'current',
      );

      expect(result).toBeNull();
    });

    it('responde con el monto del año pedido y no con el más reciente', () => {
      const result = buildExtractiveSalaryAnswer(
        [
          scheduleSource('3 500,70', 2026, 'nueva', 'replaced'),
          scheduleSource('2 850,00', 2023, 'antigua', 'replaced'),
        ],
        '¿Cuánto ganaba un docente en 2023?',
        'historical',
      );

      expect(result?.sources).toHaveLength(1);
      expect(result?.answer).toContain('En 2023');
      expect(result?.answer).toContain('S/ 2 850,00');
      expect(result?.answer).not.toContain('S/ 3 500,70');
    });
  });

  it('numera las fuentes adicionales sin huecos cuando una no se puede citar', () => {
    const primary = source(
      'La remuneración mensual del auxiliar de educación del sector público es S/ 2 000,00.',
      { chunkId: 'chunk-primary', documentVersionId: 'version-primary' },
    );
    const long = source(
      `La remuneración mensual del auxiliar de educación del sector público es ${'muy '.repeat(200)}S/ 2 100,00.`,
      { chunkId: 'chunk-long', documentVersionId: 'version-long' },
    );
    const short = source(
      'La remuneración mensual del auxiliar de educación del sector privado es S/ 3 000,00.',
      { chunkId: 'chunk-short', documentVersionId: 'version-short' },
    );

    const result = buildExtractiveSalaryAnswer(
      [primary, long, short],
      '¿Cuánto gana un auxiliar?',
      'current',
    );

    expect(result?.sources).toHaveLength(2);
    expect(result?.answer).toContain('sector privado es S/ 3 000,00. [2]');
    expect(result?.answer).not.toContain('[3]');
  });

  it('no responde «no encontré un monto» si otra fuente recuperada sí lo trae', () => {
    const noAmount = source(
      'La remuneración mensual del docente se establece por decreto supremo.',
      {
        chunkId: 'chunk-norma',
        documentVersionId: 'version-norma',
        issuanceYear: 2026,
      },
    );
    const amount = source(
      'La remuneración mensual del docente es S/ 3 500,70.',
      {
        chunkId: 'chunk-monto',
        documentVersionId: 'version-monto',
        issuanceYear: 2025,
      },
    );

    const result = buildExtractiveSalaryAnswer(
      [noAmount, amount],
      '¿Cuánto gana un docente?',
      'current',
    );

    expect(result?.hasVerifiedAmount).toBe(true);
    expect(result?.answer).not.toContain('Todavía no tengo el monto exacto');
    expect(result?.answer).toContain('S/ 3 500,70');
    expect(result?.sources).toHaveLength(1);
  });

  it('reconoce un importe escrito con «soles»', () => {
    const result = buildExtractiveSalaryAnswer(
      [
        source(
          'La remuneración mensual del auxiliar de educación es 3500 soles.',
        ),
      ],
      '¿Cuánto gana un auxiliar de educación?',
      'current',
    );

    expect(result?.hasVerifiedAmount).toBe(true);
    expect(result?.answer).toContain('3500 soles');
  });

  it('no cita una bonificación de 500 soles como sueldo', () => {
    const result = buildExtractiveSalaryAnswer(
      [
        source(
          'La remuneración mensual del auxiliar de educación incluye una bonificación de 500 soles.',
        ),
      ],
      '¿Cuánto gana un auxiliar de educación?',
      'current',
    );

    expect(result).toBeNull();
  });

  it('cita la norma del auxiliar aunque el numeral no lleve punto', () => {
    const result = buildExtractiveSalaryAnswer(
      [
        source(
          '4.13 Decreto Supremo N% 296-2016-EF, que establece monto, criterios y condiciones de la remuneración mensual, las asignaciones y bonificaciones por condiciones especiales del servicio, los beneficios, la remuneración vacacional y las vacaciones truncas a otorgarse a los Auxiliares de Educación nombrados y contratados.',
          { documentVersionId: 'version-auxiliares' },
        ),
      ],
      'cuanto gana un auxiliar?',
      'current',
    );

    expect(result?.answer).toContain('Todavía no tengo el monto exacto');
    expect(result?.answer).toContain('N.° 296-2016-EF');
    expect(result?.sources).toHaveLength(1);
  });

  it('responde la variante con error de escritura «auxliar» sin inventar un monto', () => {
    const result = buildExtractiveSalaryAnswer(
      [
        source(
          '4.13. Decreto Supremo N% 296-2016-EF, que establece monto, criterios y condiciones de la remuneración mensual, las asignaciones y bonificaciones por condiciones especiales del servicio, los beneficios, la remuneración vacacional y las vacaciones truncas a otorgarse a los Auxiliares de Educación nombrados y contratados.',
          { documentVersionId: 'version-auxiliares' },
        ),
      ],
      'cuanto gana un auxliar',
      'current',
    );

    expect(result).not.toBeNull();
    expect(result?.hasVerifiedAmount).toBe(false);
    expect(result?.answer).toContain('N.° 296-2016-EF');
    expect(result?.sources).toHaveLength(1);
  });

  it('no atribuye a la tabla el sector que solo declara otra oración', () => {
    const content =
      'La remuneración mensual del profesor contratado, conforme al siguiente detalle: Modalidad / Forma Nivel / Ciclo Jornada laboral Remuneración mensual S/ Educación Básica Regular - EBR Inicial 30 3 500,70 Primaria 30 3 500,70. El profesor del sector privado percibe una remuneración mensual distinta.';

    const result = buildExtractiveSalaryAnswer(
      [source(content, { documentVersionId: 'version-sectores' })],
      '¿Cuánto gana un docente?',
      'current',
    );

    expect(result?.answer).toContain(
      'La remuneración mensual del profesor contratado es',
    );
    expect(result?.answer).not.toContain('sector privado');
  });

  it('no responde un sector con una tabla que no lo declara', () => {
    const content =
      'La remuneración mensual del profesor contratado, conforme al siguiente detalle: Modalidad / Forma Nivel / Ciclo Jornada laboral Remuneración mensual S/ Educación Básica Regular - EBR Inicial 30 2 850,00 Primaria 30 2 850,00';

    const result = buildExtractiveSalaryAnswer(
      [source(content, { documentVersionId: 'version-sin-sector' })],
      '¿Cuánto gana un docente del sector público?',
      'current',
    );

    expect(result).toBeNull();
  });

  it('no toma «Carrera Pública Magisterial» como una declaración de sector', () => {
    const result = buildExtractiveSalaryAnswer(
      [
        source(
          'La remuneración del profesor en la Carrera Pública Magisterial se rige por la normativa vigente.',
        ),
      ],
      '¿Cuánto gana un docente del sector público?',
      'current',
    );

    expect(result).toBeNull();
  });

  it('no confunde el teléfono del aviso legal con un importe', () => {
    const ad =
      'La remuneración mensual del profesor contratado se rige por la normativa vigente y el Portal de Gestión de Atención al Cliente 915 248 103 915 248 103.';
    const table =
      'La remuneración mensual del profesor contratado, conforme al siguiente detalle: Modalidad / Forma Nivel / Ciclo Jornada laboral Remuneración mensual S/ Educación Básica Regular - EBR Inicial 30 3 500,70 Primaria 30 3 500,70';

    const result = buildExtractiveSalaryAnswer(
      [
        source(ad, {
          chunkId: 'chunk-aviso',
          documentVersionId: 'version-aviso',
          issuanceYear: 2026,
        }),
        source(table, {
          chunkId: 'chunk-tabla',
          documentVersionId: 'version-tabla',
          issuanceYear: 2026,
        }),
      ],
      '¿Cuánto gana un docente?',
      'current',
    );

    expect(result?.answer).toContain('S/ 3 500,70');
    expect(result?.answer).not.toContain('915 248 103');
  });

  it('reconoce un importe con tres enteros y decimales', () => {
    const result = buildExtractiveSalaryAnswer(
      [source('La remuneración mensual del docente es 3500.70.')],
      '¿Cuánto gana un docente?',
      'current',
    );

    expect(result?.hasVerifiedAmount).toBe(true);
    expect(result?.answer).toContain('3500.70');
  });

  it('no cita una bonificación en formato anglosajón como sueldo', () => {
    const result = buildExtractiveSalaryAnswer(
      [
        source(
          'La remuneración mensual del docente incluye una bonificación de 500.00.',
        ),
      ],
      '¿Cuánto gana un docente?',
      'current',
    );

    expect(result).toBeNull();
  });

  it('no presenta la remuneración vacacional como sueldo mensual', () => {
    const result = buildExtractiveSalaryAnswer(
      [
        source(
          'La remuneración vacacional del profesor contratado es S/ 1 200,00.',
        ),
      ],
      '¿Cuánto gana un docente?',
      'current',
    );

    expect(result).toBeNull();
  });

  it('reconoce el sector declarado en una columna de la tabla', () => {
    const result = buildExtractiveSalaryAnswer(
      [
        source(
          '| Cargo | Sector | Remuneración |\n| --- | --- | --- |\n| Docente | Público | S/ 3 500,70 |',
        ),
      ],
      '¿Cuánto gana un docente del sector público?',
      'current',
    );

    expect(result?.hasVerifiedAmount).toBe(true);
    expect(result?.answer).toContain('Docente');
    expect(result?.answer).toContain('S/ 3 500,70');
  });

  it('no responde un sector con una unidad que solo dice «se rige»', () => {
    const result = buildExtractiveSalaryAnswer(
      [
        source(
          'La remuneración mensual del auxiliar de educación del sector público se rige por la normativa vigente.',
        ),
      ],
      '¿Cuánto gana un auxiliar en el sector público?',
      'current',
    );

    expect(result).toBeNull();
  });

  it('etiqueta el año de una fuente adicional de otro período', () => {
    const publicTable =
      'La remuneración mensual del profesor contratado del sector público, conforme al siguiente detalle: Modalidad / Forma Nivel / Ciclo Jornada laboral Remuneración mensual S/ Educación Básica Regular - EBR Inicial 30 3 500,70 Primaria 30 3 500,70';
    const olderTable =
      'La remuneración mensual del profesor contratado, conforme al siguiente detalle: Modalidad / Forma Nivel / Ciclo Jornada laboral Remuneración mensual S/ Educación Básica Regular - EBR Inicial 30 3 300,60 Primaria 30 3 300,60';

    const result = buildExtractiveSalaryAnswer(
      [
        source(publicTable, {
          chunkId: 'chunk-2026',
          documentVersionId: 'version-2026',
          issuanceYear: 2026,
        }),
        source(olderTable, {
          chunkId: 'chunk-2025',
          documentVersionId: 'version-2025',
          issuanceYear: 2025,
        }),
      ],
      '¿Cuánto gana un docente?',
      'current',
    );

    expect(result?.answer).toContain('S/ 3 500,70');
    expect(result?.answer).toContain('Otra fuente de 2025');
    expect(result?.answer).toContain('S/ 3 300,60');
  });

  it('resume una escala adicional que no cabe en un solo monto y jornada', () => {
    const primaryTable =
      'La remuneración mensual del profesor contratado, conforme al siguiente detalle: Modalidad / Forma Nivel / Ciclo Jornada laboral Remuneración mensual S/ Educación Básica Regular - EBR Inicial 30 3 500,70 Primaria 30 3 500,70';
    const mixedTable =
      'La remuneración mensual del profesor contratado, conforme al siguiente detalle: Modalidad / Forma Nivel / Ciclo Jornada laboral Remuneración mensual S/ Educación Básica Regular - EBR Inicial 30 3 300,60 Primaria 40 3 300,60';

    const result = buildExtractiveSalaryAnswer(
      [
        source(primaryTable, {
          chunkId: 'chunk-primaria',
          documentVersionId: 'version-primaria',
          issuanceYear: 2026,
        }),
        source(mixedTable, {
          chunkId: 'chunk-mixta',
          documentVersionId: 'version-mixta',
          issuanceYear: 2026,
        }),
      ],
      '¿Cuánto gana un docente?',
      'current',
    );

    expect(result?.answer).toContain('no se puede resumir en un solo monto');
  });

  it.each([
    'La remuneración mensual del docente en una escuela pública es S/ 3 300,60.',
    'La remuneración mensual del docente de un centro educativo privado es S/ 4 000,00.',
    'La remuneración mensual del docente de un plantel público es S/ 3 300,60.',
    'La remuneración mensual del docente de gestión pública es S/ 3 300,60.',
  ])('reconoce el sector declarado en «%s»', (content) => {
    const result = buildExtractiveSalaryAnswer(
      [source(content, { documentVersionId: `version-${content.length}` })],
      content.includes('privado')
        ? '¿Cuánto gana un docente del sector privado?'
        : '¿Cuánto gana un docente del sector público?',
      'current',
    );

    expect(result).not.toBeNull();
    expect(result?.answer).toContain('S/');
  });

  it('acota la respuesta para no superar el límite de persistencia', () => {
    const headers = [
      'Cargo',
      ...Array.from(
        { length: 9 },
        (_, index) =>
          `Remuneración mensual de referencia número ${index} del docente`,
      ),
    ];
    const rows = Array.from(
      { length: 60 },
      () =>
        `| Docente | 3 500,70 | ${headers
          .slice(2)
          .map(() => '1')
          .join(' | ')} |`,
    );
    const markdown = [
      `| ${headers.join(' | ')} |`,
      `| ${headers.map(() => '---').join(' | ')} |`,
      ...rows,
    ].join('\n');

    const result = buildExtractiveSalaryAnswer(
      [source(markdown)],
      '¿Cuánto gana un docente?',
      'current',
    );

    expect(result?.answer.length).toBeLessThanOrEqual(20_000);
    expect(result?.answer).toContain('La respuesta se acortó por su extensión');
  });

  it('ordena por año aunque la recuperación llegue de la más antigua a la más nueva', () => {
    const content = (amount: string, year: number, id: string) =>
      source(
        `La remuneración mensual del profesor contratado, conforme al siguiente detalle: Modalidad / Forma Nivel / Ciclo Jornada laboral Remuneración mensual S/ Educación Básica Regular - EBR Inicial 30 ${amount} Primaria 30 ${amount} 2.2 El profesor contratado percibe la remuneración de forma proporcional a las horas contratadas.`,
        {
          chunkId: `chunk-${id}`,
          documentVersionId: `version-${id}`,
          issuanceYear: year,
        },
      );

    const result = buildExtractiveSalaryAnswer(
      [
        content('2 850,00', 2023, 'antigua'),
        content('3 300,60', 2025, 'media'),
        content('3 500,70', 2026, 'nueva'),
      ],
      '¿Cuánto gana un docente?',
      'current',
    );

    expect(result?.answer).toContain(
      'La remuneración mensual del profesor contratado es S/ 3 500,70',
    );
    expect(result?.answer).not.toContain('2 850,00');
    expect(result?.answer).not.toContain('3 300,60');
  });

  it('presenta el requisito del auxiliar sin lenguaje técnico y conserva la página', () => {
    const content =
      'Norma Técnica Código NORMA QUE REGULA EL PROCESO PARA LA CONTRATACIÓN DE AUXILIARES DE EDUCACIÓN EN LAS INSTITUCIONES EDUCATIVAS PÚBLICAS DE EDUCACIÓN BÁSICA REGULAR Y EDUCACIÓN BÁSICA ESPECIAL Página 17 de 41 6.2.6 La experiencia laboral en el cargo de auxiliar de educación se reconoce siempre que haya realizado su labor en instituciones educativas públicas, en condición de contratado, y la remuneración mensual del auxiliar de educación se fija por decreto supremo.';
    const result = buildExtractiveSalaryAnswer(
      [source(content, { documentVersionId: 'version-requisito' })],
      'cuanto gana un auxiliar?',
      'current',
    );

    expect(result?.answer).toContain(
      'Todavía no tengo el monto exacto del auxiliar de educación',
    );
    expect(result?.answer).toContain('Página 17 de 41 · 6.2.6');
    expect(result?.answer).not.toContain('Norma Técnica Código');
    expect(result?.answer).not.toContain('No se recuperó');
    expect(result?.answer).not.toContain('evidencia recuperada');
  });

  it('no cita un requisito de experiencia como explicación del sueldo', () => {
    const content =
      'Norma Técnica Código NORMA QUE REGULA EL PROCESO PARA LA CONTRATACIÓN DE AUXILIARES DE EDUCACIÓN EN LAS INSTITUCIONES EDUCATIVAS PÚBLICAS DE EDUCACIÓN BÁSICA REGULAR Y EDUCACIÓN BÁSICA ESPECIAL Página 17 de 41 6.2.6 La experiencia laboral en el cargo de auxiliar de educación se reconoce siempre que haya realizado su labor en instituciones educativas públicas, en condición de contratado, y para el puntaje es obligatorio presentar las constancias de haberes y descuentos o las boletas de pago mensuales.';
    const result = buildExtractiveSalaryAnswer(
      [source(content, { documentVersionId: 'version-experiencia' })],
      'cuanto gana un auxiliar?',
      'current',
    );

    expect(result?.answer).toContain(
      'Todavía no tengo el monto exacto del auxiliar de educación',
    );
    expect(result?.answer).not.toContain('constancias de haberes');
    expect(result?.answer).not.toContain('experiencia laboral');
    expect(result?.answer).toContain('[1]');
  });

  it('no cita «constancias de haberes son obligatorias» como sueldo', () => {
    const result = buildExtractiveSalaryAnswer(
      [
        source(
          'Para acreditar la experiencia del auxiliar de educación, las constancias de haberes son obligatorias y deben presentarse al postular.',
        ),
      ],
      'cuanto gana un auxiliar?',
      'current',
    );

    expect(result?.answer).toContain(
      'Todavía no tengo el monto exacto del auxiliar de educación',
    );
    expect(result?.answer).not.toContain('constancias de haberes');
    expect(result?.answer).toContain('[1]');
  });

  it('no recorta el contenido cuando la página aparece al final', () => {
    const result = buildExtractiveSalaryAnswer(
      [
        source(
          'Norma Técnica Código NORMA QUE REGULA EL PROCESO PARA LA CONTRATACIÓN DE AUXILIARES DE EDUCACIÓN EN LAS INSTITUCIONES EDUCATIVAS PÚBLICAS 6.2.6 La experiencia laboral en el cargo de auxiliar de educación se reconoce, y la remuneración mensual del auxiliar de educación se fija por decreto supremo Página 17 de 41',
        ),
      ],
      'cuanto gana un auxiliar?',
      'current',
    );

    expect(result?.answer).toContain(
      'la remuneración mensual del auxiliar de educación se fija por decreto supremo',
    );
    expect(result?.answer).not.toBe('Página 17 de 41 [1]');
  });

  it('reconoce una regla salarial conjugada en futuro o pasado', () => {
    const result = buildExtractiveSalaryAnswer(
      [
        source(
          'La remuneración mensual del auxiliar de educación será fijada cada año por decreto supremo.',
        ),
      ],
      'cuanto gana un auxiliar?',
      'current',
    );

    expect(result?.answer).toContain('será fijada cada año');
  });

  it('busca la regla salarial antes de recortar a dos unidades', () => {
    const result = buildExtractiveSalaryAnswer(
      [
        source(
          'La experiencia del auxiliar de educación se acredita con constancias de haberes y boletas de pago. La experiencia del auxiliar de educación en instituciones educativas públicas se reconoce con la resolución de contrato y las constancias de haberes. El sueldo del auxiliar de educación se define cada año en la escala institucional.',
        ),
      ],
      'cuanto gana un auxiliar?',
      'current',
    );

    expect(result?.answer).toContain('El sueldo del auxiliar de educación');
    expect(result?.answer).not.toContain('La experiencia del auxiliar');
  });

  it('declara que falta el monto del auxiliar y cita la norma que lo regula', () => {
    const result = buildExtractiveSalaryAnswer(
      [
        source(
          '4.13. Decreto Supremo N% 296-2016-EF, que establece monto, criterios y condiciones de la remuneración mensual, las asignaciones y bonificaciones por condiciones especiales del servicio, los beneficios, la remuneración vacacional y las vacaciones truncas a otorgarse a los Auxiliares de Educación nombrados y contratados.',
          {
            documentTitle: 'RVM 326-2017-MINEDU',
            documentVersionId: 'version-auxiliares',
          },
        ),
      ],
      'cuanto gana un auxiliar?',
      'current',
    );

    expect(result?.hasVerifiedAmount).toBe(false);
    expect(result?.sources).toHaveLength(1);
    expect(result?.answer).toContain('Todavía no tengo el monto exacto');
    expect(result?.answer).toContain('Decreto Supremo');
    expect(result?.answer).toContain('N.° 296-2016-EF');
    expect(result?.answer).toContain('Auxiliares de Educación');
    expect(result?.answer).toContain('[1]');
  });

  it('compara la RIM de nombrados con la tabla de contratados sin mezclar los regímenes', () => {
    const named = source(
      'Artículo 1.- Monto de la Remuneración Íntegra Mensual de la Primera Escala Magisterial. Se fija la RIM por hora de trabajo semanal-mensual correspondiente a la Primera Escala Magisterial.',
      {
        chunkId: 'named-rule',
        documentTitle: 'Decreto Supremo N.° 277-2025-EF',
        documentVersionId: 'ds-277',
        issuanceYear: 2025,
      },
    );
    const hourly = source(
      'La RIM por hora de trabajo semanal-mensual correspondiente a la Primera Escala Magisterial es S/ 116,69.',
      {
        chunkId: 'named-hourly-amount',
        documentTitle: 'Decreto Supremo N.° 277-2025-EF',
        documentVersionId: 'ds-277',
        issuanceYear: 2025,
      },
    );
    const contract = source(
      'Artículo 2.- Monto de la remuneración mensual a otorgarse al profesor contratado. El profesor contratado percibe una remuneración mensual según jornada, modalidad, forma, nivel o ciclo. Jornada laboral 30 horas: S/ 3 500,70.',
      {
        chunkId: 'contract-rule',
        documentTitle: 'Decreto Supremo N.° 277-2025-EF',
        documentVersionId: 'ds-277',
        issuanceYear: 2025,
      },
    );

    const result = buildExtractiveSalaryAnswer(
      [named, hourly, contract],
      '¿Cuál es la diferencia entre el sueldo de un docente nombrado y contratado?',
      'current',
    );

    expect(result?.answer).toContain('RIM por hora');
    expect(result?.answer).toContain('profesor contratado');
    expect(result?.answer).toContain('S/ 116,69');
    expect(result?.answer).toContain('S/ 3 500,70');
    expect(result?.answer).toContain('no determina por sí sola');
    expect(result?.sources).toEqual([named, hourly, contract]);
  });

  it('reconoce una fila contractual de 30 bajo el encabezado Jornada laboral', () => {
    const named = source(
      'Artículo 1.- Monto de la Remuneración Íntegra Mensual de la Primera Escala Magisterial. La RIM por hora de trabajo semanal-mensual es S/ 116,69.',
      { chunkId: 'named-table-header', documentVersionId: 'same-version' },
    );
    const contract = source(
      'Artículo 2.- El profesor contratado percibe una remuneración mensual según la jornada laboral. Modalidad Jornada laboral Remuneración mensual S/ EBR 30 3 500,70.',
      { chunkId: 'contract-table-header', documentVersionId: 'same-version' },
    );

    const result = buildExtractiveSalaryAnswer(
      [named, contract],
      '¿Cuál es la diferencia entre el sueldo de un docente nombrado y contratado?',
      'current',
    );

    expect(result?.answer).toContain('S/ 3 500,70');
  });

  it('no multiplica una fila de contratado como si fuera RIM por hora', () => {
    const result = buildExtractiveSalaryAnswer(
      [
        source(
          'Artículo 1.- Monto de la Remuneración Íntegra Mensual de la Primera Escala Magisterial. Artículo 2.- El profesor contratado percibe remuneración mensual. Jornada laboral 30 horas: S/ 3 500,70.',
          {
            chunkId: 'articulos-mezclados',
            documentVersionId: 'misma-version',
          },
        ),
      ],
      '¿Cuánto gana un profesor nombrado de primera escala con 30 horas?',
      'current',
    );

    expect(result).toBeNull();
  });

  it('calcula la primera escala solo cuando el importe declara RIM por hora', () => {
    const result = buildExtractiveSalaryAnswer(
      [
        source(
          'Artículo 1.- Monto de la Remuneración Íntegra Mensual de la Primera Escala Magisterial. La RIM por hora de trabajo semanal-mensual es S/ 116,69.',
          {
            chunkId: 'rim-horaria',
            documentVersionId: 'rim-horaria-version',
          },
        ),
      ],
      '¿Cuánto gana un profesor nombrado de primera escala con 30 horas?',
      'current',
    );

    expect(result?.answer).toContain('S/ 3 500,70');
  });

  it('une solo la continuación inmediata del artículo 1 al importe anterior al artículo 2', () => {
    const article = source(
      'Artículo 1.- Monto de la Remuneración Íntegra Mensual de la Primera Escala Magisterial. Fijar el monto de la RIM por hora de trabajo semanal-mensual correspondiente a la Primera Escala Magisterial de la Carrera Pública Magisterial a la que se refiere la Ley N.°',
      {
        chunkId: 'rim-articulo-1',
        documentVersionId: 'rim-partido',
        pageStart: 1,
        pageEnd: 1,
      },
    );
    const continuation = source(
      '29944, en la suma de S/ 116,69. Artículo 2.- El profesor contratado percibe una remuneración mensual. Jornada laboral 30 horas: S/ 3 500,70.',
      {
        chunkId: 'rim-continuacion',
        documentVersionId: 'rim-partido',
        pageStart: 2,
        pageEnd: 2,
      },
    );

    const result = buildExtractiveSalaryAnswer(
      [article, continuation],
      '¿Cuánto gana un profesor nombrado de primera escala con 30 horas?',
      'current',
    );

    expect(result?.answer).toContain('S/ 116,69');
    expect(result?.answer).toContain('S/ 3 500,70');
    expect(result?.sources).toEqual([article, continuation]);
  });

  it('no aplica la RIM docente a un auxiliar que comparte escala y jornada', () => {
    const result = buildExtractiveSalaryAnswer(
      [
        source(
          'Artículo 1.- Monto de la Remuneración Íntegra Mensual de la Primera Escala Magisterial. La RIM por hora de trabajo semanal-mensual es S/ 116,69.',
          { chunkId: 'rim-docente', documentVersionId: 'rim-docente-version' },
        ),
      ],
      '¿Cuánto gana un auxiliar nombrado de primera escala con 30 horas?',
      'current',
    );

    expect(result).toBeNull();
  });

  it('no sustituye una consulta de asignación rural por la tabla salarial', () => {
    expect(
      buildExtractiveSalaryAnswer(
        [
          source(
            'La remuneración mensual del profesor contratado con jornada de 30 horas es S/ 3 500,70.',
          ),
        ],
        'Si trabajo en una zona rural, ¿me corresponde una asignación?',
        'current',
      ),
    ).toBeNull();
  });

  it('limita la asignación rural a su padrón habilitante y a la fecha de la fuente', () => {
    const result = buildExtractiveSalaryAnswer(
      [
        source(
          'DECRETA: Artículo 1.- La asignación temporal por trabajo en ámbito rural se aplica según la clasificación de ruralidad.',
          { chunkId: 'asignacion-rural', issuanceYear: 2015 },
        ),
      ],
      'Si trabajo en una zona rural, ¿me corresponde una asignación?',
      'current',
    );

    expect(result?.answer).toContain('asignación por trabajo en ámbito rural');
    expect(result?.answer).toContain('año 2015');
    expect(result?.answer).toContain('no incluyen una regla actual');
    expect(result?.sources).toHaveLength(1);
  });

  it('explica el efecto en planilla del ascenso sin inventar un importe o automatismo', () => {
    const result = buildExtractiveSalaryAnswer(
      [
        source(
          'Actos resolutivos sobre situaciones administrativas que deriven en pago o descuento: ascenso de escala magisterial.',
          { chunkId: 'ascenso-planilla' },
        ),
      ],
      'Si asciendo de escala, ¿cambia mi remuneración?',
      'current',
    );

    expect(result?.answer).toContain('actos resolutivos');
    expect(result?.answer).toContain('no precisan un pago automático');
    expect(result?.answer).toContain('[1]');
    expect(result?.hasVerifiedAmount).toBe(false);
  });

  it('declara el límite temporal del padrón sin inferir una inclusión actual', () => {
    const result = buildExtractiveSalaryAnswer(
      [
        source('Anexo 1: Padrón de Instituciones Educativas Públicas rurales.', {
          chunkId: 'padron-2015',
          issuanceYear: 2015,
        }),
      ],
      '¿Cómo sé si mi institución figura en los padrones de ruralidad?',
      'current',
    );

    expect(result?.answer).toContain('año 2015');
    expect(result?.answer).toContain('no permite determinar tu caso hoy');
    expect(result?.sources).toHaveLength(1);
  });

  it('explica descuentos y responsabilidades sin inventar el reclamo personal', () => {
    const result = buildExtractiveSalaryAnswer(
      [
        source(
          'Las deducciones en la planilla única de pagos consideran la prelación y límites según el tipo de descuento.',
          { chunkId: 'deducciones' },
        ),
        source(
          'La Oficina de Personal emite los actos administrativos que derivan en pago o descuento de manera oportuna.',
          { chunkId: 'responsabilidad' },
        ),
      ],
      'Mi boleta tiene descuentos y diferencias remunerativas. ¿Cómo reclamo?',
      'current',
    );

    expect(result?.answer).toContain('deducciones en planilla');
    expect(result?.answer).toContain('Oficina de Personal');
    expect(result?.answer).toContain('no establecen un canal, plazo ni recurso');
    expect(result?.sources).toHaveLength(2);
  });
});
