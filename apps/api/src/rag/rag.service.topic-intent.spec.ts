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
  return { gateway, service };
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
