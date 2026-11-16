import {
  isDirectTeachingPositionEvidence,
  isHoursDistributionQuestion,
  isPositionClassifierQuestion,
  isPositionConditionQuestion,
  regulatesPositionAspect,
  teachingPositionEvidenceQueries,
  treatsPositionAspect,
} from './teaching-position-retrieval';
import { hasTopicTerm } from './domain-lexicon';
import { normalizeSpanishText } from './text-normalization';

/** Fuente asociada al módulo del tema, como la entrega el catálogo. */
function source(
  chunkContent: string,
  documentTitle = 'Norma sobre cargos y plazas',
  moduleNames: readonly string[] = ['Cargos y plazas'],
  sectionTitle: string | null = null,
) {
  return { chunkContent, documentTitle, moduleNames, sectionTitle };
}

/**
 * Las siete consultas que el Product Owner reportó sobre «Cargo y plazas» y los
 * casos cercanos que pertenecen a otro trámite. La intención se reconoce por
 * combinación de conceptos: «plaza» u «horas» por separado no bastan.
 */
describe('teaching-position-retrieval', () => {
  const hoursQuestion =
    'Qué es el cuadro de distribución de horas y para qué lo usan';
  const decisionQuestion =
    'Soy profesor de secundaria y quiero saber quién decide cuántas horas me tocan';
  const surplusQuestion =
    'Qué significa cuando dicen que mi plaza está excedente';
  const conditionQuestion = 'Diferencia entre plaza orgánica y eventual';
  const classifierQuestion =
    'Dónde puedo revisar el clasificador de cargos de mi colegio';

  describe('isHoursDistributionQuestion', () => {
    it.each([hoursQuestion, decisionQuestion])(
      'reconoce la distribución de horas en «%s»',
      (question) => {
        expect(isHoursDistributionQuestion(question)).toBe(true);
      },
    );

    it('no confunde la jornada extraordinaria con la distribución de horas', () => {
      expect(
        isHoursDistributionQuestion('¿Me pagan las horas extras que trabajé?'),
      ).toBe(false);
    });

    it('no toma una pregunta genérica por horas como distribución', () => {
      expect(
        isHoursDistributionQuestion('¿Cuántas horas de clase tengo?'),
      ).toBe(false);
      expect(
        isHoursDistributionQuestion('¿Cómo justifico una inasistencia?'),
      ).toBe(false);
    });

    it('reconoce la carga horaria por su nombre técnico', () => {
      expect(
        isHoursDistributionQuestion(
          '¿Cómo se determina mi carga horaria en el colegio?',
        ),
      ).toBe(true);
    });

    it('no toma la asistencia por la distribución de horas', () => {
      // «quién» suelto no decide la asignación: estas consultas son faltas.
      expect(
        isHoursDistributionQuestion(
          '¿Quién me autoriza a faltar a mis horas de clase?',
        ),
      ).toBe(false);
      expect(
        isHoursDistributionQuestion(
          '¿A quién le aviso si no puedo dictar mi hora de clase?',
        ),
      ).toBe(false);
      expect(
        isHoursDistributionQuestion(
          '¿Quién controla las horas de clase de los profesores?',
        ),
      ).toBe(true);
    });

    it('reconoce la forma verbal de dictar', () => {
      expect(isHoursDistributionQuestion('¿Cuántas horas dicto?')).toBe(true);
    });
  });

  describe('isPositionConditionQuestion', () => {
    it.each([surplusQuestion, conditionQuestion])(
      'reconoce la condición de la plaza en «%s»',
      (question) => {
        expect(isPositionConditionQuestion(question)).toBe(true);
      },
    );

    it('reconoce la plaza eventual en singular y en plural', () => {
      expect(isPositionConditionQuestion('¿Qué es una plaza eventual?')).toBe(
        true,
      );
      expect(
        isPositionConditionQuestion('Mi plaza es eventual, qué significa'),
      ).toBe(true);
      expect(
        isPositionConditionQuestion('¿Qué son las plazas eventuales?'),
      ).toBe(true);
    });

    it('no toma una plaza vacante por la condición de la plaza', () => {
      expect(
        isPositionConditionQuestion('¿Cómo me inscribo a una plaza vacante?'),
      ).toBe(false);
    });

    it('deja la reducción por matrícula a la racionalización', () => {
      expect(
        isPositionConditionQuestion(
          'Si en mi colegio hay pocos alumnos, ¿pueden quitar una plaza docente?',
        ),
      ).toBe(false);
    });

    it('reconoce la excedencia de una plaza sin pronombre posesivo', () => {
      expect(
        isPositionConditionQuestion('¿Qué pasa si la plaza queda excedente?'),
      ).toBe(true);
    });

    it('no se apropia de una consulta que ya nombró otro proceso', () => {
      // El proceso nombrado manda: con la intención de por medio, la compuerta
      // de evidencia convertiría una respuesta sustentada en «sin evidencia».
      expect(
        isPositionConditionQuestion(
          'Durante el destaque sigo ocupando mi plaza orgánica',
        ),
      ).toBe(false);
      expect(
        isPositionConditionQuestion(
          'Me dieron destaque en otra UGEL, conservo mi plaza orgánica',
        ),
      ).toBe(false);
      expect(
        isPositionConditionQuestion(
          'Estoy encargado como director, ¿pierdo mi plaza orgánica?',
        ),
      ).toBe(false);
      expect(
        isPositionConditionQuestion(
          'Si me reasignan, mantengo mi plaza orgánica',
        ),
      ).toBe(false);
      expect(
        isPositionConditionQuestion(
          'En la racionalización, ¿mi plaza orgánica desaparece?',
        ),
      ).toBe(false);
    });

    it('reconoce el tema cuando la persona nombra su propia condición', () => {
      // «contratado» es la condición del consultante, no el proceso de
      // contratación: la pregunta sigue siendo del tema.
      expect(
        isPositionConditionQuestion(
          'Soy contratado y quiero saber qué es una plaza eventual',
        ),
      ).toBe(true);
      // «encargado» sí nombra un proceso, pero la consulta pide la definición
      // del tema: la duda conceptual manda sobre la circunstancia.
      expect(
        isPositionConditionQuestion(
          'Estoy encargado como director y no sé qué es una plaza orgánica',
        ),
      ).toBe(true);
    });

    it('no se apropia de una consulta sobre el cese ni sobre el ascenso', () => {
      // La guarda cubre la conjugación real: «cesan» no es «cese» y «asciendo»
      // no es «asciende».
      expect(
        isPositionConditionQuestion(
          'Si cesan en el cargo, ¿pierdo mi plaza orgánica?',
        ),
      ).toBe(false);
      expect(
        isPositionConditionQuestion(
          'Si asciendo de escala, ¿cambia mi plaza orgánica?',
        ),
      ).toBe(false);
    });

    it('no toma un «qué significa» que rige al proceso y no a la plaza', () => {
      // El verbo de definición tiene que regir al término consultado.
      expect(
        isPositionConditionQuestion(
          'Qué significa que durante el destaque mantenga mi plaza orgánica',
        ),
      ).toBe(false);
      expect(
        isPositionConditionQuestion(
          'Qué significa que me cesen y quede mi plaza orgánica',
        ),
      ).toBe(false);
      expect(
        isPositionConditionQuestion('Qué significa una plaza orgánica'),
      ).toBe(true);
    });
  });

  describe('isPositionClassifierQuestion', () => {
    it('reconoce el clasificador y la clasificación de cargos', () => {
      expect(isPositionClassifierQuestion(classifierQuestion)).toBe(true);
      expect(
        isPositionClassifierQuestion('¿Dónde veo la clasificación de cargos?'),
      ).toBe(true);
    });

    it('no toma cualquier mención de un cargo como clasificador', () => {
      expect(
        isPositionClassifierQuestion(
          '¿Qué requisitos tiene el cargo de director?',
        ),
      ).toBe(false);
    });
  });

  describe('teachingPositionEvidenceQueries', () => {
    it('traduce el léxico coloquial a la denominación del corpus', () => {
      expect(
        teachingPositionEvidenceQueries(hoursQuestion).join(' '),
      ).toContain('cuadro de distribución de horas');
      expect(
        teachingPositionEvidenceQueries(conditionQuestion).join(' '),
      ).toContain('plaza orgánica');
      expect(
        teachingPositionEvidenceQueries(classifierQuestion).join(' '),
      ).toContain('clasificador de cargos');
    });

    it('no propone consultas canónicas para otro trámite', () => {
      expect(
        teachingPositionEvidenceQueries(
          '¿Cuánto gana un docente de secundaria?',
        ),
      ).toEqual([]);
      expect(
        teachingPositionEvidenceQueries(
          'en mi colegio estan bajando los alumnos y dicen que van a reducir plazas',
        ),
      ).toEqual([]);
    });

    it('no añade consultas canónicas a una pregunta de cifra', () => {
      // La carga horaria es un factor del monto, no el tema consultado.
      expect(
        teachingPositionEvidenceQueries(
          'mi carga horaria es de 30 horas y me pagan poco',
        ),
      ).toEqual([]);
    });

    it('produce consultas para las cinco preguntas del Product Owner', () => {
      // Ninguna de ellas es una pregunta de cifra: el filtro salarial no debe
      // dejarlas sin expansiones.
      for (const question of [
        hoursQuestion,
        decisionQuestion,
        surplusQuestion,
        conditionQuestion,
        classifierQuestion,
      ]) {
        expect(
          teachingPositionEvidenceQueries(question).length,
        ).toBeGreaterThan(0);
      }
    });
  });

  describe('isDirectTeachingPositionEvidence', () => {
    it('admite la norma que regula el cuadro de distribución de horas', () => {
      expect(
        isDirectTeachingPositionEvidence(
          hoursQuestion,
          source(
            'El cuadro de distribución de horas de clase se elabora antes del inicio del año escolar.',
          ),
        ),
      ).toBe(true);
    });

    it('acusa una mención de horas dentro de otro procedimiento', () => {
      expect(
        isDirectTeachingPositionEvidence(
          hoursQuestion,
          source(
            'El profesor contratado percibe una remuneración acorde a la jornada laboral de treinta horas.',
          ),
        ),
      ).toBe(false);
    });

    it('admite la norma que define la plaza orgánica y la eventual', () => {
      expect(
        isDirectTeachingPositionEvidence(
          conditionQuestion,
          source(
            'La plaza orgánica se crea por resolución y la plaza eventual se atiende con contrato.',
          ),
        ),
      ).toBe(true);
    });

    it('admite la plaza eventual en singular cuando la norma la define', () => {
      expect(
        isDirectTeachingPositionEvidence(
          '¿Qué es una plaza eventual?',
          source(
            'Se entiende por plaza eventual la que se atiende con contrato mientras exista la necesidad de servicio.',
          ),
        ),
      ).toBe(true);
    });

    it('no admite horas administrativas aunque la norma esté en el módulo', () => {
      // La asociación al módulo no basta: el fragmento debe tratar las horas
      // del colegio, no la jornada de otro régimen.
      const administrative = [
        'La carga horaria del personal administrativo es de cuarenta horas semanales.',
        'La distribución de horas del personal de apoyo se aprueba por la dirección de la entidad.',
        'El profesor contratado percibe una remuneración acorde a la jornada laboral de treinta horas.',
      ];
      for (const content of administrative) {
        expect(
          isDirectTeachingPositionEvidence(
            hoursQuestion,
            source(content, 'Norma de cargos y plazas', ['Cargos y plazas']),
          ),
        ).toBe(false);
      }
    });

    it('admite las redacciones legales que definen la plaza', () => {
      const definitions = [
        'La plaza orgánica es aquella que se crea por resolución de creación de la institución educativa.',
        'Plaza orgánica: plaza creada por resolución y que figura en el cuadro de plazas de la institución educativa.',
        'Se denomina plaza eventual a la que se atiende con contrato mientras exista la necesidad de servicio.',
      ];
      for (const content of definitions) {
        expect(
          isDirectTeachingPositionEvidence(conditionQuestion, source(content)),
        ).toBe(true);
      }
    });

    it('admite la norma que titula el aspecto aunque esté en otro módulo', () => {
      // La catalogación puede dejar la norma en «Ley y reglamento»; el título y
      // la sección siguen identificando qué regula.
      expect(
        isDirectTeachingPositionEvidence(
          conditionQuestion,
          source(
            'Se entiende por plaza orgánica la creada por resolución; la plaza eventual se atiende con contrato.',
            'Normas sobre plazas orgánicas y eventuales',
            ['Ley y reglamento'],
          ),
        ),
      ).toBe(true);
      expect(
        isDirectTeachingPositionEvidence(
          classifierQuestion,
          source(
            'El documento describe los niveles y requisitos de cada grupo ocupacional.',
            'Clasificador de cargos de la institución educativa',
            ['Ley y reglamento'],
          ),
        ),
      ).toBe(true);
    });

    it('no abre la puerta por el título si la norma no trata el aspecto', () => {
      expect(
        isDirectTeachingPositionEvidence(
          conditionQuestion,
          source(
            'El destaque se autoriza al profesor nombrado sin que pierda la plaza de origen.',
            'Norma sobre plazas orgánicas y eventuales',
            ['Contratación y desplazamientos'],
          ),
        ),
      ).toBe(false);
    });

    it('acusa una mención suelta de la plaza eventual', () => {
      // Una mención no es una norma que regule el tema.
      expect(
        isDirectTeachingPositionEvidence(
          '¿Qué es una plaza eventual?',
          source(
            'El profesor ocupa una plaza eventual en la institución educativa.',
          ),
        ),
      ).toBe(false);
    });

    it('acusa una plaza mencionada en otro trámite', () => {
      expect(
        isDirectTeachingPositionEvidence(
          conditionQuestion,
          source(
            'El destaque se autoriza sin perder la plaza de origen del profesor.',
          ),
        ),
      ).toBe(false);
    });

    it('acusa el clasificador cuando la consulta pide otra cosa', () => {
      expect(
        isDirectTeachingPositionEvidence(
          'soy nombrado y mi colegio entró a racionalización, ¿me pueden mandar a otra escuela?',
          source(
            'El clasificador de cargos de la institución educativa describe los niveles y requisitos.',
          ),
        ),
      ).toBe(false);
    });

    it('no admite una sección homónima en una norma de otro proceso', () => {
      // El encabezado no basta: la sección «De la plaza orgánica» existe en la
      // encargatura y «Carga horaria» en la contratación. Aunque el fragmento
      // defina el término, la norma regula otro proceso y la catalogación lo
      // dice.
      expect(
        isDirectTeachingPositionEvidence(
          conditionQuestion,
          source(
            'La plaza orgánica es la plaza de origen que el profesor encargado conserva mientras dura la encargatura.',
            'Norma técnica de encargatura de cargos directivos',
            ['Contratación y desplazamientos'],
            'De la plaza orgánica',
          ),
        ),
      ).toBe(false);
      const contractHours =
        'El profesor contratado cumple una carga horaria de treinta horas cronológicas semanales que se aprueba por resolución de la dirección.';
      expect(
        isDirectTeachingPositionEvidence(
          hoursQuestion,
          source(
            contractHours,
            'Norma del proceso de contratación docente',
            ['Contratación y desplazamientos'],
            'Carga horaria y jornada del contrato',
          ),
        ),
      ).toBe(false);
      // Ni siquiera la catalogación en el módulo del tema convierte una jornada
      // contractual en el cuadro de distribución de horas.
      expect(
        isDirectTeachingPositionEvidence(
          hoursQuestion,
          source(contractHours, 'Norma de cargos y plazas', [
            'Cargos y plazas',
          ]),
        ),
      ).toBe(false);
      expect(
        isDirectTeachingPositionEvidence(
          hoursQuestion,
          source(
            'La jornada laboral del docente comprende treinta horas cronológicas semanales y se distribuye en horas pedagógicas.',
            'Norma de cargos y plazas',
            ['Cargos y plazas'],
          ),
        ),
      ).toBe(false);
    });

    it('no abre la puerta desde los demás módulos del catálogo', () => {
      // Los módulos raíz reales incluyen «Auxiliar de educación» y
      // «Situaciones administrativas»; una norma catalogada en ellos regula su
      // proceso aunque la sección nombre el tema.
      expect(
        isDirectTeachingPositionEvidence(
          hoursQuestion,
          source(
            'La carga horaria de los auxiliares se distribuye en la institución educativa según el turno asignado.',
            'Norma sobre el trabajo de los auxiliares de educación',
            ['Auxiliar de educación'],
            'Distribución de horas',
          ),
        ),
      ).toBe(false);
      expect(
        isDirectTeachingPositionEvidence(
          conditionQuestion,
          source(
            'La plaza orgánica es la plaza de origen que conserva el servidor mientras se encuentre en situación administrativa.',
            'Norma de situaciones administrativas',
            ['Situaciones administrativas'],
            'De la plaza orgánica',
          ),
        ),
      ).toBe(false);
      // Un módulo genérico no lava la asociación con otro proceso.
      expect(
        isDirectTeachingPositionEvidence(
          conditionQuestion,
          source(
            'La plaza orgánica se crea por resolución y la plaza eventual se atiende con contrato.',
            'Normas sobre plazas orgánicas y eventuales',
            ['Remuneraciones', 'Ley y reglamento'],
          ),
        ),
      ).toBe(false);
      // La doble asociación con el módulo del tema conserva la respuesta.
      expect(
        isDirectTeachingPositionEvidence(
          conditionQuestion,
          source(
            'La plaza orgánica se crea por resolución y la plaza eventual se atiende con contrato.',
            'Norma sobre cargos y plazas',
            ['Cargos y plazas', 'Contratación y desplazamientos'],
          ),
        ),
      ).toBe(true);
    });

    it('admite la sección que nombra el aspecto en un reglamento', () => {
      // La ley y su reglamento pueden estar en «Ley y reglamento»: el encabezado
      // «De las plazas» con la definición en el texto identifica la fuente.
      expect(
        isDirectTeachingPositionEvidence(
          conditionQuestion,
          source(
            'La plaza orgánica se crea por resolución y la plaza eventual se atiende con contrato mientras exista la necesidad de servicio.',
            'Reglamento de la Ley de Reforma Magisterial',
            ['Ley y reglamento'],
            'De las plazas',
          ),
        ),
      ).toBe(true);
    });

    it('admite el fragmento que distribuye horas del colegio bajo esa sección', () => {
      expect(
        isDirectTeachingPositionEvidence(
          hoursQuestion,
          source(
            'Las horas se distribuyen entre las secciones según el plan de estudios aprobado para el año escolar.',
            'Norma sobre cargos y plazas',
            ['Cargos y plazas'],
            'Distribución de horas',
          ),
        ),
      ).toBe(true);
    });

    it('admite la clasificación de las plazas en orgánicas y eventuales', () => {
      expect(
        isDirectTeachingPositionEvidence(
          conditionQuestion,
          source(
            'Las plazas se clasifican en orgánicas y eventuales según su forma de creación.',
          ),
        ),
      ).toBe(true);
    });

    it('identifica el cuadro de horas por su título aunque esté en otro módulo', () => {
      // La denominación completa del proceso en el título identifica la fuente
      // sin depender de la catalogación.
      expect(
        isDirectTeachingPositionEvidence(
          hoursQuestion,
          source(
            'La carga horaria se distribuye entre las secciones de la institución educativa según el plan de estudios.',
            'Norma técnica del cuadro de distribución de horas',
            ['Ley y reglamento'],
            'Jornada del personal docente',
          ),
        ),
      ).toBe(true);
    });

    it('identifica la sección de distribución de horas cuando el cuerpo la distribuye', () => {
      expect(
        isDirectTeachingPositionEvidence(
          hoursQuestion,
          source(
            'Las horas se distribuyen entre las secciones según el plan de estudios aprobado para el año escolar.',
            'Reglamento de la Ley de Reforma Magisterial',
            ['Ley y reglamento'],
            'Distribución de horas',
          ),
        ),
      ).toBe(true);
    });

    it('no acepta la sección homónima si el cuerpo no distribuye las horas', () => {
      // «Distribución de horas» como sección de un listado de instrumentos no
      // convierte la norma en el cuadro de distribución de horas del colegio.
      expect(
        isDirectTeachingPositionEvidence(
          hoursQuestion,
          source(
            'El cuadro de distribución de horas es un instrumento de gestión de la institución educativa.',
            'Norma sobre instrumentos de gestión',
            ['Ley y reglamento'],
            'Distribución de horas',
          ),
        ),
      ).toBe(false);
    });

    it('identifica el clasificador de cargos por su título y por su sección', () => {
      expect(
        isDirectTeachingPositionEvidence(
          classifierQuestion,
          source(
            'El instrumento ordena los puestos de trabajo y los grupos ocupacionales de la entidad.',
            'Ley de reforma magisterial',
            ['Ley y reglamento'],
            'Clasificador de cargos de la institución educativa',
          ),
        ),
      ).toBe(true);
      expect(
        isDirectTeachingPositionEvidence(
          classifierQuestion,
          source(
            'La clasificación de cargos agrupa los puestos según sus funciones y responsabilidades.',
            'Ley de reforma magisterial',
            ['Ley y reglamento'],
            'Clasificación de cargos',
          ),
        ),
      ).toBe(true);
    });

    it('admite el clasificador descrito por lo que ordena', () => {
      expect(
        isDirectTeachingPositionEvidence(
          classifierQuestion,
          source(
            'El clasificador de cargos es el instrumento que ordena los puestos de trabajo de la institución educativa.',
          ),
        ),
      ).toBe(true);
      expect(
        isDirectTeachingPositionEvidence(
          classifierQuestion,
          source(
            'La institución cuenta con el PEI, el MOF, el CAP y el clasificador de cargos como instrumentos de gestión.',
          ),
        ),
      ).toBe(false);
    });

    it('usa el título de la norma cuando el fragmento no informa su módulo', () => {
      // El fragmento puede llegar sin asociaciones; el título es entonces la
      // única identidad documental disponible.
      expect(
        isDirectTeachingPositionEvidence(hoursQuestion, {
          chunkContent:
            'El cuadro de distribución de horas de clase se elabora antes del inicio del año escolar.',
          documentTitle: 'Norma sobre cargos y plazas',
        }),
      ).toBe(true);
      expect(
        isDirectTeachingPositionEvidence(hoursQuestion, {
          chunkContent:
            'El cuadro de distribución de horas de clase se elabora antes del inicio del año escolar.',
          documentTitle: 'Norma técnica del destaque docente',
        }),
      ).toBe(false);
      expect(
        isDirectTeachingPositionEvidence(hoursQuestion, {
          chunkContent:
            'El cuadro de distribución de horas de clase se elabora antes del inicio del año escolar.',
          documentTitle: 'Norma sobre cargos y plazas',
          moduleNames: [],
        }),
      ).toBe(true);
    });

    it('no admite la mención incidental en una norma de otro módulo', () => {
      // Cada una de estas frases aparece en otro trámite: la fuente es de otro
      // módulo aunque el texto contenga la denominación del aspecto.
      const incidental = [
        [
          hoursQuestion,
          'El profesor contratado cumple una carga horaria de treinta horas cronológicas.',
          'Norma del proceso de contratación docente',
          ['Contratación y desplazamientos'],
        ],
        [
          hoursQuestion,
          'La distribución de horas del personal administrativo se aprueba por la dirección.',
          'Norma de personal administrativo',
          ['Ley y reglamento'],
        ],
        [
          conditionQuestion,
          'El profesor destacado conserva su plaza orgánica de origen.',
          'Norma técnica del destaque docente',
          ['Contratación y desplazamientos'],
        ],
        [
          conditionQuestion,
          'El encargado ejerce el cargo sin dejar su plaza orgánica.',
          'Norma de encargatura de cargos directivos',
          ['Contratación y desplazamientos'],
        ],
        [
          conditionQuestion,
          'La reasignación no altera la condición de la plaza orgánica del profesor.',
          'Norma técnica de la reasignación docente',
          ['Contratación y desplazamientos'],
        ],
        [
          conditionQuestion,
          'Las plazas excedentes se determinan al cierre del proceso de matrícula.',
          'Norma técnica de racionalización de plazas',
          ['Cargos y plazas'],
        ],
        [
          classifierQuestion,
          'La entidad se complementa con el clasificador de cargos de la entidad.',
          'Norma de organización municipal',
          ['Ley y reglamento'],
        ],
      ] as const;
      for (const [question, content, title, modules] of incidental) {
        expect(
          isDirectTeachingPositionEvidence(
            question,
            source(content, title, modules),
          ),
        ).toBe(false);
      }
    });
  });

  /**
   * La compuerta sin la pregunta: se usa cuando el proceso viene del hilo. El
   * cuerpo decide si el fragmento regula el aspecto, y la fuente se acepta por su
   * módulo o por un encabezado que lo nombre con la misma fuerza.
   */
  describe('treatsPositionAspect', () => {
    it('admite la fuente del módulo que define la plaza', () => {
      expect(
        treatsPositionAspect(
          source(
            'La plaza orgánica se crea por resolución y la plaza eventual se atiende con contrato.',
          ),
          'condition',
        ),
      ).toBe(true);
    });

    it('no admite la mención de paso en una norma de otro proceso', () => {
      expect(
        treatsPositionAspect(
          source(
            'Durante el destaque el profesor conserva su plaza orgánica de origen.',
            'Norma técnica del destaque docente',
            ['Contratación y desplazamientos'],
            'De los derechos del destacado',
          ),
          'condition',
        ),
      ).toBe(false);
    });

    it('admite por encabezado cuando el catálogo no atribuye la norma a otro proceso', () => {
      expect(
        treatsPositionAspect(
          source(
            'El cuadro de distribución de horas de clase se elabora antes del inicio del año escolar.',
            'Norma sobre cargos y plazas',
            ['Ley y reglamento'],
            'Del cuadro de distribución de horas',
          ),
          'hours',
        ),
      ).toBe(true);
    });
  });

  /**
   * La comprobación de cuerpo es la que impide que la norma del tema pase por
   * otro trámite: el encabezado puede titularse «Plaza orgánica y plaza
   * eventual» sin regular la plaza, porque es la sección donde vive otro asunto.
   */
  describe('regulatesPositionAspect', () => {
    it('reconoce el cuerpo que clasifica las plazas', () => {
      expect(
        regulatesPositionAspect(
          'La plaza orgánica se crea por resolución y la plaza eventual se atiende con contrato.',
          'condition',
        ),
      ).toBe(true);
    });

    it('no confunde la mención del destaque ni el plazo', () => {
      expect(
        regulatesPositionAspect(
          'Durante el destaque el profesor conserva su plaza orgánica de origen.',
          'condition',
        ),
      ).toBe(false);
      expect(
        regulatesPositionAspect(
          'El plazo para presentar la solicitud es de quince días hábiles.',
          'condition',
        ),
      ).toBe(false);
    });

    it('no confunde la jornada del contrato con el cuadro de horas', () => {
      expect(
        regulatesPositionAspect(
          'El profesor contratado cumple una carga horaria de treinta horas cronológicas semanales.',
          'hours',
        ),
      ).toBe(false);
    });
  });

  describe('léxico del tema', () => {
    it('reconoce el cuadro de distribución de horas como tema propio', () => {
      expect(hasTopicTerm(normalizeSpanishText(hoursQuestion))).toBe(true);
      expect(
        hasTopicTerm(
          normalizeSpanishText(
            '¿Dónde puedo revisar el clasificador de cargos del colegio?',
          ),
        ),
      ).toBe(true);
    });

    it('no convierte una cifra de horas en un tema', () => {
      // La jornada y las horas pedagógicas son factores del monto: si el léxico
      // las tratara como tema, la herencia de la pregunta salarial se cortaría.
      expect(hasTopicTerm(normalizeSpanishText('30 horas pedagogicas'))).toBe(
        false,
      );
      expect(
        hasTopicTerm(normalizeSpanishText('mi carga horaria es de 30 horas')),
      ).toBe(true);
      expect(
        hasTopicTerm(normalizeSpanishText('distribucion de horas de trabajo')),
      ).toBe(false);
    });
  });
});
