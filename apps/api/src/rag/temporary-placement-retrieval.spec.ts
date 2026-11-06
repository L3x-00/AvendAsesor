import { temporaryPlacementQueries } from './temporary-placement-retrieval';

describe('temporary placement retrieval', () => {
  it('busca el trámite temporal sin modificar la pregunta', () => {
    const question =
      'quiero trabajar solo por un tiempo en otro colegio pero sin perder mi plaza, que tramite hago';
    expect(temporaryPlacementQueries(question)).toEqual([
      'destaque docente temporal plaza de origen requisitos solicitud',
    ]);
  });
  it('no deduce el trámite de estacionamiento ni cambia el régimen de auxiliares', () => {
    expect(
      temporaryPlacementQueries(
        'quiero por un tiempo otro aparcamiento sin perder mi plaza',
      ),
    ).toEqual([]);
    expect(
      temporaryPlacementQueries(
        'soy auxiliar y quiero otro colegio por un tiempo sin perder mi plaza',
      ),
    ).toEqual([]);
    expect(
      temporaryPlacementQueries(
        'quiero por un tiempo mantener plaza de aparcamiento en el colegio',
      ),
    ).toEqual([]);
    expect(
      temporaryPlacementQueries(
        'soy profesor contratado y quiero otro colegio por un tiempo sin perder mi plaza',
      ),
    ).toEqual([]);
    expect(
      temporaryPlacementQueries(
        'no quiero trabajar por un tiempo en otro colegio sin perder mi plaza, quiero vacaciones',
      ),
    ).toEqual([]);
    expect(
      temporaryPlacementQueries(
        'soy profesor y quiero por un tiempo conservar mi plaza en el colegio mientras estudio una maestría',
      ),
    ).toEqual([]);
  });
  it('distingue negar perder la plaza de negar el traslado', () => {
    expect(
      temporaryPlacementQueries(
        'no quiero perder mi plaza por un tiempo, pero quiero trabajar en otro colegio',
      ),
    ).toHaveLength(1);
  });
});
