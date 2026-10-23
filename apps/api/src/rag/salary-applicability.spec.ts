import type { RetrievedChunk } from './retrieval.gateway';
import {
  assessSalaryAnswerCoverage,
  canonicalAmount,
  hasGeneralSalaryEvidence,
  hasPersonalSalaryContext,
  hasSalaryPanoramaEvidence,
  isBroadSalaryQuestion,
  isGeneralRemunerationSource,
  isPersonalSalaryQuestion,
  isSalarySourceCompatible,
  isSpecialAllocationSource,
  salaryApplicabilityTier,
  salaryClarificationFor,
  salaryEvidenceProfile,
  salaryQuestionProfile,
  withInheritedSalaryFactors,
} from './salary-applicability';

function chunk(overrides: Partial<RetrievedChunk> = {}): RetrievedChunk {
  return {
    articleReference: null,
    chunkContent: 'Contenido.',
    chunkId: 'chunk-1',
    documentId: 'document-1',
    documentSituation: 'current',
    documentTitle: 'Norma interna',
    documentVersionId: 'version-1',
    issuanceYear: 2025,
    lexicalScore: 0.3,
    moduleIds: ['module-a'],
    moduleNames: ['Módulo A'],
    numeralReference: null,
    pageEnd: 1,
    pageStart: 1,
    sectionTitle: null,
    semanticScore: 0.7,
    versionNumber: 1,
    ...overrides,
  };
}

const general30 = chunk({
  chunkId: 'general-30',
  chunkContent:
    'La remuneración mensual del profesor de jornada de 30 horas es de S/ 3 300,60.',
  documentTitle: 'Decreto Supremo N.° 049-2025-EF',
  documentVersionId: 'version-2025',
  issuanceYear: 2025,
});

const general40 = chunk({
  chunkId: 'general-40',
  chunkContent:
    'La remuneración mensual del profesor de jornada de 40 horas es de S/ 4 400,80.',
  documentTitle: 'Resolución de Secretaría General N.° 300-2025-MINEDU',
  documentVersionId: 'version-2025-40',
  issuanceYear: 2025,
});

const allocation = chunk({
  chunkId: 'asignacion',
  chunkContent:
    'La asignación por función directiva asciende a S/ 2 666,80 mensuales.',
  documentTitle: 'Resolución Ministerial N.° 100-2023-MINEDU',
  documentVersionId: 'version-asignacion',
  issuanceYear: 2023,
});

const historicalAmount = chunk({
  chunkId: 'historico',
  chunkContent:
    'La remuneración mensual de los docentes fue de S/ 2 000,10 como incremento.',
  documentSituation: 'replaced',
  documentTitle: 'Resolución de Secretaría General N.° 121-2018-MINEDU',
  documentVersionId: 'version-2018',
  issuanceYear: 2018,
});

describe('salaryQuestionProfile', () => {
  it('reconoce la consulta salarial y los factores que ya declara', () => {
    expect(
      salaryQuestionProfile(
        '¿Cuánto gana un profesor contratado de 30 horas del 2025?',
      ),
    ).toEqual({
      asksSpecialAllocation: false,
      condition: 'contratado',
      isSalaryQuestion: true,
      jornadaHours: 30,
      role: 'docente',
      scale: null,
      year: 2025,
    });
  });

  it('reconoce el cargo directivo también en singular', () => {
    expect(
      salaryQuestionProfile('¿Cuánto es la asignación de un directivo?').role,
    ).toBe('directivo');
  });

  it('no confunde una consulta no salarial con una consulta de montos', () => {
    expect(
      salaryQuestionProfile('¿Cuál es el plazo para solicitar una licencia?')
        .isSalaryQuestion,
    ).toBe(false);
  });

  it.each([
    'Según la Resolución de Secretaría General N.° 121-2018-MINEDU, ¿cuál es la finalidad del instructivo para la elaboración y aprobación de la planilla de pagos?',
    '¿Cuál es el objetivo de la norma de remuneraciones?',
    '¿Para qué sirve el instructivo de pagos?',
    '¿Cuál es la finalidad de la norma de registro y control de pagos?',
    'Explícame la finalidad del instructivo para la elaboración y aprobación de la planilla de pagos.',
    'Dime la finalidad del instructivo de pagos.',
    'Necesito saber la finalidad del instructivo de pagos.',
    '¿Cuál es la finalidad del instructivo para la formulación y evaluación de la planilla de pagos?',
    '¿Cuál es la finalidad del instructivo para la elaboración, aprobación y difusión de la planilla de pagos?',
    '¿Cuál es la finalidad de la RSG 121-2018-MINEDU sobre la planilla de pagos?',
    '¿Cuál es la finalidad de la RSG N.° 121-2018-MINEDU sobre la planilla de pagos?',
    '¿Podrías decirme cuál es la finalidad del instructivo de pagos?',
    '¿Me puedes decir cuál es la finalidad del instructivo de pagos?',
    '¿Me indicas cuál es la finalidad del instructivo de pagos?',
    'Necesito saber cuál es la finalidad del instructivo de pagos.',
    'Quisiera saber cuál es la finalidad del instructivo de pagos.',
    'Me gustaría conocer cuál es la finalidad del instructivo de pagos.',
  ])(
    'no convierte la finalidad de un documento en un monto: %s',
    (question) => {
      expect(salaryQuestionProfile(question).isSalaryQuestion).toBe(false);
      expect(
        salaryClarificationFor(question, [general30, general40]),
      ).toBeNull();
      expect(
        withInheritedSalaryFactors(question, [
          '¿Cuánto gana un profesor contratado?',
          'Jornada de 30 horas en 2025',
        ]),
      ).toBe(question);
    },
  );

  it.each([
    'Según la RSG 121-2018-MINEDU, ¿cuál es la remuneración del profesor?',
    'Necesito información sobre el pago de un profesor.',
    '¿Cuál es la finalidad del instructivo de pagos y cuánto gana un profesor?',
    '¿Para qué sirve el instructivo de pagos y cuál es la remuneración del profesor?',
    '¿Cuál es el objetivo de la norma de pagos? Calcula el monto que me corresponde.',
    '¿Cuál es la finalidad del instructivo de pagos? Indícame mi sueldo.',
    '¿Cuál es la finalidad del instructivo de pagos y qué percibiría un profesor?',
    '¿Cuál es la finalidad del instructivo de pagos? Detalla el sueldo del profesor.',
    '¿Cuál es la finalidad del instructivo de pagos y qué pago me toca?',
    '¿Cuál es la finalidad del instructivo de pagos y el sueldo que recibe un profesor?',
    '¿Cuál es la finalidad del instructivo de pagos? Además, necesito saber el sueldo de un profesor.',
    '¿Cuál es la finalidad del instructivo de pagos, así como el sueldo que recibe un profesor?',
    '¿Para qué sirve el instructivo de pagos al calcular el monto de la remuneración?',
    '¿Cuál es la finalidad del instructivo de pagos y el haber mensual de un director?',
    '¿Cuál es la finalidad del instructivo de pagos y la retribución mensual de un profesor?',
    'Necesito conocer la remuneración del profesor antes de que me expliques cuál es la finalidad del instructivo de pagos.',
    '¿Cuál es la finalidad del reglamento de evaluación y remuneración del docente?',
    '¿Cuál es la finalidad de la resolución y remuneración docente?',
    '¿Cuál es la finalidad del instructivo de pagos que menciona S/ 3300,60?',
  ])('conserva los controles ante un pedido salarial: %s', (question) => {
    expect(salaryQuestionProfile(question).isSalaryQuestion).toBe(true);
    // El pedido salarial se conserva y filtra las fuentes por sus factores.
    // Una consulta general ya no se reemplaza por una aclaración; una que
    // pregunta por el propio caso puede seguir pidiendo el dato decisivo.
    if (isBroadSalaryQuestion(question)) {
      expect(
        salaryClarificationFor(question, [general30, general40]),
      ).toBeNull();
    } else {
      expect(isPersonalSalaryQuestion(question)).toBe(true);
    }
  });

  it('mantiene la aclaración para una pregunta por el propio sueldo', () => {
    expect(
      salaryClarificationFor('¿Cuánto gano yo como profesor?', [
        general30,
        general40,
      ])?.factor,
    ).toBe('jornada');
  });

  it('mantiene el filtro de jornada en otra cláusula salarial sin verbo de cobro', () => {
    const question =
      '¿Cuál es la finalidad del instructivo de pagos? También necesito conocer la remuneración mensual de un profesor de 30 horas.';
    expect(salaryQuestionProfile(question).isSalaryQuestion).toBe(true);
    expect(isSalarySourceCompatible(question, general40)).toBe(false);
    expect(isSalarySourceCompatible(question, general30)).toBe(true);
  });

  it('no añade los factores de dos turnos salariales a una finalidad documental nueva', () => {
    const question =
      'Según la RSG 121-2018-MINEDU, ¿cuál es la finalidad del instructivo para la elaboración y aprobación de la planilla de pagos?';
    const inherited = withInheritedSalaryFactors(question, [
      '¿Cuánto gana un profesor contratado?',
      'Jornada de 30 horas en 2025',
    ]);
    expect(inherited).toBe(question);
    expect(salaryQuestionProfile(inherited)).toMatchObject({
      isSalaryQuestion: false,
      condition: null,
      jornadaHours: null,
      year: null,
    });
  });
});

describe('clasificación de la evidencia salarial', () => {
  it('distingue la remuneración general de un concepto adicional', () => {
    expect(isGeneralRemunerationSource(general30)).toBe(true);
    expect(isGeneralRemunerationSource(allocation)).toBe(false);
    expect(isSpecialAllocationSource(allocation)).toBe(true);
    expect(isSpecialAllocationSource(general30)).toBe(false);
  });

  it('ignora los antecedentes al perfilar la evidencia vigente', () => {
    const profile = salaryEvidenceProfile([
      general30,
      historicalAmount,
      allocation,
    ]);

    expect(profile.general.map((source) => source.chunkId)).toEqual([
      'general-30',
    ]);
    expect(profile.special.map((source) => source.chunkId)).toEqual([
      'asignacion',
    ]);
  });
});

describe('salaryApplicabilityTier', () => {
  // Requisito 4: una asignación especial no puede encabezar la respuesta como
  // si fuera la remuneración general.
  it('prioriza la remuneración general y relega el concepto adicional', () => {
    expect(
      salaryApplicabilityTier('¿Cuánto gana un profesor?', general30),
    ).toBe(0);
    // «función directiva» describe el concepto, no un cargo contradictorio: la
    // asignación se relega (2) sin tratarse como incompatible (3).
    expect(
      salaryApplicabilityTier('¿Cuánto gana un profesor?', allocation),
    ).toBe(2);
  });

  it('prioriza el concepto adicional cuando la persona lo pidió', () => {
    expect(
      salaryApplicabilityTier(
        '¿Cuánto es la asignación por directivo?',
        allocation,
      ),
    ).toBe(0);
    expect(
      salaryApplicabilityTier('¿Cuánto es la asignación?', general30),
    ).toBe(1);
  });

  it('relega y excluye una cifra que contradice un factor declarado', () => {
    const director40 = chunk({
      chunkContent:
        'La remuneración mensual del director nombrado con jornada de 40 horas es de S/ 4 400,80.',
      chunkId: 'director-40',
    });
    const docente30 = chunk({
      chunkContent:
        'La remuneración mensual del docente nombrado con jornada de 30 horas es de S/ 3 300,60.',
      chunkId: 'docente-30',
    });
    const question = '¿Cuánto gana un docente nombrado de 30 horas?';

    expect(salaryApplicabilityTier(question, director40)).toBe(3);
    expect(isSalarySourceCompatible(question, director40)).toBe(false);
    expect(salaryApplicabilityTier(question, docente30)).toBe(0);
    expect(isSalarySourceCompatible(question, docente30)).toBe(true);
  });

  it.each([
    [
      '¿Cuánto gana un docente contratado?',
      'La remuneración mensual del docente nombrado es de S/ 3 300,60.',
    ],
    [
      '¿Cuánto gana un docente de escala 3?',
      'La remuneración mensual del docente de escala 2 es de S/ 3 300,60.',
    ],
    [
      '¿Cuánto gana un docente en 2025?',
      'La remuneración mensual del docente para el año 2024 es de S/ 3 300,60.',
    ],
  ])(
    'descarta una fuente que contradice un factor declarado: %s',
    (question, content) => {
      expect(
        isSalarySourceCompatible(question, chunk({ chunkContent: content })),
      ).toBe(false);
    },
  );

  it('no interviene en una consulta que no es salarial', () => {
    expect(salaryApplicabilityTier('¿Cuál es el plazo?', allocation)).toBe(0);
  });

  describe('cierre de la revisión independiente del punto 3', () => {
    const compatible = (question: string, content: string, year = 2025) =>
      isSalarySourceCompatible(
        question,
        chunk({ chunkContent: content, issuanceYear: year }),
      );

    // H-2: «Directiva» en singular es un tipo de norma, no un cargo.
    it('no toma «la presente Directiva» por el cargo directivo', () => {
      const content =
        'De acuerdo con la presente Directiva, la remuneración mensual del personal nombrado es de S/ 3 300,60.';
      expect(
        salaryQuestionProfile('¿Cuánto gana un profesor nombrado?').role,
      ).toBe('docente');
      expect(compatible('¿Cuánto gana un profesor nombrado?', content)).toBe(
        true,
      );
      expect(
        salaryQuestionProfile(
          '¿Cuánto es la remuneración según la Directiva de contratos?',
        ).role,
      ).toBeNull();
    });

    // H-1: el año de emisión y el año del número de norma no son el período.
    it('no excluye una fuente vigente por su año de emisión', () => {
      expect(
        compatible(
          '¿Cuánto gana un docente nombrado en 2026?',
          'La remuneración mensual del docente nombrado es de S/ 3 300,60.',
          2025,
        ),
      ).toBe(true);
    });

    it('no toma el año del número de una norma como período', () => {
      expect(
        compatible(
          '¿Cuánto gana un docente nombrado en 2026?',
          'Según la Resolución 049-2025-EF, la remuneración mensual del docente nombrado es de S/ 3 300,60.',
        ),
      ).toBe(true);
      expect(
        salaryQuestionProfile(
          'Según el DS 049-2025-EF, ¿cuánto gana un docente?',
        ).year,
      ).toBeNull();
    });

    it('no toma un inicio o un fin de servicio ni de vigencia como período', () => {
      expect(
        salaryQuestionProfile('Soy docente nombrado desde 2015, ¿cuánto gano?')
          .year,
      ).toBeNull();
      expect(
        compatible(
          '¿Cuánto gana un docente nombrado en 2025?',
          'A partir del 1 de enero de 2024 la remuneración mensual del docente nombrado es de S/ 3 300,60.',
        ),
      ).toBe(true);
    });

    it('sí excluye el año explícito de otro período', () => {
      expect(
        compatible(
          '¿Cuánto gana un docente nombrado en 2025?',
          'La remuneración mensual del docente nombrado para el año 2024 es de S/ 3 300,60.',
        ),
      ).toBe(false);
    });

    // M-1: romanos y tablas aplanadas.
    it('reconoce la escala en números romanos y en una tabla aplanada', () => {
      expect(
        compatible(
          '¿Cuánto gana un docente de escala 3?',
          'La remuneración mensual del docente de la Escala III es de S/ 3 300,60.',
        ),
      ).toBe(true);
      expect(
        compatible(
          '¿Cuánto gana un docente de escala 3?',
          'Remuneración mensual: escala 1 S/ 2 000,00 escala 2 S/ 2 300,00 escala 3 S/ 2 600,00.',
        ),
      ).toBe(true);
      expect(
        compatible(
          '¿Cuánto gana un docente de escala 3?',
          'Remuneración mensual: escala 1 S/ 2 000,00 escala 2 S/ 2 300,00.',
        ),
      ).toBe(false);
    });

    // Ronda 2 (N-M3): un año que es un importe, una fecha o parte de una norma
    // con guiones separados no declara el período.
    it.each([
      'El importe es de S/ 2050,00 mensuales para el docente nombrado.',
      'Mediante la norma publicada el 20 de marzo de 2025 se fija la remuneración mensual del docente nombrado en S/ 3 300,60.',
      'Según la RVM 045 - 2025 - MINEDU, la remuneración mensual del docente nombrado es de S/ 3 300,60.',
    ])('no toma como período el año de «%s»', (content) => {
      expect(
        compatible('¿Cuánto gana un docente nombrado en 2026?', content),
      ).toBe(true);
    });

    // Ronda 3 (hallazgos 4 y 5): la fecha de la pregunta sí fija el período; la
    // de la evidencia no. Un año al final de oración y un importe sin decimales.
    it('la fecha de la pregunta fija el período y la de la evidencia no', () => {
      expect(
        salaryQuestionProfile(
          '¿Cuánto ganaba un docente al 31 de diciembre de 2024?',
        ).year,
      ).toBe(2024);
      expect(
        compatible(
          '¿Cuánto gana un docente nombrado en 2026?',
          'Publicada el 1.° de marzo del 2025, la remuneración mensual del docente nombrado es de S/ 3 300,60.',
        ),
      ).toBe(true);
    });

    it('un importe sin decimales no es un año, y un año al final de oración sí', () => {
      expect(
        compatible(
          '¿Cuánto gana un docente nombrado en 2026?',
          'El importe es de S/ 2050 mensuales para el docente nombrado.',
        ),
      ).toBe(true);
      expect(
        compatible(
          '¿Cuánto gana un docente nombrado en 2025?',
          'La remuneración mensual del docente nombrado es de S/ 3 300,60 para el año 2024. Aplica a todo el país.',
        ),
      ).toBe(false);
    });

    // Ronda 4 (M2): una fecha de un hecho personal no fija el período; solo la
    // que marca un punto en el tiempo.
    it('la fecha de ingreso de la persona no es el período consultado', () => {
      expect(
        salaryQuestionProfile(
          'Ingresé a la carrera el 15 de marzo de 2015, ¿cuál es mi remuneración?',
        ).year,
      ).toBeNull();
      expect(
        salaryQuestionProfile(
          '¿Cuál era la remuneración vigente al 31 de diciembre de 2024?',
        ).year,
      ).toBe(2024);
    });

    // Ronda 4 (L2): solo los meses reales delimitan una fecha.
    it('un número y «de» antes de una palabra que no es mes no es una fecha', () => {
      expect(
        compatible(
          '¿Cuánto gana un docente nombrado en 2026?',
          'La remuneración mensual del docente nombrado, tramo 2 de vigencia del 2025, es de S/ 3 300,60.',
        ),
      ).toBe(false);
    });

    // Ronda 4 (M3): la escala respondida con las palabras de la aclaración.
    it.each([
      ['Escala magisterial 2', '2'],
      ['Escala remunerativa III', '3'],
    ])('lee la escala de «%s»', (answer, scale) => {
      expect(salaryQuestionProfile(answer).scale).toBe(scale);
    });

    // Ronda 2 (N-L1): «Directivas» es el tipo de norma también en plural.
    it('no toma «las Directivas» por el cargo directivo', () => {
      expect(
        compatible(
          '¿Cuánto gana un profesor nombrado?',
          'Conforme a las Directivas aprobadas, la remuneración mensual del personal nombrado es de S/ 3 300,60.',
        ),
      ).toBe(true);
    });

    // M-2: un cargo de otra oración no describe la cifra.
    it('no excluye por un cargo mencionado fuera de la oración del importe', () => {
      expect(
        compatible(
          '¿Cuánto gana un docente?',
          'La remuneración mensual es de S/ 3 300,60. El Director de la UGEL remite el informe.',
        ),
      ).toBe(true);
    });
  });
});

describe('withInheritedSalaryFactors', () => {
  it('completa la respuesta a una aclaración con la consulta salarial previa', () => {
    const effective = withInheritedSalaryFactors('Sector público', [
      '¿Cuánto gana un profesor en el Perú?',
    ]);
    const profile = salaryQuestionProfile(effective);

    expect(effective.startsWith('Sector público')).toBe(true);
    expect(profile.isSalaryQuestion).toBe(true);
    expect(profile.role).toBe('docente');
  });

  it('hereda solo lo que el turno actual no declara y el actual manda', () => {
    const profile = salaryQuestionProfile(
      withInheritedSalaryFactors('¿y para 40 horas?', [
        '¿Cuánto gana un docente nombrado de 30 horas en 2025?',
      ]),
    );

    expect(profile).toMatchObject({
      condition: 'nombrado',
      isSalaryQuestion: true,
      jornadaHours: 40,
      role: 'docente',
      year: 2025,
    });
    expect(
      salaryQuestionProfile(
        withInheritedSalaryFactors('Soy contratado', [
          '¿Cuánto gana un docente nombrado?',
        ]),
      ).condition,
    ).toBe('contratado');
  });

  // Ronda 2 (N-H1): la jornada, el vínculo y la escala son de la persona que
  // los declaró; un seguimiento que cambia de cargo no los hereda.
  it('un cambio de cargo no hereda la jornada ni el vínculo del cargo anterior', () => {
    const profile = salaryQuestionProfile(
      withInheritedSalaryFactors('¿y un director?', [
        '¿Cuánto gana un docente contratado de 30 horas en la escala 2?',
      ]),
    );

    expect(profile).toMatchObject({
      condition: null,
      isSalaryQuestion: true,
      jornadaHours: null,
      role: 'directivo',
      scale: null,
    });
  });

  // Ronda 3 (hallazgo 1): el reinicio de un turno intermedio corta lo anterior.
  it('el cambio de cargo de un turno intermedio no se deshace en el siguiente', () => {
    const profile = salaryQuestionProfile(
      withInheritedSalaryFactors('¿y en 2025?', [
        '¿Cuánto gana un docente contratado de 30 horas en la escala 2?',
        '¿y un director?',
      ]),
    );

    expect(profile).toMatchObject({
      condition: null,
      isSalaryQuestion: true,
      jornadaHours: null,
      role: 'directivo',
      scale: null,
      year: 2025,
    });
  });

  it('el cambio de vínculo de un turno intermedio no recupera la escala anterior', () => {
    const profile = salaryQuestionProfile(
      withInheritedSalaryFactors('¿y en 2025?', [
        '¿Cuánto gana un docente nombrado de 30 horas en la escala 3?',
        '¿y si soy contratado?',
      ]),
    );

    expect(profile).toMatchObject({
      condition: 'contratado',
      jornadaHours: 30,
      role: 'docente',
      scale: null,
      year: 2025,
    });
  });

  it('la jornada respondida a una aclaración se suma a lo ya declarado', () => {
    const profile = salaryQuestionProfile(
      withInheritedSalaryFactors('Escala 2', [
        '¿Cuánto gana un docente nombrado?',
        'Jornada de 30 horas',
      ]),
    );

    expect(profile).toMatchObject({
      condition: 'nombrado',
      isSalaryQuestion: true,
      jornadaHours: 30,
      role: 'docente',
      scale: '2',
    });
  });

  // Ronda 4 (M4): el concepto adicional pedido en un turno intermedio que no
  // usa un término salarial sigue pidiéndose en el turno siguiente.
  it('conserva el concepto adicional pedido en un turno intermedio', () => {
    const profile = salaryQuestionProfile(
      withInheritedSalaryFactors('¿y para 30 horas?', [
        '¿Cuánto gana un docente nombrado?',
        '¿Y la compensación por tiempo de servicios?',
      ]),
    );

    expect(profile).toMatchObject({
      asksSpecialAllocation: true,
      isSalaryQuestion: true,
      jornadaHours: 30,
    });
  });

  it('un cambio de vínculo conserva la jornada y descarta la escala', () => {
    const profile = salaryQuestionProfile(
      withInheritedSalaryFactors('¿y si soy contratado?', [
        '¿Cuánto gana un docente nombrado de 30 horas en la escala 2?',
      ]),
    );

    expect(profile).toMatchObject({
      condition: 'contratado',
      jornadaHours: 30,
      role: 'docente',
      scale: null,
    });
  });

  it('el más reciente de los turnos previos prevalece', () => {
    expect(
      salaryQuestionProfile(
        withInheritedSalaryFactors('Sector público', [
          '¿Cuánto gana un docente de 30 horas?',
          '¿y uno de 40 horas?',
        ]),
      ).jornadaHours,
    ).toBe(40);
  });

  it('no inventa una consulta salarial donde no la hubo', () => {
    expect(
      withInheritedSalaryFactors('Sector público', [
        '¿Cuál es el plazo para solicitar una licencia?',
      ]),
    ).toBe('Sector público');
    expect(withInheritedSalaryFactors('¿Cuánto gana un docente?', [])).toBe(
      '¿Cuánto gana un docente?',
    );
  });

  it('un año heredado no queda anclado por un «desde» del turno actual', () => {
    expect(
      salaryQuestionProfile(
        withInheritedSalaryFactors('Trabajo desde marzo', [
          '¿Cuánto gana un docente en 2025?',
        ]),
      ).year,
    ).toBe(2025);
  });
});

describe('intención personal de una consulta salarial', () => {
  it.each([
    '¿Cuánto ganó un docente en 2024?',
    '¿Cuánto ganaría un docente?',
    '¿Cuánto gana un docente de 30 horas de trabajo?',
  ])('no marca como personal «%s»', (question) => {
    expect(isPersonalSalaryQuestion(question)).toBe(false);
  });

  it.each([
    '¿Cuánto gano yo como docente?',
    '¿Cuál es mi remuneración?',
    'Trabajo como docente, ¿cuál es mi sueldo?',
  ])('reconoce la primera persona en «%s»', (question) => {
    expect(
      isPersonalSalaryQuestion(question) ||
        hasPersonalSalaryContext(question, []),
    ).toBe(true);
  });

  it('reconoce «Soy nombrado» cuando el hilo ya era salarial', () => {
    expect(
      hasPersonalSalaryContext('Soy nombrado', ['¿Cuánto gana un docente?']),
    ).toBe(true);
  });

  it('conserva la intención personal de la consulta que abrió el hilo', () => {
    expect(
      hasPersonalSalaryContext('Nombrado', ['¿Cuánto gano yo como docente?']),
    ).toBe(true);
    expect(
      hasPersonalSalaryContext('Nombrado', ['¿Cuánto gana un docente?']),
    ).toBe(true);
  });

  it('no trata una pregunta completa de requisitos como intención personal', () => {
    expect(
      hasPersonalSalaryContext(
        '¿Cuáles son los requisitos para ser docente contratado?',
        ['¿Cuánto gana un docente?'],
      ),
    ).toBe(false);
  });

  it('no hereda la intención personal en una pregunta general nueva', () => {
    for (const question of [
      '¿Cuánto gana un director?',
      '¿Cuánto se gana en el sector público?',
      '¿Cuánto gana el personal nombrado?',
    ]) {
      expect(
        hasPersonalSalaryContext(question, ['¿Cuánto gano yo como docente?']),
      ).toBe(false);
    }
  });
});

describe('hasGeneralSalaryEvidence', () => {
  it('exige una fuente vigente en el alcance actual y acepta la histórica cuando se pide', () => {
    const historical = chunk({
      chunkContent:
        'La remuneración mensual del docente en 2018 era de S/ 2 000,00.',
      documentSituation: 'replaced',
    });
    expect(hasGeneralSalaryEvidence([historical], 'current')).toBe(false);
    expect(hasGeneralSalaryEvidence([historical], 'historical')).toBe(true);
    expect(
      hasGeneralSalaryEvidence(
        [
          chunk({
            chunkContent:
              'La remuneración mensual del docente es de S/ 3 300,60.',
            documentSituation: 'current',
          }),
        ],
        'historical',
      ),
    ).toBe(false);
    expect(hasGeneralSalaryEvidence([historical], 'archived_explicit')).toBe(
      false,
    );
  });
});

describe('hasSalaryPanoramaEvidence', () => {
  const auxiliarRule = chunk({
    chunkContent:
      'La remuneración mensual del auxiliar de educación es aquella que se encuentra establecida en la normativa vigente correspondiente.',
    documentTitle: 'Resolución Viceministerial N.° 158-2025-MINEDU',
  });

  it('acepta una regla de remuneración del rol aunque no contenga el monto', () => {
    expect(
      hasSalaryPanoramaEvidence(
        [auxiliarRule],
        'current',
        '¿cuánto gana un auxiliar de educación?',
      ),
    ).toBe(true);
  });

  it('no acepta una fuente que solo nombra otro cargo', () => {
    const docenteRule = chunk({
      chunkContent:
        'La remuneración mensual del docente se establece según la escala magisterial.',
    });
    expect(
      hasSalaryPanoramaEvidence(
        [docenteRule],
        'current',
        '¿cuánto gana un auxiliar de educación?',
      ),
    ).toBe(false);
  });

  it('tampoco acepta un monto que corresponde exclusivamente a otro cargo', () => {
    const docenteRule = chunk({
      chunkContent: 'La remuneración mensual del docente es de S/ 3 300,60.',
    });
    expect(
      hasSalaryPanoramaEvidence(
        [docenteRule],
        'current',
        '¿cuánto gana un auxiliar de educación?',
      ),
    ).toBe(false);
  });

  it('no presume que una regla sin cargo identificado aplique al auxiliar', () => {
    const generalRule = chunk({
      chunkContent:
        'La remuneración mensual se fija en la normativa vigente correspondiente.',
    });
    expect(
      hasSalaryPanoramaEvidence(
        [generalRule],
        'current',
        '¿cuánto gana un auxiliar de educación?',
      ),
    ).toBe(false);
  });

  it('no habilita el panorama con un concepto adicional ni fuera del alcance', () => {
    const bonusOnly = chunk({
      chunkContent:
        'La bonificación por escolaridad se abona una vez al año al personal.',
    });
    expect(
      hasSalaryPanoramaEvidence(
        [bonusOnly],
        'current',
        '¿cuánto gana un auxiliar de educación?',
      ),
    ).toBe(false);

    const historicalRule = chunk({
      ...auxiliarRule,
      documentSituation: 'replaced',
    });
    expect(
      hasSalaryPanoramaEvidence(
        [historicalRule],
        'current',
        '¿cuánto gana un auxiliar de educación?',
      ),
    ).toBe(false);
    expect(
      hasSalaryPanoramaEvidence(
        [historicalRule],
        'historical',
        '¿cuánto gana un auxiliar de educación?',
      ),
    ).toBe(true);
  });

  it('mantiene el panorama cuando la evidencia general sí trae monto', () => {
    expect(
      hasSalaryPanoramaEvidence(
        [general30],
        'current',
        '¿cuánto gana un docente?',
      ),
    ).toBe(true);
  });
});

describe('tablas salariales multicondición', () => {
  const table = chunk({
    chunkContent: [
      '| Jornada | Remuneración |',
      '| --- | --- |',
      '| 30 horas | S/ 3 300,60 |',
      '| 40 horas | S/ 4 400,80 |',
    ].join('\n'),
  });

  it('lee la jornada del encabezado y no aplica una fila de otra jornada', () => {
    expect(
      isSalarySourceCompatible('¿Cuánto gana un profesor de 20 horas?', table),
    ).toBe(false);
    expect(
      isSalarySourceCompatible('¿Cuánto gana un profesor de 40 horas?', table),
    ).toBe(true);
  });

  it('pide la jornada cuando la tabla contiene dos filas válidas', () => {
    expect(
      salaryClarificationFor('¿Cuánto gano yo como profesor?', [table])?.factor,
    ).toBe('jornada');
  });

  it('detecta un importe atribuido a la fila de otra jornada', () => {
    expect(
      assessSalaryAnswerCoverage(
        'Para 30 horas, la remuneración es S/ 4 400,80. [1]',
        [table],
      ),
    ).not.toBeNull();
    expect(
      assessSalaryAnswerCoverage(
        'Para 30 horas, la remuneración es S/ 3 300,60. [1]',
        [table],
      ),
    ).toBeNull();
  });

  it('detecta una tabla de respuesta con el encabezado capitalizado', () => {
    expect(
      assessSalaryAnswerCoverage(
        [
          '| Jornada | Remuneración |',
          '| --- | --- |',
          '| 30 horas | S/ 4 400,80 [1] |',
        ].join('\n'),
        [table],
      ),
    ).not.toBeNull();
  });

  it('valida una tabla del modelo aunque la fuente sea texto plano', () => {
    const flat = chunk({
      chunkContent:
        'La remuneración del docente con jornada de 30 horas es de S/ 3 300,60. La remuneración con jornada de 40 horas es de S/ 4 400,80.',
    });
    expect(
      assessSalaryAnswerCoverage(
        [
          '| Jornada | Remuneración |',
          '| --- | --- |',
          '| 30 horas | S/ 4 400,80 [1] |',
        ].join('\n'),
        [flat],
      ),
    ).not.toBeNull();
  });

  it('valida una respuesta plana contra una fuente plana con dos jornadas', () => {
    const flat = chunk({
      chunkContent:
        'La remuneración del docente con jornada de 30 horas es de S/ 3 300,60. La remuneración con jornada de 40 horas es de S/ 4 400,80.',
    });
    expect(
      assessSalaryAnswerCoverage(
        'Para 30 horas, la remuneración mensual es S/ 4 400,80. [1]',
        [flat],
        '¿Cuánto gano como docente de 30 horas?',
      ),
    ).not.toBeNull();
    expect(
      assessSalaryAnswerCoverage(
        'La remuneración mensual es S/ 4 400,80. [1]',
        [flat],
        '¿Cuánto gano como docente de 30 horas?',
      ),
    ).not.toBeNull();
    expect(
      assessSalaryAnswerCoverage(
        'Para 30 horas, la remuneración mensual es S/ 3 300,60. [1]',
        [flat],
        '¿Cuánto gano como docente de 30 horas?',
      ),
    ).toBeNull();
  });

  it('valida el cargo cuando la tabla lo declara y la pregunta lo precisa', () => {
    const cargoTable = chunk({
      chunkContent: [
        '| Cargo | Remuneración |',
        '| --- | --- |',
        '| Director | S/ 5 000,00 |',
        '| Docente | S/ 3 000,00 |',
      ].join('\n'),
    });
    expect(
      assessSalaryAnswerCoverage(
        'El docente gana S/ 5 000,00. [1]',
        [cargoTable],
        '¿Cuánto gana un director?',
      ),
    ).not.toBeNull();
    expect(
      assessSalaryAnswerCoverage(
        'El director gana S/ 5 000,00. [1]',
        [cargoTable],
        '¿Cuánto gana un director?',
      ),
    ).toBeNull();
  });

  it('exige el cargo de la pregunta docente si la fuente distingue cargos', () => {
    const cargoTable = chunk({
      chunkContent: [
        '| Cargo | Remuneración |',
        '| --- | --- |',
        '| Director | S/ 5 000,00 |',
        '| Docente | S/ 3 000,00 |',
      ].join('\n'),
    });
    expect(
      assessSalaryAnswerCoverage(
        'La remuneración mensual es S/ 5 000,00. [1]',
        [cargoTable],
        '¿Cuánto gana un docente?',
      ),
    ).not.toBeNull();
    expect(
      assessSalaryAnswerCoverage(
        'La remuneración mensual es S/ 3 000,00. [1]',
        [cargoTable],
        '¿Cuánto gana un docente?',
      ),
    ).toBeNull();
  });

  it('no aplica factores de la pregunta a una asignación especial', () => {
    const allocationTable = chunk({
      chunkContent: [
        '| Concepto | Monto |',
        '| --- | --- |',
        '| Asignación por jornada | S/ 500,00 |',
        '| Remuneración mensual | S/ 3 000,00 |',
      ].join('\n'),
    });
    expect(
      assessSalaryAnswerCoverage(
        'La asignación es S/ 500,00. [1]',
        [allocationTable],
        '¿Cuánto es la asignación por jornada de 30 horas?',
      ),
    ).toBeNull();
  });

  it('exige todos los factores de la pregunta aunque la respuesta declare uno', () => {
    const twoFactorTable = chunk({
      chunkContent: [
        '| Jornada | Vínculo | Remuneración |',
        '| --- | --- | --- |',
        '| 30 horas | nombrado | S/ 3 300,60 |',
        '| 30 horas | contratado | S/ 2 400,40 |',
      ].join('\n'),
    });
    expect(
      assessSalaryAnswerCoverage(
        'Para 30 horas, la remuneración es S/ 2 400,40. [1]',
        [twoFactorTable],
        '¿Cuánto gano yo como docente nombrado de 30 horas?',
      ),
    ).not.toBeNull();
    expect(
      assessSalaryAnswerCoverage(
        'Para 30 horas, la remuneración es S/ 3 300,60. [1]',
        [twoFactorTable],
        '¿Cuánto gano yo como docente nombrado de 30 horas?',
      ),
    ).toBeNull();
  });

  it('lee y valida la escala con dos puntos en una tabla', () => {
    const scaleTable = chunk({
      chunkContent: [
        '| Escala | Remuneración |',
        '| --- | --- |',
        '| 1 | S/ 3 300,60 |',
        '| 2 | S/ 4 400,80 |',
      ].join('\n'),
    });
    expect(
      isSalarySourceCompatible(
        '¿Cuánto gana un docente de escala 2?',
        scaleTable,
      ),
    ).toBe(true);
    expect(
      salaryClarificationFor('¿Cuánto gano yo como docente?', [scaleTable])
        ?.factor,
    ).toBe('escala');
    expect(
      assessSalaryAnswerCoverage(
        'Para la escala 1, la remuneración es S/ 4 400,80. [1]',
        [scaleTable],
      ),
    ).not.toBeNull();
  });
});

describe('salaryClarificationFor', () => {
  // Requisito 5: un monto histórico no compite con el vigente.
  it('no pide precisión cuando hay un monto general vigente aunque exista un antecedente', () => {
    expect(
      salaryClarificationFor('¿Cuánto gana un profesor en Perú?', [
        general30,
        historicalAmount,
      ]),
    ).toBeNull();
  });

  it('no pide precisión cuando la persona pidió expresamente el antecedente', () => {
    expect(
      salaryClarificationFor('¿Cuánto ganaba un profesor en el 2018?', [
        general30,
        historicalAmount,
      ]),
    ).toBeNull();
  });

  // Decisión del Product Owner (2026-10-18): una consulta general sobre
  // remuneración docente se responde con el panorama y sus condiciones; no se
  // reemplaza por una pregunta que retrase la información.
  it('no bloquea una consulta general aunque dos montos difieran por jornada', () => {
    expect(
      salaryClarificationFor('¿Cuánto gana un profesor?', [
        general30,
        general40,
      ]),
    ).toBeNull();
  });

  it('no pide precisión si la consulta ya declara la jornada', () => {
    expect(
      salaryClarificationFor('¿Cuánto gana un profesor de 30 horas?', [
        general30,
        general40,
      ]),
    ).toBeNull();
  });

  it('no bloquea una consulta general aunque los montos difieran por vínculo', () => {
    const named = chunk({
      chunkContent:
        'La remuneración mensual del docente nombrado es de S/ 3 300,60.',
      chunkId: 'nombrado',
      documentVersionId: 'version-nombrado',
    });
    const hired = chunk({
      chunkContent:
        'La remuneración mensual del docente contratado es de S/ 2 400,40.',
      chunkId: 'contratado',
      documentVersionId: 'version-contratado',
    });

    expect(
      salaryClarificationFor('¿Cuál es la remuneración del profesor?', [
        named,
        hired,
      ]),
    ).toBeNull();
  });

  it('mantiene la precisión cuando la persona pregunta por su propio caso', () => {
    const clarification = salaryClarificationFor(
      '¿Cuánto gano yo como profesor?',
      [general30, general40],
    );

    expect(clarification?.factor).toBe('jornada');
    expect(clarification?.message).toContain('¿tu jornada es de 30 o de 40');
  });

  it('no pide precisión cuando solo hay una cifra comparable', () => {
    expect(
      salaryClarificationFor('¿Cuánto gana un profesor?', [general30]),
    ).toBeNull();
  });

  // Hallazgo del cross-review: dos fuentes con el mismo monto no plantean
  // ninguna disyuntiva; preguntar por un factor sería una demora inútil.
  it('no pide precisión cuando las dos fuentes vigentes dicen el mismo monto', () => {
    const sameAmount2025 = chunk({
      chunkContent:
        'Según la RM N.° 049-2025-MINEDU, la remuneración mensual es de S/ 3 300,60.',
      chunkId: 'mismo-2025',
      documentVersionId: 'version-mismo-2025',
    });
    const sameAmount2026 = chunk({
      chunkContent:
        'Para el año 2026 la remuneración mensual es de S/ 3 300,60.',
      chunkId: 'mismo-2026',
      documentVersionId: 'version-mismo-2026',
    });

    expect(
      salaryClarificationFor('¿Cuánto gana un profesor?', [
        sameAmount2025,
        sameAmount2026,
      ]),
    ).toBeNull();
  });

  // Hallazgo del cross-review: un plazo no es una jornada. El factor se toma de
  // la oración que contiene el importe, no de todo el fragmento.
  it('no presenta un plazo como jornada laboral', () => {
    const withDeadline = chunk({
      chunkContent:
        'La remuneración mensual es de S/ 3 300,60 y se paga dentro de las 24 horas.',
      chunkId: 'plazo-24',
      documentVersionId: 'version-plazo-24',
    });
    const withHours = chunk({
      chunkContent: 'La remuneración mensual es de S/ 3 300,60.',
      chunkId: 'jornada-30',
      documentVersionId: 'version-jornada-30',
    });

    expect(
      salaryClarificationFor('¿Cuánto gana un profesor?', [
        withDeadline,
        withHours,
      ]),
    ).toBeNull();
  });

  // Hallazgo del cross-review: tampoco es jornada un plazo que dejó de estar
  // pegado a la cifra («el plazo máximo para presentar el recurso es de 48
  // horas»), ni cuando la lectura se apoya en todo el fragmento.
  it('no ofrece un plazo como jornada aunque el plazo esté en otra oración', () => {
    const deadline48 = chunk({
      chunkContent:
        'El plazo máximo para presentar el recurso es de 48 horas. La remuneración mensual es de S/ 3 300,60.',
      chunkId: 'plazo-48',
      documentVersionId: 'version-plazo-48',
    });
    const deadline36 = chunk({
      chunkContent:
        'El plazo máximo para resolver el recurso es de 36 horas. La remuneración mensual es de S/ 4 400,80.',
      chunkId: 'plazo-36',
      documentVersionId: 'version-plazo-36',
    });

    expect(
      salaryClarificationFor('¿Cuánto gana un profesor?', [
        deadline48,
        deadline36,
      ]),
    ).toBeNull();
  });

  // Hallazgos del cross-review: la jornada puede escribirse con palabras entre
  // «jornada» y la cifra o con la cifra entre paréntesis, y ningún plazo debe
  // colarse por esas formas.
  it('reconoce la jornada aunque no esté pegada a la cifra', () => {
    const variants: ReadonlyArray<readonly [string, string]> = [
      [
        'La jornada laboral del docente es de 30 horas. La remuneración mensual es de S/ 3 300,60.',
        'La jornada laboral del docente es de 40 horas. La remuneración mensual es de S/ 4 400,80.',
      ],
      [
        'La jornada semanal del docente es de 30 horas. La remuneración mensual es de S/ 3 300,60.',
        'La jornada semanal del docente es de 40 horas. La remuneración mensual es de S/ 4 400,80.',
      ],
      [
        'La jornada máxima es de 30 horas. La remuneración mensual es de S/ 3 300,60.',
        'La jornada máxima es de 40 horas. La remuneración mensual es de S/ 4 400,80.',
      ],
      [
        'La jornada de treinta (30) horas. La remuneración mensual es de S/ 3 300,60.',
        'La jornada de cuarenta (40) horas. La remuneración mensual es de S/ 4 400,80.',
      ],
    ];

    for (const [first, second] of variants) {
      const clarification = salaryClarificationFor(
        '¿Cuánto gano yo como profesor?',
        [
          chunk({
            chunkContent: first,
            chunkId: 'variante-30',
            documentVersionId: 'version-variante-30',
            semanticScore: 0.9,
          }),
          chunk({
            chunkContent: second,
            chunkId: 'variante-40',
            documentVersionId: 'version-variante-40',
            semanticScore: 0.85,
          }),
        ],
      );

      expect(clarification?.factor).toBe('jornada');
    }
  });

  it('no lee como jornada los plazos escritos de otras formas', () => {
    const variants: ReadonlyArray<readonly [string, string]> = [
      [
        'El trámite se atiende en 48 horas. La remuneración mensual es de S/ 3 300,60.',
        'El trámite se atiende en 36 horas. La remuneración mensual es de S/ 4 400,80.',
      ],
      [
        'La respuesta vence en 48 horas. La remuneración mensual es de S/ 3 300,60.',
        'La respuesta vence en 36 horas. La remuneración mensual es de S/ 4 400,80.',
      ],
      [
        'El plazo de 48 horas es perentorio. La remuneración mensual es de S/ 3 300,60.',
        'El plazo de 36 horas es perentorio. La remuneración mensual es de S/ 4 400,80.',
      ],
    ];

    for (const [first, second] of variants) {
      expect(
        salaryClarificationFor('¿Cuánto gana un profesor?', [
          chunk({
            chunkContent: first,
            chunkId: 'plazo-48',
            documentVersionId: 'version-plazo-48',
            semanticScore: 0.9,
          }),
          chunk({
            chunkContent: second,
            chunkId: 'plazo-36',
            documentVersionId: 'version-plazo-36',
            semanticScore: 0.85,
          }),
        ]),
      ).toBeNull();
    }
  });

  // Hallazgo del cross-review: las guardas de la ventana también necesitan su
  // propia prueba: la jornada no explica una cifra que la oración sitúa en un
  // plazo, ni una cifra que pertenece a otra oración.
  it('no lee como jornada el plazo cuando la jornada aparece antes en la oración', () => {
    const variants: ReadonlyArray<readonly [string, string]> = [
      [
        'La jornada del personal se regulariza dentro del plazo de 30 horas. La remuneración mensual es de S/ 3 300,60.',
        'La jornada del personal se regulariza dentro del plazo de 40 horas. La remuneración mensual es de S/ 4 400,80.',
      ],
      [
        'El plazo para la acreditación de la jornada es de 30 horas. La remuneración mensual es de S/ 3 300,60.',
        'El plazo para la acreditación de la jornada es de 40 horas. La remuneración mensual es de S/ 4 400,80.',
      ],
      [
        'La jornada se registra hasta 30 horas del cierre. La remuneración mensual es de S/ 3 300,60.',
        'La jornada se registra hasta 40 horas del cierre. La remuneración mensual es de S/ 4 400,80.',
      ],
    ];

    for (const [first, second] of variants) {
      expect(
        salaryClarificationFor('¿Cuánto gana un profesor?', [
          chunk({
            chunkContent: first,
            chunkId: 'jornada-plazo-30',
            documentVersionId: 'version-jornada-plazo-30',
            semanticScore: 0.9,
          }),
          chunk({
            chunkContent: second,
            chunkId: 'jornada-plazo-40',
            documentVersionId: 'version-jornada-plazo-40',
            semanticScore: 0.85,
          }),
        ]),
      ).toBeNull();
    }
  });

  it('no cruza la frontera de la oración para leer una jornada', () => {
    expect(
      salaryClarificationFor('¿Cuánto gana un profesor?', [
        chunk({
          chunkContent:
            'La jornada se fija por resolución. El pago se realiza en 48 horas. La remuneración mensual es de S/ 3 300,60.',
          chunkId: 'jornada-oracion-48',
          documentVersionId: 'version-jornada-oracion-48',
          semanticScore: 0.9,
        }),
        chunk({
          chunkContent:
            'La jornada se fija por resolución. El pago se realiza en 36 horas. La remuneración mensual es de S/ 4 400,80.',
          chunkId: 'jornada-oracion-36',
          documentVersionId: 'version-jornada-oracion-36',
          semanticScore: 0.85,
        }),
      ]),
    ).toBeNull();
  });

  it('no lee como jornada un tiempo relativo al cierre', () => {
    expect(
      salaryClarificationFor('¿Cuánto gana un profesor?', [
        chunk({
          chunkContent:
            'La jornada se registra en el aplicativo 30 horas antes del cierre. La remuneración mensual es de S/ 3 300,60.',
          chunkId: 'jornada-antes-30',
          documentVersionId: 'version-jornada-antes-30',
          semanticScore: 0.9,
        }),
        chunk({
          chunkContent:
            'La jornada se registra en el aplicativo 40 horas antes del cierre. La remuneración mensual es de S/ 4 400,80.',
          chunkId: 'jornada-antes-40',
          documentVersionId: 'version-jornada-antes-40',
          semanticScore: 0.85,
        }),
      ]),
    ).toBeNull();
  });

  // La lectura estricta no puede perder una jornada legítima declarada fuera de
  // la oración del importe: ahí sí corresponde preguntar por la jornada.
  it('sigue leyendo la jornada declarada fuera de la oración del importe', () => {
    const jornada30 = chunk({
      chunkContent:
        'La jornada es de 30 horas. La remuneración mensual es de S/ 3 300,60.',
      chunkId: 'jornada-30-fuera',
      documentVersionId: 'version-jornada-30-fuera',
    });
    const jornada40 = chunk({
      chunkContent:
        'La jornada es de 40 horas. La remuneración mensual es de S/ 4 400,80.',
      chunkId: 'jornada-40-fuera',
      documentVersionId: 'version-jornada-40-fuera',
    });

    const clarification = salaryClarificationFor(
      '¿Cuánto gano yo como profesor?',
      [jornada30, jornada40],
    );

    expect(clarification?.factor).toBe('jornada');
    expect(clarification?.message).toContain('¿tu jornada es de 30 o de 40');
  });

  // Hallazgo del cross-review: el mismo monto escrito con otro formato (o con
  // una coma de cierre) sigue siendo el mismo monto.
  it('reconoce el mismo importe escrito con otro formato', () => {
    const formatted = chunk({
      chunkContent:
        'La remuneración mensual es de S/3300.60, y se abona en la planilla única.',
      chunkId: 'formato-punto',
      documentVersionId: 'version-formato-punto',
    });
    const spaced = chunk({
      chunkContent:
        'La remuneración mensual es de S/ 3 300,60 y se abona en la planilla única.',
      chunkId: 'formato-espacio',
      documentVersionId: 'version-formato-espacio',
    });

    expect(canonicalAmount('S/ 3 300,60')).toBe('3300.60');
    expect(canonicalAmount('S/3300.60,')).toBe('3300.60');
    expect(
      salaryClarificationFor('¿Cuánto gana un profesor?', [formatted, spaced]),
    ).toBeNull();
  });

  // El factor puede estar fuera de la oración del importe; en ese caso se lee
  // del fragmento completo en vez de perder una aclaración legítima.
  it('pide el vínculo cuando el dato está fuera de la oración del importe', () => {
    const named = chunk({
      chunkContent:
        'Aplica al personal nombrado. La remuneración mensual es de S/ 3 300,60.',
      chunkId: 'nombrado-fuera',
      documentVersionId: 'version-nombrado-fuera',
    });
    const hired = chunk({
      chunkContent:
        'Aplica al personal contratado. La remuneración mensual es de S/ 2 400,40.',
      chunkId: 'contratado-fuera',
      documentVersionId: 'version-contratado-fuera',
    });

    const clarification = salaryClarificationFor(
      '¿Cuál es mi remuneración como profesor?',
      [named, hired],
    );

    expect(clarification?.factor).toBe('condicion');
    expect(clarification?.message).toContain('nombrado');
  });

  it('no pide precisión en una consulta que no es salarial', () => {
    expect(
      salaryClarificationFor('¿Cuál es el plazo de la licencia?', [
        general30,
        general40,
      ]),
    ).toBeNull();
  });
});

describe('assessSalaryAnswerCoverage', () => {
  it('no atribuye al sector privado una cifra documentada para el público', () => {
    const publico = chunk({
      chunkContent:
        'La remuneración mensual del auxiliar de educación del sector público es S/ 2 000,00.',
    });
    expect(
      assessSalaryAnswerCoverage(
        'En el sector privado un auxiliar de educación gana S/ 2 000,00. [1]',
        [publico],
        '¿Cuánto gana un auxiliar de educación en el sector privado?',
      ),
    ).not.toBeNull();
    expect(
      assessSalaryAnswerCoverage(
        'En el sector público un auxiliar de educación gana S/ 2 000,00. [1]',
        [publico],
        '¿Cuánto gana un auxiliar de educación?',
      ),
    ).toBeNull();
  });

  it('no atribuye al auxiliar una cifra de personal administrativo', () => {
    const administrativo = chunk({
      chunkContent:
        'La remuneración mensual del personal administrativo es S/ 3 000,00.',
    });
    expect(
      assessSalaryAnswerCoverage(
        'El auxiliar de educación gana S/ 3 000,00. [1]',
        [administrativo],
        '¿Cuánto gana un auxiliar de educación?',
      ),
    ).not.toBeNull();
  });

  it('no mezcla cargo, concepto o sector entre cláusulas y fuentes', () => {
    const mixed = chunk({
      chunkContent:
        'La norma establece la remuneración del auxiliar de educación. La remuneración del personal administrativo asciende a S/ 3 000,00.',
    });
    const benefit = chunk({
      chunkContent:
        'La remuneración del auxiliar es S/ 2 000,00 y el beneficio es S/ 300,00.',
    });
    const publico = chunk({
      chunkContent:
        'La remuneración del auxiliar de educación del sector público es S/ 2 000,00.',
    });
    const privado = chunk({
      chunkContent:
        'La remuneración del profesor del sector privado es S/ 2 000,00.',
    });
    expect(
      assessSalaryAnswerCoverage(
        'El auxiliar gana S/ 3 000,00. [1]',
        [mixed],
        '¿Cuánto gana un auxiliar de educación?',
      ),
    ).not.toBeNull();
    expect(
      assessSalaryAnswerCoverage(
        'El auxiliar gana S/ 300,00. [1]',
        [benefit],
        '¿Cuánto gana un auxiliar de educación?',
      ),
    ).not.toBeNull();
    expect(
      assessSalaryAnswerCoverage(
        'El auxiliar privado gana S/ 2 000,00. [1] [2]',
        [publico, privado],
        '¿Cuánto gana un auxiliar de educación privado?',
      ),
    ).not.toBeNull();
    const negada = chunk({
      chunkContent: 'La remuneración del auxiliar privado no es S/ 2 000,00.',
    });
    expect(
      assessSalaryAnswerCoverage(
        'El auxiliar privado gana S/ 2 000,00. [1]',
        [negada],
        '¿Cuánto gana un auxiliar privado?',
      ),
    ).not.toBeNull();
    expect(
      assessSalaryAnswerCoverage(
        'La normativa establece el salario. [1] Se gana S/ 9 000,00.',
        [publico],
        '¿Cuánto gana?',
      ),
    ).not.toBeNull();
  });
  // Requisito 4: una asignación especial no se presenta como remuneración general.
  it('marca la respuesta que presenta una asignación como si fuera el sueldo', () => {
    const finding = assessSalaryAnswerCoverage(
      'Tu remuneración mensual es de S/ 2 666,80. [2]',
      [general30, allocation].map((source, index) => ({
        ...source,
        chunkId: index === 0 ? 'general-30' : 'asignacion',
      })),
    );

    expect(finding?.excerpt).toContain('S/ 2 666,80');
  });

  it('no marca la respuesta que sustenta la cifra en la remuneración general', () => {
    expect(
      assessSalaryAnswerCoverage(
        'Tu remuneración mensual es de S/ 3 300,60. [1]',
        [general30, allocation],
      ),
    ).toBeNull();
  });

  it('no interviene cuando no se entregó una remuneración general', () => {
    expect(
      assessSalaryAnswerCoverage('La asignación es de S/ 2 666,80. [1]', [
        allocation,
      ]),
    ).toBeNull();
  });

  it('marca una cifra que ninguna fuente con monto respalda', () => {
    const rule = chunk({
      chunkContent:
        'La remuneración del auxiliar de educación se establece en la normativa vigente.',
    });

    const finding = assessSalaryAnswerCoverage(
      'La remuneración del auxiliar de educación es de S/ 2 000,00. [1]',
      [rule],
      '¿Cuánto gana un auxiliar de educación?',
    );

    expect(finding?.excerpt).toContain('S/ 2 000,00');
  });

  // Hallazgo del cross-review: una oración que separa el concepto adicional de
  // la remuneración general no la presenta como sueldo.
  it('no marca una respuesta que separa expresamente el concepto adicional', () => {
    expect(
      assessSalaryAnswerCoverage(
        'La asignación por tiempo de servicio no forma parte de la remuneración mensual. [2]',
        [general30, allocation],
      ),
    ).toBeNull();
  });

  // …pero una frase que dice lo contrario sí se marca: la asignación no es la
  // remuneración general.
  it('marca la frase que presenta la asignación como la remuneración general', () => {
    expect(
      assessSalaryAnswerCoverage(
        'La asignación no es un bono, es tu remuneración mensual de S/ 2 666,80. [2]',
        [general30, allocation],
      )?.excerpt,
    ).toContain('S/ 2 666,80');
  });

  // Hallazgo del cross-review: la separación también se escribe con posesivo,
  // con la contracción «del» o con otros verbos equivalentes; no debe marcarse.
  it('no marca la separación escrita con posesivo, contracción u otro verbo', () => {
    expect(
      assessSalaryAnswerCoverage(
        'La asignación por tiempo de servicio no forma parte de sus haberes. [2]',
        [general30, allocation],
      ),
    ).toBeNull();
    expect(
      assessSalaryAnswerCoverage(
        'El bono no es tu remuneración mensual: se paga una vez al año por S/ 2 666,80. [2]',
        [general30, allocation],
      ),
    ).toBeNull();
    expect(
      assessSalaryAnswerCoverage(
        'La asignación de S/ 2 666,80 no forma parte del sueldo del docente. [2]',
        [general30, allocation],
      ),
    ).toBeNull();
    expect(
      assessSalaryAnswerCoverage(
        'El bono de S/ 2 666,80 no se incluye en la remuneración mensual. [2]',
        [general30, allocation],
      ),
    ).toBeNull();
    expect(
      assessSalaryAnswerCoverage(
        'La asignación de S/ 2 666,80 no reemplaza tu remuneración mensual. [2]',
        [general30, allocation],
      ),
    ).toBeNull();
    expect(
      assessSalaryAnswerCoverage(
        'La asignación de S/ 2 666,80 no reemplaza a la remuneración mensual. [2]',
        [general30, allocation],
      ),
    ).toBeNull();
  });

  // Hallazgo del cross-review: cuando la oración separa en un tramo y presenta
  // el concepto como sueldo en otro, la respuesta sí debe marcarse.
  it('marca la oración que se separa en un tramo y afirma el sueldo en otro', () => {
    expect(
      assessSalaryAnswerCoverage(
        'La asignación de S/ 2 666,80 no forma parte de tus haberes: es tu remuneración mensual. [2]',
        [general30, allocation],
      )?.excerpt,
    ).toContain('S/ 2 666,80');
    expect(
      assessSalaryAnswerCoverage(
        'El bono de S/ 2 666,80 no es tu sueldo: tu remuneración mensual es S/ 2 666,80. [2]',
        [general30, allocation],
      )?.excerpt,
    ).toContain('S/ 2 666,80');
  });

  it('marca una asignación citada desde un chunk que también contiene la remuneración general', () => {
    const mixed = chunk({
      chunkContent:
        'La remuneración mensual del docente es de S/ 3 300,60. La asignación especial por función directiva es de S/ 2 666,80.',
      chunkId: 'mixto',
    });

    expect(
      assessSalaryAnswerCoverage(
        'Tu remuneración mensual es de S/ 2 666,80. [1]',
        [mixed],
      )?.excerpt,
    ).toContain('S/ 2 666,80');
  });

  it('marca una fuente reemplazada presentada como vigente', () => {
    expect(
      assessSalaryAnswerCoverage(
        'La remuneración vigente es de S/ 2 000,10. [1]',
        [historicalAmount],
      )?.excerpt,
    ).toContain('vigente');
  });
});
