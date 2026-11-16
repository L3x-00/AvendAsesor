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
});
