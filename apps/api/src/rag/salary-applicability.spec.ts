import type { RetrievedChunk } from './retrieval.gateway';
import {
  assessSalaryAnswerCoverage,
  canonicalAmount,
  isGeneralRemunerationSource,
  isSalarySourceCompatible,
  isSpecialAllocationSource,
  salaryApplicabilityTier,
  salaryClarificationFor,
  salaryEvidenceProfile,
  salaryQuestionProfile,
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
    expect(
      salaryApplicabilityTier('¿Cuánto gana un profesor?', allocation),
    ).toBe(3);
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

  // Requisito 11 del punto 3: se pide solo el dato que cambia la respuesta.
  it('pide la jornada cuando dos montos generales vigentes difieren por ella', () => {
    const clarification = salaryClarificationFor('¿Cuánto gana un profesor?', [
      general30,
      general40,
    ]);

    expect(clarification?.factor).toBe('jornada');
    expect(clarification?.message).toContain(
      '¿tu jornada es de 30 o de 40 horas?',
    );
    expect(clarification?.message).not.toContain('Encontré');
  });

  it('no pide precisión si la consulta ya declara la jornada', () => {
    expect(
      salaryClarificationFor('¿Cuánto gana un profesor de 30 horas?', [
        general30,
        general40,
      ]),
    ).toBeNull();
  });

  it('pide el vínculo cuando los montos difieren entre nombrado y contratado', () => {
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

    const clarification = salaryClarificationFor(
      '¿Cuál es la remuneración del profesor?',
      [named, hired],
    );

    expect(clarification?.factor).toBe('condicion');
    expect(clarification?.message).toContain('nombrado');
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
        '¿Cuánto gana un profesor?',
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

    const clarification = salaryClarificationFor('¿Cuánto gana un profesor?', [
      jornada30,
      jornada40,
    ]);

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
      '¿Cuál es la remuneración del profesor?',
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
