import { Logger } from '@nestjs/common';
import { RagService } from './rag.service';

/**
 * El proceso del hilo entra en la búsqueda como vocabulario, nunca como hecho:
 * estas pruebas miran las consultas que se envían al proveedor de embeddings,
 * no la respuesta. Fijan además el costo: sin término del proceso en la
 * pregunta no hay una segunda búsqueda, y con término no se duplica.
 */
describe('RagService - contexto de proceso del hilo', () => {
  const vector = () => Array.from({ length: 1536 }, () => 0.01);

  function build() {
    const embeddings = {
      embed: jest
        .fn()
        .mockImplementation((queries: string[]) =>
          Promise.resolve(queries.map(() => vector())),
        ),
    };
    const gateway = { search: jest.fn().mockResolvedValue([]) };
    const service = new RagService(embeddings, gateway, {
      get: jest.fn((key: string) => (key === 'RAG_MATCH_COUNT' ? 5 : 0.5)),
    } as never);
    return { service, embeddings, gateway };
  }

  function embeddedQueries(embeddings: { embed: jest.Mock }): string[] {
    return (embeddings.embed.mock.calls as [string[]][]).flatMap(
      ([queries]) => queries,
    );
  }

  /**
   * Igual que `build`, pero el resultado de cada búsqueda depende de la
   * consulta que la originó (como en el corpus real). El gateway recibe el
   * vector, así que cada vector se registra junto a su texto.
   */
  function buildSearchable() {
    const queryByVector = new Map<number, string>();
    const embeddings = {
      embed: jest.fn().mockImplementation((queries: string[]) =>
        Promise.resolve(
          queries.map((query, index) => {
            const value = 0.1 + index / 100;
            queryByVector.set(value, query);
            return Array.from({ length: 1536 }, () => value);
          }),
        ),
      ),
    };
    const gateway = { search: jest.fn().mockResolvedValue([]) };
    const service = new RagService(embeddings, gateway, {
      get: jest.fn((key: string) => (key === 'RAG_MATCH_COUNT' ? 5 : 0.5)),
    } as never);
    const queryFor = (embedding: number[]): string =>
      queryByVector.get(embedding[0]) ?? '';
    return { service, embeddings, gateway, queryFor };
  }

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('busca la causal con la denominación del proceso que abrió el hilo', async () => {
    const { service, embeddings } = build();

    await service.retrieve(
      'que hacer para postular por causal de salud',
      null,
      ['como destacarme en otro colegio'],
    );

    const queries = embeddedQueries(embeddings);
    const inherited = queries.filter((query) =>
      query.includes('destaque docente'),
    );
    // La misma consulta canónica se reutiliza en el rescate léxico cuando la
    // similitud no deja candidatos; lo relevante es que todas lleven la causal.
    expect(inherited.length).toBeGreaterThan(0);
    expect(inherited.every((query) => query.includes('salud'))).toBe(true);
    // El mensaje persistido no se altera: solo la consulta de recuperación.
    expect(queries.some((query) => query.includes('postular'))).toBe(true);
  });

  it('hereda el proceso también dentro de un módulo seleccionado', async () => {
    const { service, embeddings } = build();

    await service.retrieve('y los requisitos?', 'module-con', [
      'quiero reasignarme a otra ugel porque mi familia vive alla',
    ]);

    expect(
      embeddedQueries(embeddings).some((query) =>
        query.includes('reasignación docente'),
      ),
    ).toBe(true);
  });

  it('no hereda el proceso si la consulta nombra su propio tema', async () => {
    const { service, embeddings } = build();

    await service.retrieve('que requisitos tiene la permuta', null, [
      'como destacarme en otro colegio',
    ]);

    expect(
      embeddedQueries(embeddings).some((query) =>
        query.includes('destaque docente'),
      ),
    ).toBe(false);
  });

  it('expande la forma verbal del destaque aunque no haya hilo', async () => {
    const { service, embeddings } = build();

    await service.retrieve('como destacarme', null);

    expect(
      embeddedQueries(embeddings).some((query) =>
        query.includes('destaque docente'),
      ),
    ).toBe(true);
  });

  it('no agrega una búsqueda cuando la pregunta ya usa el término', async () => {
    const { service, embeddings } = build();

    await service.retrieve('renovacion de destaque hay?', null);

    expect(
      embeddedQueries(embeddings).some((query) =>
        query.includes('destaque docente requisitos'),
      ),
    ).toBe(false);
  });

  const plazoChunk = {
    articleReference: null,
    chunkContent:
      'El plazo para presentar la solicitud es de quince días hábiles contados desde la publicación del cronograma.',
    chunkId: 'plazo-chunk',
    documentId: 'destaque-document',
    documentSituation: 'current' as const,
    documentTitle: 'RSG N.° 326-2017-MINEDU',
    documentVersionId: 'destaque-version',
    lexicalScore: 0,
    moduleIds: ['contratacion'],
    moduleNames: ['Contratación y desplazamientos'],
    numeralReference: null,
    pageEnd: 3,
    pageStart: 3,
    sectionTitle: 'Del plazo',
    semanticScore: 0.7,
    versionNumber: 1,
  };

  it('admite el fragmento que devolvió la consulta del proceso aunque no repita el término', async () => {
    const { service, gateway, queryFor } = buildSearchable();
    // El corpus responde el plazo con un párrafo que no vuelve a nombrar el
    // destaque. Lo que lo hace evidencia es que la búsqueda del proceso lo
    // recuperó con el umbral general, no que repita la palabra.
    gateway.search.mockImplementation(
      ({ embedding }: { embedding: number[] }) =>
        Promise.resolve(
          /destaque docente/.test(queryFor(embedding)) ? [plazoChunk] : [],
        ),
    );

    await expect(
      service.retrieve('y el plazo para presentar la solicitud?', null, [
        'como destacarme en otro colegio',
      ]),
    ).resolves.toMatchObject({
      kind: 'evidence',
      sources: [{ chunkId: 'plazo-chunk' }],
    });
  });

  it('no admite ese mismo fragmento si no procede de la búsqueda del proceso', async () => {
    const { service, gateway, queryFor } = buildSearchable();
    // Contramuestra: el fragmento no nombra el proceso y ninguna búsqueda del
    // proceso lo devolvió, así que no puede responder el seguimiento.
    gateway.search.mockImplementation(
      ({ embedding }: { embedding: number[] }) =>
        Promise.resolve(
          /destaque docente/.test(queryFor(embedding)) ? [] : [plazoChunk],
        ),
    );

    await expect(
      service.retrieve('y el plazo para presentar la solicitud?', null, [
        'como destacarme en otro colegio',
      ]),
    ).resolves.toMatchObject({ kind: 'no_evidence' });
  });

  it('admite el plazo del destaque aunque su sección nombre la plaza', async () => {
    const { service, gateway, queryFor } = buildSearchable();
    // Una norma de destaque titula «Plaza orgánica y plaza eventual» la sección
    // donde fija su propio plazo. La mención no convierte el fragmento en otro
    // proceso: los tres aspectos de «Cargos y plazas» se dirimen con la compuerta
    // del módulo, no con la señal de trámite ajeno.
    const anexoPlaza = {
      ...plazoChunk,
      chunkId: 'anexo-plaza',
      sectionTitle: 'Plaza orgánica y plaza eventual',
    };
    gateway.search.mockImplementation(
      ({ embedding }: { embedding: number[] }) =>
        Promise.resolve(
          /destaque docente/.test(queryFor(embedding)) ? [anexoPlaza] : [],
        ),
    );

    await expect(
      service.retrieve('y el plazo para presentar la solicitud?', null, [
        'como destacarme en otro colegio',
      ]),
    ).resolves.toMatchObject({
      kind: 'evidence',
      sources: [{ chunkId: 'anexo-plaza' }],
    });
  });

  const reassignmentPlazo = {
    ...plazoChunk,
    chunkContent:
      'El plazo para presentar la solicitud de reasignación docente por unidad familiar es de quince días hábiles.',
    chunkId: 'reassignment-plazo',
    documentId: 'reasignacion-document',
    documentTitle: 'Norma técnica de reasignación y permuta',
    documentVersionId: 'reasignacion-version',
  };

  it('la procedencia no entrega la norma de otro proceso', async () => {
    const { service, gateway, queryFor } = buildSearchable();
    // La búsqueda del destaque devuelve un vecino léxico del corpus que trata
    // la reasignación: citarlo sería responder otro proceso con apariencia de
    // evidencia.
    gateway.search.mockImplementation(
      ({ embedding }: { embedding: number[] }) =>
        Promise.resolve(
          /destaque docente/.test(queryFor(embedding))
            ? [reassignmentPlazo]
            : [],
        ),
    );

    await expect(
      service.retrieve('y el plazo para presentar la solicitud?', null, [
        'como destacarme en otro colegio',
      ]),
    ).resolves.toMatchObject({ kind: 'no_evidence' });
  });

  it('la procedencia no entrega la norma del otro régimen', async () => {
    const { service, gateway, queryFor } = buildSearchable();
    const auxiliaryQuestion =
      'y el plazo para presentar la solicitud de reasignacion?';
    const docenteChunk = {
      ...reassignmentPlazo,
      chunkContent:
        'La reasignación del profesor nombrado se solicita ante la UGEL de destino dentro del plazo de la norma técnica.',
      documentTitle: 'Norma técnica de reasignación y permuta',
    };
    // Hilo de un auxiliar: la consulta canónica es la de su régimen, pero el
    // corpus devuelve la norma de profesores. No puede responder ese hilo.
    gateway.search.mockImplementation(
      ({ embedding }: { embedding: number[] }) =>
        Promise.resolve(
          /auxiliares de educacion|auxiliares de educación/.test(
            queryFor(embedding),
          )
            ? [docenteChunk]
            : [],
        ),
    );

    await expect(
      service.retrieve(auxiliaryQuestion, null, [
        'soy auxiliar y quiero reasignarme a otra ugel',
      ]),
    ).resolves.toMatchObject({ kind: 'no_evidence' });
  });

  it('conserva el régimen auxiliar en la licencia heredada', async () => {
    const { service, gateway, queryFor } = buildSearchable();
    const docenteLicencia = {
      ...plazoChunk,
      chunkContent:
        'El profesor presenta su solicitud de licencia por incapacidad temporal con el certificado médico o CITT.',
      chunkId: 'docente-licencia',
      documentId: 'licencias-docentes',
      documentTitle: 'Norma técnica de licencias de profesores',
      documentVersionId: 'licencias-docentes-version',
    };
    const auxiliarLicencia = {
      ...docenteLicencia,
      chunkContent:
        'El auxiliar de educación presenta su solicitud de licencia por incapacidad temporal con el certificado médico o CITT.',
      chunkId: 'auxiliar-licencia',
      documentId: 'licencias-auxiliares',
      documentTitle: 'Norma técnica de licencias para auxiliares de educación',
      documentVersionId: 'licencias-auxiliares-version',
    };
    const history = ['soy auxiliar de educacion y necesito descanso medico'];
    // La búsqueda de la licencia devuelve las dos normas: solo la del régimen
    // de la persona puede responder el seguimiento.
    gateway.search.mockImplementation(
      ({ embedding }: { embedding: number[] }) =>
        Promise.resolve(
          /incapacidad temporal|descanso médico|descanso medico/.test(
            queryFor(embedding),
          )
            ? [docenteLicencia, auxiliarLicencia]
            : [],
        ),
    );

    const result = await service.retrieve('y los requisitos', null, history);
    expect(result).toMatchObject({ kind: 'evidence' });
    if (result.kind === 'evidence') {
      expect(result.sources.map((source) => source.chunkId)).toContain(
        'auxiliar-licencia',
      );
      expect(result.sources.map((source) => source.chunkId)).not.toContain(
        'docente-licencia',
      );
    }
  });

  it('admite el plazo de la norma conjunta en un hilo de reasignación', async () => {
    const { service, gateway, queryFor } = buildSearchable();
    const plazoConjunto = {
      ...plazoChunk,
      chunkContent:
        'El plazo para presentar la solicitud es de quince días hábiles.',
      chunkId: 'plazo-conjunto',
      documentTitle: 'Norma técnica de reasignación y permuta',
      sectionTitle: 'Del plazo',
    };
    // El título de la norma nombra los dos trámites; el plazo no repite el
    // nombre del proceso y aun así es la respuesta del seguimiento.
    gateway.search.mockImplementation(
      ({ embedding }: { embedding: number[] }) =>
        Promise.resolve(
          /reasignaci/.test(queryFor(embedding)) ? [plazoConjunto] : [],
        ),
    );

    await expect(
      service.retrieve('y el plazo para presentar la solicitud?', null, [
        'soy docente nombrado y quiero reasignarme a otra ugel',
      ]),
    ).resolves.toMatchObject({
      kind: 'evidence',
      sources: [{ chunkId: 'plazo-conjunto' }],
    });
  });

  it('no cita el fragmento de la misma versión que la compuerta rechazó', async () => {
    const { service, gateway, queryFor } = buildSearchable();
    // La norma regula todas las causales en la misma versión: la búsqueda del
    // proceso devuelve la licencia propia y la de la pregunta devuelve la de
    // paternidad. La versión admitida no puede arrastrar al hermano rechazado
    // hasta la cita de la respuesta.
    const salud = {
      ...plazoChunk,
      chunkContent:
        'La licencia por salud se otorga por el plazo que indique el certificado médico o CITT.',
      chunkId: 'licencia-salud',
      documentId: 'licencias',
      documentTitle: 'Norma técnica de licencias, permisos y vacaciones',
      documentVersionId: 'licencias-version',
      sectionTitle: 'De la licencia por salud',
    };
    const paternidad = {
      ...salud,
      chunkContent:
        'La licencia por paternidad se otorga por diez días calendario con goce de remuneraciones.',
      chunkId: 'licencia-paternidad',
      sectionTitle: 'De la licencia por paternidad',
    };
    gateway.search.mockImplementation(
      ({ embedding }: { embedding: number[] }) => {
        const query = queryFor(embedding);
        // La pregunta actual trae la licencia de paternidad; la consulta
        // canónica del proceso trae la propia.
        return Promise.resolve(
          /Pregunta actual/.test(query) ? [paternidad] : [salud],
        );
      },
    );

    const result = await service.retrieve('y los requisitos', null, [
      'necesito descanso medico',
    ]);
    expect(result).toMatchObject({ kind: 'evidence' });
    if (result.kind === 'evidence') {
      const ids = result.sources.map((source) => source.chunkId);
      expect(ids).toContain('licencia-salud');
      expect(ids).not.toContain('licencia-paternidad');
    }
  });

  /**
   * El chat fija la intención de la pregunta explícita; estas pruebas reproducen
   * ese contrato sin depender del arnés completo.
   */
  const destaqueIntent = {
    id: 'temporary-placement' as const,
    label: 'el destaque',
    moduleName: 'Contratación y desplazamientos',
  };

  it('entrega el fragmento admitido y no la sección de permuta mejor puntuada', async () => {
    const { service, gateway } = buildSearchable();
    // Pregunta explícita de destaque sobre la norma conjunta: la sección de la
    // permuta puntúa más alto que los requisitos y comparte versión. Sin la
    // compuerta en el conjunto entregado, la consolidación por versión citaba
    // solo la permuta.
    const requisitos = {
      ...plazoChunk,
      chunkContent:
        'Para postular al destaque se requiere nombramiento vigente y tres años de servicio oficial.',
      chunkId: 'destaque-requisitos',
      documentId: 'desplazamientos',
      documentTitle: 'Norma técnica de reasignación, permuta y destaque',
      documentVersionId: 'desplazamientos-version',
      sectionTitle: 'Requisitos del destaque',
      semanticScore: 0.7,
    };
    const permuta = {
      ...requisitos,
      chunkContent:
        'Los docentes pueden acogerse a la permuta cuando exista acuerdo entre las partes.',
      chunkId: 'permuta-seccion',
      sectionTitle: 'Disposiciones específicas de la permuta',
      semanticScore: 0.72,
    };
    gateway.search.mockImplementation(() =>
      Promise.resolve([permuta, requisitos]),
    );

    const result = await service.retrieve(
      'que requisitos tiene el destaque docente',
      null,
      [],
      { topicIntent: destaqueIntent },
    );
    expect(result).toMatchObject({ kind: 'evidence' });
    if (result.kind === 'evidence') {
      const ids = result.sources.map((source) => source.chunkId);
      expect(ids).toContain('destaque-requisitos');
      expect(ids).not.toContain('permuta-seccion');
    }
  });

  it('no responde una pregunta de destaque con la sección de la reasignación', async () => {
    const { service, gateway } = buildSearchable();
    // El título de la norma conjunta nombra el destaque, así que el título no
    // acusa otro proceso: la sección de la reasignación se colaba como única
    // cita de una pregunta de destaque por la sola puerta de «sin mención de un
    // trámite hermano».
    const reasignacion = {
      ...plazoChunk,
      chunkContent:
        'La reasignación se solicita ante la UGEL de origen y se resuelve en la de destino.',
      chunkId: 'reasignacion-seccion',
      documentId: 'desplazamientos',
      documentTitle: 'Norma técnica de reasignación, permuta y destaque',
      documentVersionId: 'desplazamientos-version',
      sectionTitle: 'De la reasignación',
      semanticScore: 0.78,
    };
    gateway.search.mockImplementation(() => Promise.resolve([reasignacion]));

    await expect(
      service.retrieve('quiero destacarme en otro colegio', null, [], {
        topicIntent: destaqueIntent,
      }),
    ).resolves.toMatchObject({ kind: 'no_evidence' });
  });

  const reassignmentIntent = {
    id: 'reassignment' as const,
    label: 'la reasignación',
    moduleName: 'Contratación y desplazamientos',
  };

  it('no responde la reasignación con la sección dedicada a la permuta', async () => {
    const { service, gateway } = buildSearchable();
    // La sección de la permuta comparte la norma con la reasignación y su cuerpo
    // nombra los dos trámites. Sin la sección como encuadre, la salida por nombre
    // propio del cuerpo la admitía y quedaba como única cita de la respuesta.
    const permuta = {
      ...plazoChunk,
      chunkContent:
        'La permuta y la reasignación se solicitan ante la UGEL de destino.',
      chunkId: 'permuta-exclusiva',
      documentId: 'desplazamientos',
      documentTitle: 'Norma técnica de reasignación, permuta y destaque',
      documentVersionId: 'desplazamientos-version',
      sectionTitle: 'Disposiciones específicas de la permuta',
      semanticScore: 0.78,
    };
    gateway.search.mockImplementation(() => Promise.resolve([permuta]));

    await expect(
      service.retrieve('quiero reasignarme a otra ugel', null, [], {
        topicIntent: reassignmentIntent,
      }),
    ).resolves.toMatchObject({ kind: 'no_evidence' });
  });

  it('entrega la reasignación y no la sección de la permuta de la misma versión', async () => {
    const { service, gateway } = buildSearchable();
    // Contramuestra de la anterior: el fragmento propio de la reasignación se
    // entrega, y la sección de la permuta de la misma versión no se arrastra
    // hasta la cita aunque puntúe más alto.
    const requisitos = {
      ...plazoChunk,
      chunkContent:
        'La reasignación se solicita ante la UGEL de origen y se resuelve en la de destino.',
      chunkId: 'reasignacion-requisitos',
      documentId: 'desplazamientos',
      documentTitle: 'Norma técnica de reasignación, permuta y destaque',
      documentVersionId: 'desplazamientos-version',
      sectionTitle: 'De la reasignación',
      semanticScore: 0.66,
    };
    const permuta = {
      ...requisitos,
      chunkContent:
        'La permuta y la reasignación se solicitan ante la UGEL de destino.',
      chunkId: 'permuta-exclusiva',
      sectionTitle: 'Disposiciones específicas de la permuta',
      semanticScore: 0.78,
    };
    gateway.search.mockImplementation(() =>
      Promise.resolve([permuta, requisitos]),
    );

    const result = await service.retrieve(
      'quiero reasignarme a otra ugel',
      null,
      [],
      { topicIntent: reassignmentIntent },
    );
    expect(result).toMatchObject({ kind: 'evidence' });
    if (result.kind === 'evidence') {
      const ids = result.sources.map((source) => source.chunkId);
      expect(ids).toContain('reasignacion-requisitos');
      expect(ids).not.toContain('permuta-exclusiva');
    }
  });

  it('entrega el anexo de plazas de la norma conjunta en un hilo de destaque', async () => {
    const { service, gateway, queryFor } = buildSearchable();
    // El anexo de la norma conjunta no repite «destaque» y su título nombra la
    // reasignación y la permuta: la ampliación por versión lo perdía y la
    // respuesta se quedaba sin el cuadro de plazas que el seguimiento pedía.
    const plazas = {
      ...plazoChunk,
      chunkContent:
        'El destaque solo se otorga sobre las plazas vacantes de la UGEL de destino.',
      chunkId: 'destaque-plazas',
      documentId: 'desplazamientos',
      documentTitle: 'Norma técnica de reasignación, permuta y destaque',
      documentVersionId: 'desplazamientos-version',
      sectionTitle: 'De las plazas del destaque',
      semanticScore: 0.68,
    };
    const anexo = {
      ...plazas,
      chunkContent:
        'Anexo 2: el cuadro de plazas por región consigna 120 plazas para Lima Metropolitana.',
      chunkId: 'destaque-anexo',
      sectionTitle: 'Anexo 2',
      semanticScore: 0.72,
    };
    gateway.search.mockImplementation(
      ({ embedding }: { embedding: number[] }) =>
        Promise.resolve(
          /destaque docente/.test(queryFor(embedding)) ? [plazas, anexo] : [],
        ),
    );

    const result = await service.retrieve('y el cuadro del anexo?', null, [
      'como destacarme en otro colegio',
    ]);
    expect(result).toMatchObject({ kind: 'evidence' });
    if (result.kind === 'evidence') {
      const ids = result.sources.map((source) => source.chunkId);
      expect(ids).toContain('destaque-plazas');
      expect(ids).toContain('destaque-anexo');
    }
  });

  it('no entrega el plazo enmarcado en la permuta aunque su puntaje sea mayor', async () => {
    const { service, gateway } = buildSearchable();
    // El enmarque del hermano no necesita sección propia: «si se trata de una
    // permuta» dentro del plazo basta, y con la marca en la subordinada la
    // oración principal no la contiene. Antes de reconocer la marca, la
    // consolidación por versión citaba solo ese fragmento. El puntaje más alto
    // (0.78 frente a 0.66) no decide la entrega: la compuerta del proceso filtra
    // antes de elegir y el margen de relevancia de 0.12 no llega a aplicarse.
    const requisitos = {
      ...plazoChunk,
      chunkContent:
        'Para postular al destaque se requiere nombramiento vigente y tres años de servicio oficial.',
      chunkId: 'destaque-requisitos',
      documentId: 'desplazamientos',
      documentTitle: 'Norma técnica de reasignación, permuta y destaque',
      documentVersionId: 'desplazamientos-version',
      sectionTitle: 'Requisitos del destaque',
      semanticScore: 0.66,
    };
    const plazoPermuta = {
      ...requisitos,
      chunkContent:
        'El plazo para presentar la solicitud es de quince días si se trata de una permuta.',
      chunkId: 'permuta-enmarcada',
      sectionTitle: 'Del plazo',
      semanticScore: 0.78,
    };
    gateway.search.mockImplementation(() =>
      Promise.resolve([plazoPermuta, requisitos]),
    );

    const result = await service.retrieve(
      'que requisitos tiene el destaque docente',
      null,
      [],
      { topicIntent: destaqueIntent },
    );
    expect(result).toMatchObject({ kind: 'evidence' });
    if (result.kind === 'evidence') {
      const ids = result.sources.map((source) => source.chunkId);
      expect(ids).toContain('destaque-requisitos');
      expect(ids).not.toContain('permuta-enmarcada');
    }
  });

  it('entrega el plazo compartido por el destaque y la permuta', async () => {
    const { service, gateway } = buildSearchable();
    // El par coordinado es el complemento de «el plazo» —«el plazo para el
    // destaque y la permuta»— y el verbo singular concuerda con el núcleo, no con
    // el hermano: el fragmento enuncia el plazo de los dos trámites. Leerlo como
    // la cláusula de la permuta dejaba sin evidencia la pregunta de destaque.
    const compartido = {
      ...plazoChunk,
      chunkContent:
        'El plazo para el destaque y la permuta es de quince días hábiles contados desde la publicación del cronograma.',
      chunkId: 'plazo-compartido',
      documentId: 'desplazamientos',
      documentTitle: 'Norma técnica de reasignación, permuta y destaque',
      documentVersionId: 'desplazamientos-version',
      sectionTitle: 'Del plazo',
      semanticScore: 0.72,
    };
    gateway.search.mockImplementation(() => Promise.resolve([compartido]));

    await expect(
      service.retrieve('que plazo tiene el destaque docente', null, [], {
        topicIntent: destaqueIntent,
      }),
    ).resolves.toMatchObject({
      kind: 'evidence',
      sources: [{ chunkId: 'plazo-compartido' }],
    });
  });

  it('no entrega el plazo del hermano cuando el sujeto y su verbo abren el tramo', async () => {
    const { service, gateway } = buildSearchable();
    // «La UGEL fija el plazo del destaque»: el nombre del propio llega hasta el
    // conector, pero no comparte sujeto con la permuta, porque antes del
    // sintagma hay un sujeto y su predicado. Con solo mirar el arranque nominal
    // el fragmento se entregaba con citas válidas y su puntaje mayor (0.86)
    // desplazaba al plazo compartido.
    const fuga = {
      ...plazoChunk,
      chunkContent:
        'La UGEL fija el plazo del destaque y la permuta se solicita con acuerdo de partes.',
      chunkId: 'plazo-ugel',
      documentId: 'desplazamientos',
      documentTitle: 'Norma técnica de reasignación, permuta y destaque',
      documentVersionId: 'desplazamientos-version',
      sectionTitle: 'Del plazo',
      semanticScore: 0.86,
    };
    const compartido = {
      ...fuga,
      chunkContent:
        'El plazo para el destaque y la permuta es de quince días hábiles contados desde la publicación del cronograma.',
      chunkId: 'plazo-compartido',
      semanticScore: 0.72,
    };
    gateway.search.mockImplementation(() =>
      Promise.resolve([fuga, compartido]),
    );

    const result = await service.retrieve(
      'que plazo tiene el destaque docente',
      null,
      [],
      { topicIntent: destaqueIntent },
    );
    expect(result).toMatchObject({ kind: 'evidence' });
    if (result.kind === 'evidence') {
      const ids = result.sources.map((source) => source.chunkId);
      expect(ids).toContain('plazo-compartido');
      expect(ids).not.toContain('plazo-ugel');
    }
  });

  it('entrega el anexo de la versión admitida aunque no nombre el trámite', async () => {
    const { service, gateway } = buildSearchable();
    // El cuadro de plazos de la norma conjunta no repite «destaque» ni proviene
    // de una consulta propia, y aun así completa la respuesta: lo que no puede
    // entrar es el fragmento que trata otro trámite. El título de la norma
    // nombra la reasignación y la permuta, y eso no convierte el anexo en otro
    // proceso.
    const requisitos = {
      ...plazoChunk,
      chunkContent:
        'Para postular al destaque se requiere nombramiento vigente y tres años de servicio oficial.',
      chunkId: 'destaque-requisitos',
      documentId: 'destaque-document',
      sectionTitle: 'Requisitos del destaque',
      semanticScore: 0.66,
    };
    const anexo = {
      ...requisitos,
      chunkContent:
        'Anexo 2: el cuadro de plazas por región consigna 120 plazas para Lima Metropolitana y 45 para Arequipa.',
      chunkId: 'destaque-anexo',
      documentTitle: 'Norma técnica de reasignación, permuta y destaque',
      sectionTitle: 'Anexo 2',
      semanticScore: 0.72,
    };
    gateway.search.mockImplementation(() =>
      Promise.resolve([requisitos, anexo]),
    );

    const result = await service.retrieve(
      'que requisitos tiene el destaque docente',
      null,
      [],
      { topicIntent: destaqueIntent },
    );
    expect(result).toMatchObject({ kind: 'evidence' });
    if (result.kind === 'evidence') {
      const ids = result.sources.map((source) => source.chunkId);
      expect(ids).toContain('destaque-requisitos');
      expect(ids).toContain('destaque-anexo');
    }
  });

  it('no entrega otra licencia en un hilo de licencia', async () => {
    const { service, gateway, queryFor } = buildSearchable();
    const paternidad = {
      ...plazoChunk,
      chunkContent:
        'La licencia por paternidad se otorga por diez días calendario con goce de remuneraciones.',
      chunkId: 'licencia-paternidad',
      documentTitle: 'Norma técnica de licencias, permisos y vacaciones',
      sectionTitle: 'De la licencia por paternidad',
    };
    gateway.search.mockImplementation(
      ({ embedding }: { embedding: number[] }) =>
        Promise.resolve(
          /incapacidad temporal|descanso médico|descanso medico|citt/.test(
            queryFor(embedding),
          )
            ? [paternidad]
            : [],
        ),
    );

    await expect(
      service.retrieve('y los requisitos', null, ['necesito descanso medico']),
    ).resolves.toMatchObject({ kind: 'no_evidence' });
  });

  it('no entrega el plazo del hermano aunque el verbo del propio no esté en el inventario', async () => {
    const { service, gateway, queryFor } = buildSearchable();
    // El sujeto de la cláusula del hermano se decide por la concordancia del
    // verbo, no por una lista cerrada: «cubre» queda fuera de cualquier
    // inventario y aun así la cláusula sigue en singular, así que enuncia el
    // plazo de la licencia por paternidad y no el del descanso médico. Con la
    // lista en negativo, el fragmento se entregaba con citas válidas y su
    // puntaje mayor (0.8) desplazaba al fragmento propio.
    const propio = {
      ...plazoChunk,
      chunkContent:
        'El descanso médico se acredita con el certificado médico o el CITT.',
      chunkId: 'descanso-propio',
      documentId: 'licencias',
      documentTitle: 'Norma técnica de licencias, permisos y vacaciones',
      documentVersionId: 'licencias-version',
      sectionTitle: 'Del descanso médico',
      semanticScore: 0.66,
    };
    const ajeno = {
      ...propio,
      chunkContent:
        'El descanso médico cubre siete días hábiles y la licencia por paternidad se otorga por diez días calendario.',
      chunkId: 'descanso-con-plazo-ajeno',
      sectionTitle: 'Del plazo',
      semanticScore: 0.8,
    };
    gateway.search.mockImplementation(
      ({ embedding }: { embedding: number[] }) =>
        Promise.resolve(
          /incapacidad temporal|descanso médico|descanso medico|citt/.test(
            queryFor(embedding),
          )
            ? [ajeno, propio]
            : [],
        ),
    );

    const result = await service.retrieve('y el plazo', null, [
      'necesito descanso medico',
    ]);
    expect(result).toMatchObject({ kind: 'evidence' });
    if (result.kind === 'evidence') {
      const ids = result.sources.map((source) => source.chunkId);
      expect(ids).toContain('descanso-propio');
      expect(ids).not.toContain('descanso-con-plazo-ajeno');
    }
  });

  it('admite la licencia nombrada por su causal', async () => {
    const { service, gateway, queryFor } = buildSearchable();
    // El corpus titula la sección con la causal; ese fragmento es el propio
    // proceso, no un trámite hermano, y debe responder el seguimiento.
    const licenciaSalud = {
      ...plazoChunk,
      chunkContent:
        'La licencia por salud se otorga por el plazo que indique el certificado médico o CITT.',
      chunkId: 'licencia-salud',
      documentId: 'licencias',
      documentTitle: 'Norma técnica de licencias, permisos y vacaciones',
      documentVersionId: 'licencias-version',
      sectionTitle: 'De la licencia por salud',
    };
    gateway.search.mockImplementation(
      ({ embedding }: { embedding: number[] }) =>
        Promise.resolve(
          /incapacidad temporal|descanso médico|descanso medico|citt/.test(
            queryFor(embedding),
          )
            ? [licenciaSalud]
            : [],
        ),
    );

    await expect(
      service.retrieve('y los requisitos', null, ['necesito descanso medico']),
    ).resolves.toMatchObject({
      kind: 'evidence',
      sources: [{ chunkId: 'licencia-salud' }],
    });
  });

  /**
   * El tema heredado de «Cargos y plazas» pasa por la misma compuerta que la
   * ruta directa. Sin ella, un seguimiento tras «plaza orgánica y eventual»
   * aceptaba la norma del destaque que solo dice «conserva su plaza orgánica».
   */
  const positionNorm = {
    ...plazoChunk,
    chunkContent:
      'La plaza orgánica se crea por resolución y la plaza eventual se atiende con contrato mientras exista la necesidad de servicio.',
    chunkId: 'position-norm',
    documentId: 'position-document',
    documentTitle: 'Norma sobre cargos y plazas',
    documentVersionId: 'position-version',
    moduleIds: ['cargos'],
    moduleNames: ['Cargos y plazas'],
    sectionTitle: 'De las plazas',
    semanticScore: 0.78,
  };

  const destaquePlaza = {
    ...plazoChunk,
    chunkContent:
      'Durante el destaque el profesor conserva su plaza orgánica de origen.',
    chunkId: 'destaque-plaza',
    documentTitle: 'Norma técnica del destaque docente',
    sectionTitle: 'De los derechos del destacado',
    semanticScore: 0.9,
  };

  it('hereda el tema de las plazas y entrega su norma', async () => {
    const { service, gateway } = buildSearchable();
    gateway.search.mockResolvedValue([positionNorm]);

    await expect(
      service.retrieve('y los requisitos?', null, [
        'diferencia entre plaza organica y eventual',
      ]),
    ).resolves.toMatchObject({
      kind: 'evidence',
      sources: [{ chunkId: 'position-norm' }],
    });
  });

  it('no responde el tema heredado con la mención del destaque', async () => {
    const { service, gateway } = buildSearchable();
    // El destaque puntúa más alto y nombra la plaza orgánica, pero regula otro
    // proceso: la compuerta lo descarta y la norma del tema responde.
    gateway.search.mockResolvedValue([destaquePlaza, positionNorm]);

    await expect(
      service.retrieve('y los requisitos?', null, [
        'diferencia entre plaza organica y eventual',
      ]),
    ).resolves.toMatchObject({
      kind: 'evidence',
      sources: [{ chunkId: 'position-norm' }],
    });
  });

  it('no responde el tema heredado con la única mención incidental', async () => {
    const { service, gateway } = buildSearchable();
    gateway.search.mockResolvedValue([destaquePlaza]);

    await expect(
      service.retrieve('y los requisitos?', null, [
        'diferencia entre plaza organica y eventual',
      ]),
    ).resolves.toMatchObject({ kind: 'no_evidence' });
  });

  /**
   * La dirección inversa: un hilo de destaque no responde su seguimiento con la
   * norma que regula las plazas. El encabezado de esa norma no la descarta —una
   * sección de la norma de destaque puede titularse igual—, pero el cuerpo sí
   * decide cuando clasifica las plazas.
   */
  it('no responde el plazo del destaque con la norma de las plazas', async () => {
    const { service, gateway } = buildSearchable();
    gateway.search.mockResolvedValue([positionNorm]);

    await expect(
      service.retrieve('y el plazo para presentar la solicitud?', null, [
        'como destacarme en otro colegio',
      ]),
    ).resolves.toMatchObject({ kind: 'no_evidence' });
  });

  /**
   * Banda aceptada a propósito: un fragmento del trámite del hilo que enuncia la
   * pareja de plazas sin nombrar su trámite ni en el cuerpo ni en la sección se
   * descarta. Es un falso negativo conocido y se prefiere a la respuesta cruzada;
   * si alguien afloja la comprobación de cuerpo, esta prueba lo acusa.
   */
  it('descarta el requisito del trámite que enuncia la pareja sin nombrarse', async () => {
    const { service, gateway } = buildSearchable();
    const requisitoSinNombre = {
      ...plazoChunk,
      chunkContent:
        'El postulante debe acreditar vínculo en una plaza orgánica o en una plaza eventual según corresponda.',
      chunkId: 'requisito-sin-nombre',
      sectionTitle: 'De los requisitos',
      semanticScore: 0.88,
    };
    gateway.search.mockResolvedValue([requisitoSinNombre]);

    await expect(
      service.retrieve('y el plazo para presentar la solicitud?', null, [
        'como destacarme en otro colegio',
      ]),
    ).resolves.toMatchObject({ kind: 'no_evidence' });
  });

  it('entrega el plazo del destaque y no la norma de las plazas', async () => {
    const { service, gateway } = buildSearchable();
    // Las dos fuentes comparten la consulta del proceso; el cuerpo decide cuál
    // responde el seguimiento.
    gateway.search.mockResolvedValue([
      { ...positionNorm, semanticScore: 0.92 },
      plazoChunk,
    ]);

    await expect(
      service.retrieve('y el plazo para presentar la solicitud?', null, [
        'como destacarme en otro colegio',
      ]),
    ).resolves.toMatchObject({
      kind: 'evidence',
      sources: [{ chunkId: 'plazo-chunk' }],
    });
  });

  it('no responde el clasificador heredado con una cita de paso', async () => {
    const { service, gateway } = buildSearchable();
    const cita = {
      ...plazoChunk,
      chunkContent:
        'La institución cuenta con el PEI, el MOF, el CAP y el clasificador de cargos como instrumentos de gestión.',
      chunkId: 'cita-clasificador',
      documentTitle: 'Norma de organización interna',
      sectionTitle: 'De los instrumentos de gestión',
      semanticScore: 0.9,
    };
    gateway.search.mockResolvedValue([cita]);

    await expect(
      service.retrieve('y los requisitos?', null, ['clasificador de cargos']),
    ).resolves.toMatchObject({ kind: 'no_evidence' });
  });

  it('no responde las horas heredadas con la jornada de un contrato', async () => {
    const { service, gateway } = buildSearchable();
    const contractHours = {
      ...plazoChunk,
      chunkContent:
        'El profesor contratado cumple una carga horaria de treinta horas cronológicas semanales que se aprueba por resolución.',
      chunkId: 'contract-hours',
      documentTitle: 'Norma del proceso de contratación docente',
      sectionTitle: 'Carga horaria y jornada del contrato',
      semanticScore: 0.9,
    };
    gateway.search.mockResolvedValue([contractHours]);

    await expect(
      service.retrieve('y los requisitos?', null, [
        'que es el cuadro de distribucion de horas',
      ]),
    ).resolves.toMatchObject({ kind: 'no_evidence' });
  });

  it('busca el tema heredado con su propia denominación', async () => {
    const { service, embeddings } = build();
    await service.retrieve('y los requisitos?', null, [
      'diferencia entre plaza organica y eventual',
    ]);

    const queries = embeddedQueries(embeddings);
    // Las dos adiciones del merge son necesarias: sin la consulta canónica del
    // proceso heredado no habría nada que recuperar.
    expect(
      queries.some((query) => query.includes('plaza orgánica plaza eventual')),
    ).toBe(true);
  });

  it('rescata el proceso heredado cuando la búsqueda vectorial no devuelve nada', async () => {
    const { service, gateway, queryFor } = buildSearchable();
    // El proceso del hilo aporta su denominación al rescate léxico: la pregunta
    // del turno («y los requisitos») no la repite, y la búsqueda vectorial no
    // devolvió nada. Sin esa consulta, el turno se quedaba sin evidencia.
    const requisitos = {
      ...plazoChunk,
      chunkContent:
        'Para postular al destaque se requiere tener vínculo nombrado y tres años de servicio.',
      chunkId: 'requisitos-destaque',
      documentTitle: 'Norma técnica del destaque docente',
      lexicalScore: 0.8,
      sectionTitle: 'Requisitos del destaque',
    };
    gateway.search.mockImplementation(
      ({
        embedding,
        matchThreshold,
      }: {
        embedding: number[];
        matchThreshold: number;
      }) =>
        Promise.resolve(
          matchThreshold === 0 && /destaque docente/.test(queryFor(embedding))
            ? [requisitos]
            : [],
        ),
    );

    await expect(
      service.retrieve('y los requisitos?', null, [
        'como destacarme en otro colegio',
      ]),
    ).resolves.toMatchObject({
      kind: 'evidence',
      sources: [{ chunkId: 'requisitos-destaque' }],
    });
  });
});
