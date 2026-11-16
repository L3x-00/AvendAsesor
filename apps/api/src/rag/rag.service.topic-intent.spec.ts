import { RagService } from './rag.service';
import { detectTopicIntent } from './topic-intent';

/**
 * Chat general: la intención principal decide qué documentación responde. Una
 * fuente que solo comparte vocabulario laboral no debe desplazar a la norma del
 * tema ni convertir el turno en una lista de módulos alternativos.
 */

function vector(value = 0.1): number[] {
  return Array.from({ length: 1536 }, () => value);
}

const baseSource = {
  articleReference: null,
  chunkContent: 'Contenido recuperado.',
  chunkId: 'chunk-base',
  documentId: 'document-base',
  documentSituation: 'current' as const,
  documentTitle: 'Norma base',
  documentVersionId: 'version-base',
  lexicalScore: 0.5,
  moduleIds: ['module-base'],
  moduleNames: ['Módulo base'],
  numeralReference: null,
  pageEnd: 1,
  pageStart: 1,
  sectionTitle: null,
  semanticScore: 0.7,
  versionNumber: 1,
};

function setup() {
  const embeddings = {
    embed: jest
      .fn()
      .mockImplementation((queries: string[]) =>
        Promise.resolve(
          queries.map((_query, index) => vector(0.1 + index / 100)),
        ),
      ),
  };
  const gateway = {
    search: jest.fn(),
    searchExactReferences: jest.fn(),
  };
  const service = new RagService(embeddings, gateway, {
    get: jest.fn((key: string) => (key === 'RAG_MATCH_COUNT' ? 5 : 0.7)),
  } as never);
  return { embeddings, gateway, service };
}

const reassignmentSource = {
  ...baseSource,
  chunkContent:
    'La reasignación por unidad familiar procede cuando el profesor acredita que reside con su familia en la jurisdicción de destino.',
  chunkId: 'reassignment-chunk',
  documentId: 'reassignment-document',
  documentTitle: 'Norma técnica de la reasignación y permuta docente',
  documentVersionId: 'reassignment-version',
  moduleIds: ['contratacion'],
  moduleNames: ['Contratación y desplazamientos'],
  semanticScore: 0.74,
};

const ruralDecoy = {
  ...baseSource,
  chunkContent:
    'Asignación por trabajo en ámbito rural: monto mensual según la institución educativa pública.',
  chunkId: 'rural-chunk',
  documentId: 'rural-document',
  documentTitle: 'Modifica monto de asignación rural tipo 1',
  documentVersionId: 'rural-version',
  moduleIds: ['remuneraciones'],
  moduleNames: ['Remuneraciones'],
  semanticScore: 0.9,
};

const medicalSource = {
  ...baseSource,
  chunkContent:
    'Licencia por incapacidad temporal: se otorga conforme al periodo de descanso médico indicado en el certificado médico o CITT.',
  chunkId: 'medical-chunk',
  documentId: 'medical-document',
  documentTitle:
    'Norma Técnica de licencias, permisos y vacaciones de profesores',
  documentVersionId: 'medical-version',
  moduleIds: ['situaciones'],
  moduleNames: ['Situaciones Administrativas'],
  semanticScore: 0.75,
};

const rationalizationMention = {
  ...baseSource,
  chunkContent:
    'Son causales de conclusión del contrato el desplazamiento de personal titular como consecuencia del procedimiento de racionalización de personal excedente, reasignación o nombramiento.',
  chunkId: 'rationalization-mention',
  documentId: 'rationalization-document',
  documentTitle: 'Norma del proceso de contratación docente',
  documentVersionId: 'rationalization-version',
  moduleIds: ['contratacion'],
  moduleNames: ['Contratación y desplazamientos'],
  semanticScore: 0.82,
};

describe('RagService — intención temática del chat general', () => {
  it('conserva la contratación auxiliar en el seguimiento documental aunque otro submódulo tenga mayor similitud', async () => {
    const { gateway, service } = setup();
    const hiring = {
      ...baseSource,
      chunkId: 'hiring',
      documentTitle: 'Requisitos de contratación de auxiliares 2026',
      chunkContent:
        'La solicitud y la declaración jurada se presentan con el expediente de postulación a contratación de auxiliares de educación.',
      moduleIds: ['aux'],
      moduleNames: ['Auxiliar de educación'],
      moduleAssociations: [
        {
          rootModuleId: 'aux',
          rootModuleName: 'Auxiliar de educación',
          submoduleId: 'hiring-submodule',
          submoduleName: 'Contratación de auxiliares de educación',
        },
      ],
    };
    const administrative = {
      ...hiring,
      chunkId: 'administrative',
      documentId: 'admin',
      documentVersionId: 'admin-version',
      documentTitle: 'Situaciones administrativas de auxiliares',
      semanticScore: 0.99,
      moduleAssociations: [
        {
          ...hiring.moduleAssociations[0],
          submoduleId: 'admin-submodule',
          submoduleName: 'Situaciones administrativas',
        },
      ],
    };
    gateway.search.mockResolvedValue([administrative, hiring]);
    const question = '¿Y qué documentos deben presentar?';
    const history = [
      '¿Qué requisitos se exigen para postular a una plaza de auxiliar de educación en el proceso 2026?',
    ];

    await expect(
      service.retrieve(question, null, history),
    ).resolves.toMatchObject({
      kind: 'evidence',
      sources: [{ chunkId: 'hiring' }],
    });
    gateway.search.mockResolvedValue([administrative]);
    await expect(
      service.retrieve(question, null, history),
    ).resolves.toMatchObject({ kind: 'no_evidence' });
    await expect(
      service.retrieve(question, null, [
        '¿Cómo pido reasignación como auxiliar de educación?',
      ]),
    ).resolves.toMatchObject({ kind: 'evidence' });
    await expect(
      service.retrieve(question, null, [
        '¿Qué requisitos necesita un auxiliar de educación para una queja contra la dirección?',
      ]),
    ).resolves.toMatchObject({ kind: 'evidence' });
  });

  it('responde la reasignación con la norma del proceso y no con un beneficio rural', async () => {
    const { gateway, service } = setup();
    gateway.search.mockResolvedValue([ruralDecoy, reassignmentSource]);
    const question =
      'soy nombrado en junin pero quiero irme a lima porque mi familia vive alla que hago';

    const result = await service.retrieve(question, null, [], {
      topicIntent: detectTopicIntent(question),
    });

    expect(result.kind).toBe('evidence');
    if (result.kind !== 'evidence') return;
    expect(result.sources.map((source) => source.chunkId)).toContain(
      'reassignment-chunk',
    );
    expect(result.sources.map((source) => source.chunkId)).not.toContain(
      'rural-chunk',
    );
    expect(result.sources[0]?.documentTitle).toContain('reasignación');
  });

  it('responde la incapacidad temporal con la norma de licencias', async () => {
    const { gateway, service } = setup();
    gateway.search.mockResolvedValue([ruralDecoy, medicalSource]);
    const question =
      'el doctor me dio descanso por 15 dias como justifico eso en mi colegio';

    const result = await service.retrieve(question, null, [], {
      topicIntent: detectTopicIntent(question),
    });

    expect(result.kind).toBe('evidence');
    if (result.kind !== 'evidence') return;
    expect(result.sources.map((source) => source.chunkId)).toEqual([
      'medical-chunk',
    ]);
  });

  it('no convierte una mención incidental de racionalización en una respuesta del tema', async () => {
    const { gateway, service } = setup();
    gateway.search.mockResolvedValue([rationalizationMention]);
    const question =
      'en mi colegio estan bajando los alumnos y dicen que van a reducir plazas eso se puede';

    await expect(
      service.retrieve(question, null, [], {
        topicIntent: detectTopicIntent(question),
      }),
    ).resolves.toEqual({ kind: 'no_evidence', topRelevanceScore: null });
  });

  it('responde la condición de la plaza con su norma y no con una mención del destaque', async () => {
    const { gateway, service } = setup();
    const positionSource = {
      ...baseSource,
      chunkContent:
        'La plaza orgánica se crea por resolución de creación de la institución educativa; la plaza eventual se atiende con contrato mientras exista la necesidad de servicio.',
      chunkId: 'position-chunk',
      documentId: 'position-document',
      documentTitle: 'Norma sobre plazas orgánicas y eventuales',
      documentVersionId: 'position-version',
      moduleIds: ['cargos'],
      moduleNames: ['Cargos y plazas'],
      semanticScore: 0.78,
    };
    const destaqueMention = {
      ...baseSource,
      chunkContent:
        'El destaque se autoriza al profesor nombrado sin que pierda la plaza de origen en su institución educativa.',
      chunkId: 'destaque-mention',
      documentId: 'destaque-document',
      documentTitle: 'Norma técnica del destaque docente',
      documentVersionId: 'destaque-version',
      moduleIds: ['contratacion'],
      moduleNames: ['Contratación y desplazamientos'],
      semanticScore: 0.9,
    };
    const question = 'diferencia entre plaza organica y eventual';

    gateway.search.mockResolvedValue([destaqueMention]);
    await expect(
      service.retrieve(question, null, [], {
        topicIntent: detectTopicIntent(question),
      }),
    ).resolves.toEqual({ kind: 'no_evidence', topRelevanceScore: null });

    gateway.search.mockResolvedValue([destaqueMention, positionSource]);
    const result = await service.retrieve(question, null, [], {
      topicIntent: detectTopicIntent(question),
    });
    expect(result.kind).toBe('evidence');
    if (result.kind !== 'evidence') return;
    expect(result.sources.map((source) => source.chunkId)).toEqual([
      'position-chunk',
    ]);

    // Una norma del mismo módulo que solo menciona «plazas excedentes» regula la
    // racionalización, no la diferencia entre plaza orgánica y eventual.
    const rationalizationMention = {
      ...positionSource,
      chunkContent:
        'Las plazas excedentes se determinan al cierre del proceso de matrícula y se comunican a la UGEL.',
      chunkId: 'excedente-mention',
      documentId: 'excedente-document',
      documentTitle: 'Norma técnica de racionalización de plazas',
      documentVersionId: 'excedente-version',
      semanticScore: 0.95,
    };
    gateway.search.mockResolvedValue([rationalizationMention]);
    await expect(
      service.retrieve(question, null, [], {
        topicIntent: detectTopicIntent(question),
      }),
    ).resolves.toEqual({ kind: 'no_evidence', topRelevanceScore: null });
  });

  it('no responde el cuadro de distribución de horas con la jornada de un contrato', async () => {
    const { gateway, service } = setup();
    const hoursSource = {
      ...baseSource,
      chunkContent:
        'El cuadro de distribución de horas de clase se elabora antes del inicio del año escolar y lo aprueba la dirección de la institución educativa.',
      chunkId: 'hours-chunk',
      documentId: 'hours-document',
      documentTitle: 'Orientaciones para el cuadro de distribución de horas',
      documentVersionId: 'hours-version',
      moduleIds: ['cargos'],
      moduleNames: ['Cargos y plazas'],
      semanticScore: 0.76,
    };
    const contractHours = {
      ...baseSource,
      chunkContent:
        'El profesor contratado percibe una remuneración mensual de acuerdo con la jornada laboral de treinta horas establecida para la modalidad.',
      chunkId: 'contract-hours',
      documentId: 'contract-document',
      documentTitle: 'Norma del proceso de contratación docente',
      documentVersionId: 'contract-version',
      moduleIds: ['contratacion'],
      moduleNames: ['Contratación y desplazamientos'],
      semanticScore: 0.88,
    };
    const question =
      'que es el cuadro de distribucion de horas y para que lo usan';

    gateway.search.mockResolvedValue([contractHours]);
    await expect(
      service.retrieve(question, null, [], {
        topicIntent: detectTopicIntent(question),
      }),
    ).resolves.toEqual({ kind: 'no_evidence', topRelevanceScore: null });

    gateway.search.mockResolvedValue([contractHours, hoursSource]);
    const result = await service.retrieve(question, null, [], {
      topicIntent: detectTopicIntent(question),
    });
    expect(result.kind).toBe('evidence');
    if (result.kind !== 'evidence') return;
    expect(result.sources.map((source) => source.chunkId)).toEqual([
      'hours-chunk',
    ]);
  });

  it('una pregunta de destaque conserva su respuesta aunque nombre la plaza orgánica', async () => {
    const { gateway, service } = setup();
    const destaqueSource = {
      ...baseSource,
      chunkContent:
        'El destaque se autoriza al profesor nombrado para desempeñar funciones en otra institución educativa; durante el destaque conserva su plaza orgánica de origen.',
      chunkId: 'destaque-chunk',
      documentId: 'destaque-document',
      documentTitle: 'Norma técnica del destaque docente',
      documentVersionId: 'destaque-version',
      moduleIds: ['contratacion'],
      moduleNames: ['Contratación y desplazamientos'],
      semanticScore: 0.85,
    };
    gateway.search.mockResolvedValue([destaqueSource]);
    const question = 'durante el destaque sigo ocupando mi plaza organica';

    // El proceso nombrado manda: sin intención de «Cargos y plazas», la
    // respuesta sigue siendo la del destaque y no se convierte en ausencia.
    expect(detectTopicIntent(question)).toBeNull();
    const result = await service.retrieve(question, null, [], {
      topicIntent: detectTopicIntent(question),
    });

    expect(result.kind).toBe('evidence');
    if (result.kind !== 'evidence') return;
    expect(result.sources.map((source) => source.chunkId)).toEqual([
      'destaque-chunk',
    ]);
  });

  it('no responde el tema con una norma de encargatura aunque su sección nombre la plaza', async () => {
    const { gateway, service } = setup();
    const encargaturaSource = {
      ...baseSource,
      chunkContent:
        'La plaza orgánica es la plaza de origen que el profesor encargado conserva mientras dura la encargatura.',
      chunkId: 'encargatura-chunk',
      documentId: 'encargatura-document',
      documentTitle: 'Norma técnica de encargatura de cargos directivos',
      documentVersionId: 'encargatura-version',
      moduleIds: ['contratacion'],
      moduleNames: ['Contratación y desplazamientos'],
      sectionTitle: 'De la plaza orgánica',
      semanticScore: 0.9,
    };
    gateway.search.mockResolvedValue([encargaturaSource]);
    const question = 'diferencia entre plaza organica y eventual';

    await expect(
      service.retrieve(question, null, [], {
        topicIntent: detectTopicIntent(question),
      }),
    ).resolves.toEqual({ kind: 'no_evidence', topRelevanceScore: null });
  });

  it('no responde el cuadro de horas con la carga horaria de un contrato', async () => {
    const { gateway, service } = setup();
    const contractSource = {
      ...baseSource,
      chunkContent:
        'El profesor contratado cumple una carga horaria de treinta horas cronológicas semanales que se aprueba por resolución de la dirección.',
      chunkId: 'contract-section',
      documentId: 'contract-section-document',
      documentTitle: 'Norma del proceso de contratación docente',
      documentVersionId: 'contract-section-version',
      moduleIds: ['contratacion'],
      moduleNames: ['Contratación y desplazamientos'],
      sectionTitle: 'Carga horaria y jornada del contrato',
      semanticScore: 0.9,
    };
    gateway.search.mockResolvedValue([contractSource]);
    const question =
      'que es el cuadro de distribucion de horas y para que lo usan';

    await expect(
      service.retrieve(question, null, [], {
        topicIntent: detectTopicIntent(question),
      }),
    ).resolves.toEqual({ kind: 'no_evidence', topRelevanceScore: null });
  });

  it('no añade consultas del cuadro de horas a la respuesta elíptica de una cifra', async () => {
    const { embeddings, gateway, service } = setup();
    gateway.search.mockResolvedValue([]);
    const prior = 'cuanto gana un docente nombrado de secundaria';

    await service.retrieve('30 horas pedagogicas', null, [prior], {
      salaryContextQuestions: [prior],
    });

    const embedded = embeddings.embed.mock.calls.flatMap(
      (call: unknown[]) => call[0] as string[],
    );
    // La carga horaria es un factor del monto: el turno sigue siendo salarial.
    expect(
      embedded.some((query) =>
        query.includes('cuadro de distribución de horas'),
      ),
    ).toBe(false);
  });

  it('sin evidencia del ascenso no ofrece los módulos que solo comparten palabras', async () => {
    const { gateway, service } = setup();
    gateway.search.mockResolvedValue([ruralDecoy]);
    const question =
      'ya tengo varios años en primera escala como hago para subir a segunda';

    await expect(
      service.retrieve(question, null, [], {
        topicIntent: detectTopicIntent(question),
      }),
    ).resolves.toEqual({ kind: 'no_evidence', topRelevanceScore: null });
  });

  it('sin intención temática conserva el enrutamiento entre módulos', async () => {
    const { gateway, service } = setup();
    gateway.search.mockResolvedValue([
      { ...ruralDecoy, semanticScore: 0.9 },
      {
        ...medicalSource,
        chunkId: 'other-chunk',
        documentId: 'other-document',
        documentVersionId: 'other-version',
        semanticScore: 0.9,
      },
    ]);

    const result = await service.retrieve('¿Cómo solicito una licencia?', null);

    expect(result.kind).toBe('ambiguous');
  });

  it('un auxiliar recupera su propio procedimiento de reasignación', async () => {
    const { gateway, service } = setup();
    const auxiliaryReassignment = {
      ...baseSource,
      chunkContent:
        'La reasignación de los auxiliares de educación se solicita a la UGEL de destino con los requisitos del procedimiento.',
      chunkId: 'aux-reassignment',
      documentId: 'aux-document',
      documentTitle: 'Norma de situaciones administrativas de auxiliares',
      documentVersionId: 'aux-version',
      moduleIds: ['auxiliares'],
      moduleNames: ['Auxiliar de educación'],
      semanticScore: 0.78,
    };
    gateway.search.mockResolvedValue([
      reassignmentSource,
      auxiliaryReassignment,
    ]);
    const question =
      'soy auxiliar y quiero reasignarme a otra UGEL que necesito';

    const result = await service.retrieve(question, null, [], {
      topicIntent: detectTopicIntent(question),
    });

    expect(result.kind).toBe('evidence');
    if (result.kind !== 'evidence') return;
    expect(result.sources.map((source) => source.chunkId)).toContain(
      'aux-reassignment',
    );
    expect(result.sources.map((source) => source.chunkId)).not.toContain(
      'reassignment-chunk',
    );
  });

  it('no filtra una consulta salarial aunque reciba una intención de proceso', async () => {
    const { gateway, service } = setup();
    const salarySource = {
      ...baseSource,
      chunkContent:
        'La remuneración mensual del docente nombrado con descanso médico se rige por la norma vigente.',
      chunkId: 'salary-chunk',
      documentId: 'salary-document',
      documentTitle: 'Escala remunerativa',
      documentVersionId: 'salary-version',
      moduleIds: ['remuneraciones'],
      moduleNames: ['Remuneraciones'],
      semanticScore: 0.85,
    };
    gateway.search.mockResolvedValue([medicalSource, salarySource]);

    const result = await service.retrieve(
      '¿Cuánto gana un docente con descanso médico de 15 días?',
      null,
      [],
      {
        topicIntent: {
          id: 'medical-leave',
          label: 'la licencia por incapacidad temporal',
          moduleName: 'Situaciones Administrativas',
        },
      },
    );

    expect(result.kind).not.toBe('no_evidence');
    if (!('sources' in result)) return;
    expect(result.sources.map((source) => source.chunkId)).toContain(
      'salary-chunk',
    );
  });
});
