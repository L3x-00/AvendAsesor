import {
  isDirectTeachingPositionEvidence,
  isHoursDistributionQuestion,
  isPositionClassifierQuestion,
  isPositionConditionQuestion,
  teachingPositionEvidenceQueries,
} from './teaching-position-retrieval';
import { hasTopicTerm } from './domain-lexicon';
import { normalizeSpanishText } from './text-normalization';

/** Fuente asociada al módulo del tema, como la entrega el catálogo. */
function source(
  chunkContent: string,
  documentTitle = 'Norma sobre cargos y plazas',
  moduleNames: readonly string[] = ['Cargos y plazas'],
) {
  return { chunkContent, documentTitle, moduleNames };
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
