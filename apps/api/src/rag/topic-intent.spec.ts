import { detectTopicIntent } from './topic-intent';
import { reassignmentRole } from './reassignment-retrieval';
import { hasTopicTerm } from './domain-lexicon';
import { normalizeSpanishText } from './text-normalization';
import { temporaryPlacementQueries } from './temporary-placement-retrieval';

/**
 * El chat general identifica la intención principal de cada consulta sin que la
 * persona elija un módulo. Las pruebas fijan las siete consultas reportadas y
 * varios casos cercanos que NO deben activar una intención (una consulta
 * salarial, una licencia genérica, una permuta o una pregunta de jornada).
 */
describe('detectTopicIntent', () => {
  it('no confunde cambio de horario familiar con reasignación', () => {
    expect(
      detectTopicIntent(
        'soy nombrado y quiero pedir mi cambio de horario porque mi esposa trabaja de noche',
      )?.id,
    ).not.toBe('reassignment');
  });
  it.each([
    [
      'soy nombrado en huancayo y mi esposa vive en lima, puedo pedir mi cambio para estar con ella',
      'reassignment',
      'Contratación y desplazamientos',
    ],
    [
      'soy profesor y quiero saber cuando me pueden destituir por una falta',
      'disciplinary',
      'Situaciones Administrativas',
    ],
    [
      'soy profesor y cuando me destituyen por faltas',
      'disciplinary',
      'Situaciones Administrativas',
    ],
    [
      'soy nombrado en junin pero quiero irme a lima porque mi familia vive alla que hago',
      'reassignment',
      'Contratación y desplazamientos',
    ],
    [
      'el doctor me dio descanso por 15 dias como justifico eso en mi colegio',
      'medical-leave',
      'Situaciones Administrativas',
    ],
    [
      'mi colegio esta en zona rural me toca recibir un pago adicional',
      'rural-allocation',
      'Remuneraciones',
    ],
    [
      'ya tengo varios años en primera escala como hago para subir a segunda',
      'career-progression',
      'Evaluación docente',
    ],
    [
      'mi hermana quiere trabajar de auxiliar en inicial que estudios necesita',
      'auxiliary-requirements',
      'Auxiliar de educación',
    ],
    [
      'mi director dice que me va sancionar pero yo quiero saber si tengo derecho a defenderme',
      'disciplinary',
      'Situaciones Administrativas',
    ],
    [
      'en mi colegio estan bajando los alumnos y dicen que van a reducir plazas eso se puede',
      'rationalization',
      'Cargos y plazas',
    ],
  ] as const)('reconoce «%s» como %s', (question, id, moduleName) => {
    expect(detectTopicIntent(question)).toMatchObject({ id, moduleName });
  });

  it.each([
    // Una cifra de la escala no es una pregunta por el ascenso.
    '¿Cuánto gana un docente de segunda escala magisterial?',
    // La consecuencia económica manda sobre la palabra del proceso.
    '¿Me siguen pagando igual si pido reasignación?',
    '¿Cuánto gana un docente con descanso médico de 15 días?',
    '¿Me afecta en mi sueldo un ascenso de escala?',
    '¿Cuánto se gana al ascender a segunda escala?',
    'Tengo un descanso médico de 15 días, ¿me descuentan?',
    // Una licencia genérica no acredita una incapacidad temporal.
    '¿Cómo solicito una licencia?',
    // La enfermedad de un familiar no es la incapacidad propia.
    'Mi hijo está enfermo, ¿puedo faltar al colegio?',
    // Una permuta no es una reasignación por traslado de región.
    'Quiero permutar con un colega de otra UGEL',
    // Trabajar en zona rural sin preguntar por un beneficio no es una asignación.
    'Trabajo en una zona rural y quiero saber mi horario',
    // La remuneración del auxiliar no es una consulta de requisitos.
    '¿Cuánto gana un auxiliar de educación?',
    // Una plaza mencionada sin reducción ni matrícula no es racionalización.
    '¿Cuántas plazas hay en mi colegio?',
    // Un caso de evaluación docente no es ascenso.
    '¿Qué pasa si me evalúan con desempeño desfavorable?',
  ])('no fuerza una intención en «%s»', (question) => {
    expect(detectTopicIntent(question)).toBeNull();
  });

  it('distingue la reasignación de un auxiliar de la de un profesor', () => {
    expect(
      detectTopicIntent(
        'soy auxiliar y quiero reasignarme a otra UGEL que necesito',
      ),
    ).toMatchObject({
      id: 'reassignment',
      label: 'la reasignación de auxiliares de educación',
      moduleName: 'Auxiliar de educación',
    });
    expect(
      detectTopicIntent(
        'soy nombrado en junin pero quiero irme a lima porque mi familia vive alla que hago',
      ),
    ).toMatchObject({
      label: 'la reasignación docente',
      moduleName: 'Contratación y desplazamientos',
    });
  });

  it('no atribuye a la persona el rol de un familiar mencionado', () => {
    const question =
      'soy docente y mi esposa es auxiliar de educacion, quiero reasignarme a lima';
    expect(detectTopicIntent(question)).toMatchObject({
      label: 'la reasignación docente',
      moduleName: 'Contratación y desplazamientos',
    });
    expect(reassignmentRole(question)).toBe('docente');
  });

  it('reconoce la forma verbal «asciende» como el mismo ascenso', () => {
    expect(
      detectTopicIntent('mi colega asciende de la primera a la segunda escala'),
    ).toMatchObject({ id: 'career-progression' });
  });

  it('reconoce el destaque por su término y por su forma verbal', () => {
    expect(detectTopicIntent('como destacarme en otro colegio')).toMatchObject({
      id: 'temporary-placement',
      label: 'el destaque docente',
      moduleName: 'Contratación y desplazamientos',
    });
    expect(detectTopicIntent('que causales existen en destaque')).toMatchObject(
      { id: 'temporary-placement' },
    );
  });

  it('no elige un proceso cuando la consulta compara destaque y reasignación', () => {
    expect(
      detectTopicIntent('que diferencia hay entre destaque y reasignacion'),
    ).toBeNull();
  });

  it.each([
    '¿en qué se diferencian el destaque y la reasignación?',
    '¿cuál me conviene: el destaque o la reasignación?',
    'quiero comparar el destaque con la reasignación',
    'comparame el destaque con la reasignación',
    '¿el destaque y la reasignación son lo mismo?',
    '¿es lo mismo el destaque que la reasignación?',
    'destaque vs reasignación',
    '¿son compatibles el destaque y la reasignación?',
    '¿cuál solicito primero: el destaque o la reasignación?',
    '¿cuál es más conveniente: el destaque o la reasignación?',
    '¿cuál me recomiendas, el destaque o la reasignación?',
    '¿en qué se distinguen el destaque y la reasignación?',
    '¿qué ventajas tiene el destaque frente a la reasignación?',
  ])('trata «%s» como una comparación, no como un tema', (question) => {
    // Las dos normas responden la comparación; elegir una sola dejaría fuera
    // la mitad de lo que se preguntó.
    expect(detectTopicIntent(question)).toBeNull();
  });

  it('compara también cuando la equivalencia se niega', () => {
    // «No es lo mismo» pide la diferencia: las dos normas participan.
    expect(
      detectTopicIntent('el destaque no es lo mismo que la reasignacion'),
    ).toBeNull();
  });

  it('no compara cuando la equivalencia negada acompaña una preferencia', () => {
    // Negar la equivalencia y elegir es una decisión: la reasignación conserva
    // su intención y su compuerta.
    expect(
      detectTopicIntent(
        'no es lo mismo el destaque que la reasignacion, prefiero reasignarme',
      ),
    ).toMatchObject({ id: 'reassignment' });
  });

  it.each([
    'no es lo mismo el destaque que la reasignacion, quiero saber la diferencia',
    'no es lo mismo el destaque que la reasignacion, necesito entender',
  ])(
    'compara aunque el turno pida entender la diferencia: «%s»',
    (question) => {
      // «Quiero» y «necesito» no eligen un proceso: la pregunta sigue siendo
      // cuál es la diferencia.
      expect(detectTopicIntent(question)).toBeNull();
    },
  );

  it.each([
    'quiero el destaque, no la reasignacion',
    'no es lo mismo el destaque que la reasignacion, quiero el destaque',
    'prefiero destacarme antes que reasignarme',
    'no quiero reasignarme, quiero el destaque',
    'quiero destacarme, no quiero la reasignacion',
    'voy a solicitar el destaque, no la reasignacion',
    'necesito el destaque, no la reasignacion',
    'no me interesa la reasignacion, quiero el destaque',
  ])(
    'respeta la preferencia por el destaque en un turno que nombra los dos: «%s»',
    (question) => {
      // Elegir el destaque no puede recibir la norma de reasignación, aunque la
      // elección se exprese rechazando la otra.
      expect(detectTopicIntent(question)).toMatchObject({
        id: 'temporary-placement',
      });
    },
  );

  it.each([
    'el destaque no me conviene, quiero reasignarme',
    'no me conviene el destaque, prefiero la reasignación',
    'necesito reasignarme, el destaque no me sirve',
  ])(
    'no confunde una preferencia negada con una comparación: «%s»',
    (question) => {
      // Quien descarta el destaque ya eligió: la reasignación conserva su
      // intención y su compuerta.
      expect(detectTopicIntent(question)).toMatchObject({
        id: 'reassignment',
      });
    },
  );

  it('no elige un solo proceso cuando la persona pide los dos', () => {
    // Sin preferencia legible no se descarta ninguna compuerta: se conserva la
    // intención que el sistema ya reconocía antes de reconocer el destaque.
    expect(
      detectTopicIntent('quiero el destaque y tambien quiero reasignarme'),
    ).toMatchObject({ id: 'reassignment' });
  });

  it('nombra los dos procesos sin compararlos: conserva la reasignación', () => {
    // La comparación deja el tema abierto; una mención de ambos sin comparar
    // conserva la intención que el sistema ya reconocía.
    expect(
      detectTopicIntent(
        'quiero reasignarme a otra ugel y tambien me interesa el destaque',
      ),
    ).toMatchObject({ id: 'reassignment' });
  });

  it('conserva la compuerta médica en un turno que menciona el destaque', () => {
    // La licencia aplica una comprobación clínica que el destaque no tiene:
    // elegir el destaque desactivaría esa compuerta en un turno mixto.
    expect(
      detectTopicIntent('tengo descanso medico, puedo destacarme a otra ugel'),
    ).toMatchObject({ id: 'medical-leave' });
    // La causal médica de la reasignación sigue siendo reasignación.
    expect(
      detectTopicIntent('quiero reasignarme por descanso medico a otra ugel'),
    ).toMatchObject({ id: 'reassignment' });
  });

  it.each([
    // La cifra manda sobre el nombre del proceso, también en el destaque.
    '¿Me siguen pagando si me destaco en otra UGEL?',
    '¿Cuánto me pagan por un destaque?',
    // Negar el trámite no lo abre.
    'No quiero un destaque, quiero renunciar',
    // Un auxiliar no se rige por el destaque de profesores.
    'Soy auxiliar y quiero destacarme en otra IE',
    // El verbo figurado no abre el proceso.
    'Quiero destacar en mi evaluación de desempeño',
  ])('no fuerza el destaque en «%s»', (question) => {
    expect(detectTopicIntent(question)).toBeNull();
  });

  it.each([
    // C05 del arnés de aceptación: consulta de un directivo sobre reemplazo.
    '¿Quién reemplaza al director cuando se encuentra de licencia?',
    // C18: tabla de incrementos de remuneración (tabla comparativa).
    'Muéstrame en una tabla los incrementos de remuneración de los profesores que figuran en los documentos, ordenados del más reciente al más antiguo.',
    // O03: monto por jornada de un contratado.
    'Soy docente contratado de secundaria con jornada de 30 horas. ¿Cuánto debería ganar en 2025? Muéstralo en una tabla y cita el documento y la página.',
  ])(
    'no atribuye una intención de proceso a la consulta de aceptación «%s»',
    (question) => {
      expect(detectTopicIntent(question)?.id).not.toBe('temporary-placement');
      // Y no gasta una búsqueda canónica del destaque en un tema ajeno.
      expect(temporaryPlacementQueries(question)).toEqual([]);
    },
  );

  it('reconoce la expulsión del cargo como tema propio, no como seguimiento', () => {
    // Antes del arreglo, «cuándo es expulsado un docente» no nombraba ningún
    // tema del léxico y el turno heredaba la consulta salarial anterior.
    expect(
      hasTopicTerm(normalizeSpanishText('¿Cuándo es expulsado un docente?')),
    ).toBe(true);
    expect(
      hasTopicTerm(normalizeSpanishText('¿Y si despedir a un docente?')),
    ).toBe(true);
    expect(
      hasTopicTerm(normalizeSpanishText('¿Qué pasa si me expulsan?')),
    ).toBe(true);
    expect(hasTopicTerm(normalizeSpanishText('me expulsaron ayer'))).toBe(true);
    expect(
      hasTopicTerm(normalizeSpanishText('¿procede el despido de un docente?')),
    ).toBe(true);
    expect(
      hasTopicTerm(normalizeSpanishText('¿cuándo termina el año escolar?')),
    ).toBe(true);
    expect(
      hasTopicTerm(normalizeSpanishText('¿cuándo empiezan las clases?')),
    ).toBe(true);
    expect(hasTopicTerm(normalizeSpanishText('la fiesta de despedida'))).toBe(
      false,
    );
    expect(hasTopicTerm(normalizeSpanishText('¿Cómo se calcula?'))).toBe(false);
  });
});
