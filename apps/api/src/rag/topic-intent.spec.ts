import { detectTopicIntent } from './topic-intent';
import { reassignmentRole } from './reassignment-retrieval';

/**
 * El chat general identifica la intención principal de cada consulta sin que la
 * persona elija un módulo. Las pruebas fijan las siete consultas reportadas y
 * varios casos cercanos que NO deben activar una intención (una consulta
 * salarial, una licencia genérica, una permuta o una pregunta de jornada).
 */
describe('detectTopicIntent', () => {
  it.each([
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
      'cuando es expulsado el docente',
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
});
