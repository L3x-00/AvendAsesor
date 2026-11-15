import {
  isDirectTemporaryPlacementEvidence,
  isTemporaryPlacementQuestion,
  temporaryPlacementQueries,
  treatsTemporaryPlacement,
} from './temporary-placement-retrieval';

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

/**
 * La forma verbal y coloquial del proceso («cómo destacarme») no aporta la
 * denominación del corpus: sin expansión, la similitud vectorial de dos
 * palabras no alcanzaba el umbral y el turno terminaba en «sin evidencia».
 */
describe('destaque expresado con el verbo o el término del proceso', () => {
  it.each([
    'como puedo destacarme en otro colegio',
    'como hago para destacarme',
    'quiero destacarse en otra ugel',
  ])('expande «%s» con la denominación del corpus', (question) => {
    expect(isTemporaryPlacementQuestion(question)).toBe(true);
    expect(temporaryPlacementQueries(question)).toEqual([
      expect.stringContaining('destaque docente'),
    ]);
  });

  it('no gasta una segunda búsqueda cuando la pregunta ya usa el término', () => {
    expect(isTemporaryPlacementQuestion('renovacion de destaque hay?')).toBe(
      true,
    );
    expect(temporaryPlacementQueries('renovacion de destaque hay?')).toEqual(
      [],
    );
    expect(
      temporaryPlacementQueries('que causales existen en destaque?'),
    ).toEqual([]);
  });

  it('agrega la causal declarada a la búsqueda', () => {
    expect(
      temporaryPlacementQueries('como me destaco por causal de salud'),
    ).toEqual([
      expect.stringContaining('destaque docente'),
      expect.stringContaining('salud'),
    ]);
    expect(
      temporaryPlacementQueries('como me destaco por unidad familiar y salud'),
    ).toEqual([
      expect.stringContaining('destaque docente'),
      expect.stringContaining('unidad familiar'),
    ]);
  });

  it('agrega la renovación cuando corresponde', () => {
    expect(temporaryPlacementQueries('puedo renovar si me destaco')).toEqual([
      expect.stringContaining('destaque docente'),
      expect.stringContaining('renovación'),
    ]);
  });

  it('no abre el proceso cuando la persona lo rechaza', () => {
    expect(
      isTemporaryPlacementQuestion('no quiero destacarme, quiero renunciar'),
    ).toBe(false);
    expect(
      temporaryPlacementQueries('no quiero destacarme, quiero renunciar'),
    ).toEqual([]);
  });

  it('no atribuye el destaque al régimen de auxiliares', () => {
    expect(
      isTemporaryPlacementQuestion(
        'soy auxiliar y quiero destacarme en otra ie',
      ),
    ).toBe(false);
    expect(
      temporaryPlacementQueries('soy auxiliar y quiero destacarme en otra ie'),
    ).toEqual([]);
  });

  it('exige contexto educativo en las formas ambiguas del verbo', () => {
    expect(
      isTemporaryPlacementQuestion('quiero destacar en mi evaluacion'),
    ).toBe(false);
    expect(
      isTemporaryPlacementQuestion(
        'soy docente nombrado y quiero destacar en otra institucion educativa',
      ),
    ).toBe(true);
    expect(isTemporaryPlacementQuestion('un destacado plato tipico')).toBe(
      false,
    );
  });

  it('no abre el proceso por un uso corriente del verbo en el colegio', () => {
    // «docente» o «vacante» describen el ámbito, no el traslado: sin indicio
    // de plaza u otro centro, el turno no pide el destaque.
    expect(
      isTemporaryPlacementQuestion(
        'fui docente destacado, que beneficios tengo',
      ),
    ).toBe(false);
    expect(
      isTemporaryPlacementQuestion(
        'soy docente y quiero destacar en mi evaluacion',
      ),
    ).toBe(false);
    expect(
      isTemporaryPlacementQuestion(
        'quiero destacar en el examen para obtener una vacante',
      ),
    ).toBe(false);
    expect(
      isTemporaryPlacementQuestion(
        'soy docente y quiero destacarme en otra ugel',
      ),
    ).toBe(true);
  });

  it('reconoce que un contratado también puede preguntar por el destaque', () => {
    // La norma reserva el destaque al personal nombrado: la respuesta correcta
    // es justamente esa, así que la búsqueda no se descarta por el vínculo.
    expect(
      isTemporaryPlacementQuestion(
        'soy docente contratado y quiero destacarme',
      ),
    ).toBe(true);
    expect(
      temporaryPlacementQueries('soy docente contratado y quiero destacarme'),
    ).toHaveLength(1);
  });

  it('reconoce el fragmento que trata el destaque, no la pregunta', () => {
    const destaque = {
      chunkContent:
        'El destaque es un desplazamiento temporal de un profesor nombrado.',
      documentTitle: 'Norma tecnica del destaque docente',
      sectionTitle: null,
    };
    expect(treatsTemporaryPlacement(destaque)).toBe(true);
    expect(
      treatsTemporaryPlacement({
        chunkContent: 'Documento sin el proceso.',
        documentTitle: 'RSG 0001-2026-MINEDU',
        sectionTitle: null,
      }),
    ).toBe(false);
    expect(
      treatsTemporaryPlacement({
        chunkContent:
          'Los docentes destacados presentan su solicitud ante la UGEL.',
        documentTitle: 'RSG 0001-2026-MINEDU',
      }),
    ).toBe(true);
    expect(
      isDirectTemporaryPlacementEvidence('como puedo destacarme', destaque),
    ).toBe(true);
    expect(
      isDirectTemporaryPlacementEvidence('cuanto gana un docente', destaque),
    ).toBe(false);
  });
});
