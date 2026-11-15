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
});
