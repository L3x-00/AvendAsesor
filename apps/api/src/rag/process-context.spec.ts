import {
  belongsToAdmittedProcedure,
  belongsToAdmittedVersion,
  inheritedTopicIntent,
  isProcessDependentTurn,
  processCanonicalQuery,
  processQueriesForIntent,
  treatsInheritedProcess,
  treatsProcessIntent,
} from './process-context';
import { detectTopicIntent, type TopicIntent } from './topic-intent';

/** Intención reconocida de una consulta; falla si no la hay. */
function intent(question: string): TopicIntent {
  const detected = detectTopicIntent(question);
  if (!detected) throw new Error(`Sin intención para «${question}»`);
  return detected;
}

/**
 * El hilo aporta el proceso cuando la consulta actual no lo nombra. Estas
 * pruebas fijan los dos límites que no deben cruzarse: heredar de más
 * (inventar el proceso) y heredar de menos (volver a buscar una consulta sin
 * tema y terminar en «sin evidencia»).
 */
describe('contexto de proceso del hilo', () => {
  describe('isProcessDependentTurn', () => {
    it.each([
      'que hacer para postular por causal de salud',
      'y por unidad familiar?',
      'cuales son los requisitos',
      'que plazo tengo',
      'y como lo presento',
      'cuanto dura ese tramite',
    ])('reconoce que «%s» depende del proceso abierto', (question) => {
      expect(isProcessDependentTurn(question)).toBe(true);
    });

    it.each([
      'cuanto gana un auxiliar de educacion',
      'hola',
      'cual es la capital del peru',
      'cuando empieza el ano escolar',
    ])('no ata «%s» a ningún proceso', (question) => {
      expect(isProcessDependentTurn(question)).toBe(false);
    });
  });

  describe('inheritedTopicIntent', () => {
    it('hereda el destaque cuando el seguimiento solo nombra la causal', () => {
      expect(
        inheritedTopicIntent('que hacer para postular por causal de salud', [
          'como destacarme en otro colegio',
        ]),
      ).toMatchObject({
        id: 'temporary-placement',
        moduleName: 'Contratación y desplazamientos',
      });
    });

    it('hereda la reasignación de un hilo anterior sobre ese proceso', () => {
      expect(
        inheritedTopicIntent('y cuales son los requisitos', [
          'cuanto gana un docente nombrado',
          'quiero reasignarme a otra ugel porque mi familia vive alla',
        ]),
      ).toMatchObject({ id: 'reassignment' });
    });

    it('conserva el régimen auxiliar en una licencia heredada', () => {
      // El régimen viene del turno que abrió el hilo, no del módulo de la
      // intención: sin esto, un auxiliar recibiría la norma de profesores.
      const intent = inheritedTopicIntent('y los requisitos', [
        'soy auxiliar de educacion y necesito descanso medico',
      ]);
      expect(intent).toMatchObject({
        id: 'medical-leave',
        moduleName: 'Auxiliar de educación',
      });
      expect(
        intent && processCanonicalQuery(intent, 'y los requisitos'),
      ).toContain('auxiliares de educación');
      // Un docente conserva el régimen docente.
      expect(
        inheritedTopicIntent('y los requisitos', [
          'soy docente y necesito descanso medico',
        ]),
      ).toMatchObject({
        id: 'medical-leave',
        moduleName: 'Situaciones Administrativas',
      });
    });

    it('toma el proceso más reciente del hilo', () => {
      expect(
        inheritedTopicIntent('y el plazo?', [
          'quiero reasignarme a otra ugel',
          'y como solicito un destaque',
        ]),
      ).toMatchObject({ id: 'temporary-placement' });
    });

    it('no hereda cuando la consulta nombra su propio tema', () => {
      expect(
        inheritedTopicIntent('que requisitos tiene la permuta', [
          'como destacarme en otro colegio',
        ]),
      ).toBeNull();
      expect(
        inheritedTopicIntent('y la licencia por incapacidad temporal?', [
          'como destacarme en otro colegio',
        ]),
      ).toBeNull();
    });

    it('no hereda cuando la consulta se responde por sí misma', () => {
      expect(
        inheritedTopicIntent('cuanto gana un auxiliar de educacion', [
          'como destacarme en otro colegio',
        ]),
      ).toBeNull();
    });

    it('no hereda de un mensaje sintético del propio servicio', () => {
      expect(
        inheritedTopicIntent('y los requisitos?', [
          'Propuesta aceptada: el destaque permite trasladarse temporalmente',
          'Respuesta anterior: la reasignacion exige tres anos',
        ]),
      ).toBeNull();
    });

    it('no hereda sin turnos previos', () => {
      expect(inheritedTopicIntent('y los requisitos?', [])).toBeNull();
    });

    it('no hereda de un hilo que nunca nombró un proceso', () => {
      expect(
        inheritedTopicIntent('y los requisitos?', [
          'cuanto gana un docente contratado',
          'hola, soy docente',
        ]),
      ).toBeNull();
    });

    it('ignora los turnos previos vacíos', () => {
      expect(
        inheritedTopicIntent('y el plazo?', [
          'como destacarme en otro colegio',
          '',
        ]),
      ).toMatchObject({ id: 'temporary-placement' });
    });

    it('mantiene el proceso a lo largo de varios turnos sin repetirlo', () => {
      // El turno 2 tampoco nombra el proceso: la cadena no se corta porque el
      // proceso sigue siendo el último que la persona nombró.
      const history = [
        'renovacion de destaque hay?',
        'que causales existen',
        'que hacer para postular por causal de salud',
      ];
      expect(
        inheritedTopicIntent('y que documentos presento', history),
      ).toMatchObject({ id: 'temporary-placement' });
      // La causal del turno nuevo se sigue reflejando en la consulta.
      expect(
        processQueriesForIntent(
          inheritedTopicIntent('y que documentos presento', history),
          'y que documentos presento',
        )[0],
      ).toContain('destaque docente');
    });

    it('cambia de proceso cuando un turno intermedio nombra otro', () => {
      const history = [
        'como destacarme en otro colegio',
        'quiero reasignarme a otra ugel por unidad familiar',
      ];
      expect(
        inheritedTopicIntent('y que requisitos piden', history),
      ).toMatchObject({
        id: 'reassignment',
      });
      expect(
        processQueriesForIntent(
          inheritedTopicIntent('y que requisitos piden', history),
          'y que requisitos piden',
        )[0],
      ).toContain('reasignación docente');
    });

    it('no arrastra el proceso a una consulta salarial autónoma intermedia', () => {
      const history = [
        'como destacarme en otro colegio',
        'cuanto gana un docente nombrado de secundaria',
      ];
      expect(
        inheritedTopicIntent(
          'cuanto gana un docente nombrado de secundaria',
          history,
        ),
      ).toBeNull();
      // Pero el tema sigue disponible para el turno siguiente que sí depende.
      expect(inheritedTopicIntent('y el plazo?', history)).toMatchObject({
        id: 'temporary-placement',
      });
    });
  });

  describe('processCanonicalQuery', () => {
    it('usa la denominación del corpus para cada proceso', () => {
      expect(processCanonicalQuery(intent('como destacarme'), 'x')).toContain(
        'destaque docente',
      );
      expect(
        processCanonicalQuery(intent('quiero reasignarme a otra ugel'), 'x'),
      ).toContain('reasignación docente');
      expect(
        processCanonicalQuery(
          intent(
            'en mi colegio estan bajando los alumnos y dicen que van a reducir plazas',
          ),
          'x',
        ),
      ).toContain('racionalización de plazas');
    });

    it('completa la consulta con la causal declarada', () => {
      const query = processCanonicalQuery(
        intent('como destacarme'),
        'que hacer para postular por causal de salud',
      );
      expect(query).toContain('destaque docente');
      expect(query).toContain('salud');
    });

    it('conserva el régimen del auxiliar heredado', () => {
      // El auxiliar de educación tiene su propio procedimiento: buscar la
      // denominación docente le entregaría la norma equivocada.
      const auxiliarReassignment = intent(
        'soy auxiliar y quiero reasignarme a otra ugel',
      );
      expect(auxiliarReassignment.moduleName).toBe('Auxiliar de educación');
      const query = processCanonicalQuery(
        auxiliarReassignment,
        'y los requisitos',
      );
      expect(query).toContain('auxiliares de educación');
      expect(query).not.toContain('docente');
    });
  });

  describe('processQueriesForIntent', () => {
    it('solo agrega vocabulario de búsqueda, sin afirmar el trámite', () => {
      const queries = processQueriesForIntent(
        inheritedTopicIntent(
          'que hacer para postular por causal de unidad familiar',
          ['como destacarme en otro colegio'],
        ),
        'que hacer para postular por causal de unidad familiar',
      );
      expect(queries).toHaveLength(1);
      expect(queries[0]).toContain('destaque docente');
      expect(queries[0]).toContain('unidad familiar');
    });

    it('no agrega consultas sin proceso heredado', () => {
      expect(
        processQueriesForIntent(
          inheritedTopicIntent('como destaco a otro colegio', [
            'quiero reasignarme a otra ugel',
          ]),
          'como destaco a otro colegio',
        ),
      ).toEqual([]);
      expect(processQueriesForIntent(null, 'y los requisitos?')).toEqual([]);
    });
  });

  describe('treatsProcessIntent', () => {
    it('evalúa el fragmento cuando el turno no repite el proceso', () => {
      expect(
        treatsProcessIntent(intent('como destacarme'), {
          chunkContent:
            'El destaque se solicita para desempeñar funciones en otra IE.',
          documentTitle: 'RSG N.° 326-2017-MINEDU',
        }),
      ).toBe(true);
      expect(
        treatsProcessIntent(intent('como destacarme'), {
          chunkContent: 'Los requisitos generales de contratación docente.',
          documentTitle: 'RSG N.° 326-2017-MINEDU',
        }),
      ).toBe(false);
    });

    it('exige el régimen del auxiliar en los procesos compartidos', () => {
      const auxiliar = intent('soy auxiliar y quiero reasignarme');
      const docenteChunk = {
        chunkContent:
          'La reasignación del profesor nombrado se solicita ante la UGEL.',
        documentTitle: 'Norma técnica de reasignación y permuta',
      };
      expect(treatsProcessIntent(auxiliar, docenteChunk)).toBe(false);
      expect(
        treatsProcessIntent(auxiliar, {
          chunkContent:
            'La reasignación de los auxiliares de educación se solicita ante la UGEL.',
          documentTitle: 'Norma técnica de reasignación y permuta',
        }),
      ).toBe(true);
      // El sentido inverso también: un docente no recibe un fragmento que solo
      // rige a los auxiliares.
      const docente = intent(
        'soy docente nombrado y quiero reasignarme a otra ugel',
      );
      expect(
        treatsProcessIntent(docente, {
          chunkContent:
            'Los auxiliares de educación presentan su solicitud de reasignación ante la UGEL.',
          documentTitle: 'RSG N.° 326-2017-MINEDU',
        }),
      ).toBe(false);
      expect(treatsProcessIntent(docente, docenteChunk)).toBe(true);
      // «Auxiliares de la UGEL» es una función administrativa, no el régimen:
      // el fragmento se evalúa por su contenido, no por la palabra suelta.
      expect(
        treatsProcessIntent(auxiliar, {
          chunkContent:
            'Los auxiliares de la UGEL recepcionan la solicitud de reasignación y sellan el expediente.',
          documentTitle: 'Norma técnica de reasignación y permuta',
        }),
      ).toBe(false);
      // Y una mención administrativa no descarta el fragmento del docente.
      expect(
        treatsProcessIntent(docente, {
          chunkContent:
            'El plazo para presentar la solicitud de reasignación es de quince días hábiles; la recepción del expediente la realiza el auxiliar de la oficina de personal.',
          documentTitle: 'Norma técnica de reasignación y permuta',
        }),
      ).toBe(true);
    });
  });

  describe('treatsInheritedProcess', () => {
    const destaque = intent('como destacarme en otro colegio');

    it('admite el fragmento del proceso y el que devolvió su búsqueda', () => {
      expect(
        treatsInheritedProcess(
          destaque,
          {
            chunkContent:
              'El destaque se solicita para desempeñar funciones en otra IE.',
            documentTitle: 'RSG N.° 326-2017-MINEDU',
          },
          false,
        ),
      ).toBe(true);
      expect(
        treatsInheritedProcess(
          destaque,
          {
            chunkContent:
              'El plazo para presentar la solicitud es de quince días hábiles.',
            documentTitle: 'RSG N.° 326-2017-MINEDU',
          },
          true,
        ),
      ).toBe(true);
    });

    it('la procedencia no basta si el fragmento trata otro proceso', () => {
      // Un vecino léxico de la consulta del destaque no responde el destaque.
      expect(
        treatsInheritedProcess(
          destaque,
          {
            chunkContent:
              'El plazo para presentar la solicitud de reasignación docente es de quince días hábiles.',
            documentTitle: 'Norma técnica de reasignación y permuta',
          },
          true,
        ),
      ).toBe(false);
      expect(
        treatsInheritedProcess(
          destaque,
          {
            chunkContent:
              'La licencia por incapacidad temporal se solicita con el certificado médico o CITT.',
            documentTitle: 'Norma técnica de licencias',
          },
          true,
        ),
      ).toBe(false);
    });

    it('tampoco admite por procedencia el fragmento del otro régimen', () => {
      const auxiliar = intent('soy auxiliar y quiero reasignarme');
      expect(
        treatsInheritedProcess(
          auxiliar,
          {
            chunkContent:
              'La reasignación del profesor nombrado se solicita ante la UGEL.',
            documentTitle: 'Norma técnica de reasignación y permuta',
          },
          true,
        ),
      ).toBe(false);
      const docente = intent(
        'soy docente nombrado y quiero reasignarme a otra ugel',
      );
      expect(
        treatsInheritedProcess(
          docente,
          {
            chunkContent:
              'La reasignación de los auxiliares de educación se solicita ante la UGEL.',
            documentTitle: 'Norma técnica de reasignación y permuta',
          },
          true,
        ),
      ).toBe(false);
    });

    it('no admite un fragmento ajeno que no procede de la búsqueda del proceso', () => {
      expect(
        treatsInheritedProcess(
          destaque,
          {
            chunkContent:
              'El plazo para presentar la solicitud es de quince días hábiles.',
            documentTitle: 'RSG N.° 326-2017-MINEDU',
          },
          false,
        ),
      ).toBe(false);
    });

    it('no admite por procedencia el fragmento de un trámite hermano', () => {
      // Los trámites que el corpus distingue del proceso no forman parte de las
      // ocho intenciones: se reconocen por su propio nombre.
      expect(
        treatsInheritedProcess(
          destaque,
          {
            chunkContent:
              'La permuta entre profesores se solicita dentro del plazo de la norma técnica.',
            documentTitle: 'RSG N.° 326-2017-MINEDU',
          },
          true,
        ),
      ).toBe(false);
      expect(
        treatsInheritedProcess(
          destaque,
          {
            chunkContent:
              'La contratación de docentes se realiza mediante concurso público de méritos.',
            documentTitle: 'Norma de contratación docente',
          },
          true,
        ),
      ).toBe(false);
      expect(
        treatsInheritedProcess(
          destaque,
          {
            chunkContent:
              'La licencia por paternidad se otorga por diez días calendario.',
            documentTitle: 'Norma técnica de licencias',
          },
          true,
        ),
      ).toBe(false);
      expect(
        treatsInheritedProcess(
          destaque,
          {
            chunkContent:
              'El encargo de funciones directivas se solicita ante la UGEL.',
            documentTitle: 'RSG N.° 326-2017-MINEDU',
          },
          true,
        ),
      ).toBe(false);
    });

    it('admite el plazo propio aunque mencione otro trámite al final', () => {
      // La mención incidental forma parte del desarrollo del destaque.
      expect(
        treatsInheritedProcess(
          destaque,
          {
            chunkContent:
              'El plazo para presentar la solicitud es de quince días hábiles; la plaza vacante se genera por cese, jubilación o racionalización.',
            documentTitle: 'RSG N.° 326-2017-MINEDU',
          },
          true,
        ),
      ).toBe(true);
    });

    it('no admite un fragmento porque su título nombre el proceso', () => {
      // El título de la norma identifica el ámbito, no el trámite del
      // fragmento: el cuerpo es el que dice qué se está regulando.
      expect(
        treatsInheritedProcess(
          destaque,
          {
            chunkContent:
              'La permuta entre profesores se solicita dentro del plazo de la norma técnica.',
            documentTitle: 'Norma técnica de destaque docente',
            sectionTitle: 'Del plazo',
          },
          true,
        ),
      ).toBe(false);
      // «Destacados» fuera del trámite tampoco acredita el proceso.
      expect(
        treatsInheritedProcess(
          destaque,
          {
            chunkContent:
              'Los postulantes destacados en el concurso de contratación docente aprueban la prueba nacional.',
            documentTitle: 'Norma de contratación docente 2026',
          },
          true,
        ),
      ).toBe(false);
    });

    it('no admite la sección dedicada a la permuta en un hilo de reasignación', () => {
      const reassignment = intent(
        'soy docente nombrado y quiero reasignarme a otra ugel',
      );
      // La norma regula los dos trámites, pero esta sección solo desarrolla la
      // permuta: sus requisitos no responden la reasignación.
      expect(
        treatsInheritedProcess(
          reassignment,
          {
            chunkContent:
              'Disposiciones específicas de la permuta. La permuta entre profesores se solicita ante la UGEL de destino.',
            documentTitle: 'Norma técnica de reasignación y permuta',
            sectionTitle: 'Disposiciones específicas de la permuta',
          },
          true,
        ),
      ).toBe(false);
      // La misma norma, en su propia sección, sí responde el seguimiento.
      expect(
        treatsInheritedProcess(
          reassignment,
          {
            chunkContent:
              'La reasignación del profesor nombrado se solicita ante la UGEL de destino.',
            documentTitle: 'Norma técnica de reasignación y permuta',
            sectionTitle: 'De la reasignación',
          },
          true,
        ),
      ).toBe(true);
    });

    it('admite la licencia nombrada por su causal', () => {
      // El corpus titula las secciones con la causal («De la licencia por
      // salud»): es el propio proceso, no un trámite hermano.
      expect(
        treatsInheritedProcess(
          intent('necesito descanso medico'),
          {
            chunkContent:
              'La licencia por salud se otorga por el plazo que indique el certificado médico o CITT.',
            documentTitle: 'Norma técnica de licencias, permisos y vacaciones',
            sectionTitle: 'De la licencia por salud',
          },
          true,
        ),
      ).toBe(true);
    });

    it('no confunde una licencia con otro trámite en un hilo de licencia', () => {
      const licencia = intent('necesito descanso medico');
      // El plazo de la licencia no repite el proceso, pero proviene de su
      // búsqueda: la licencia y el permiso son el propio trámite, no otro.
      expect(
        treatsInheritedProcess(
          licencia,
          {
            chunkContent:
              'El plazo para presentar la solicitud de licencia es de cinco días hábiles.',
            documentTitle: 'Norma técnica de licencias, permisos y vacaciones',
            sectionTitle: 'Del plazo',
          },
          true,
        ),
      ).toBe(true);
      // La permuta sigue siendo otro trámite aunque comparta la norma.
      expect(
        treatsInheritedProcess(
          licencia,
          {
            chunkContent:
              'La permuta entre profesores se solicita ante la UGEL de destino.',
            documentTitle: 'Norma técnica de licencias, permisos y vacaciones',
          },
          true,
        ),
      ).toBe(false);
    });

    it('no admite el plazo de otra licencia en un hilo de destaque', () => {
      expect(
        treatsInheritedProcess(
          destaque,
          {
            chunkContent:
              'El plazo para solicitar licencia es de cinco días hábiles y se presenta ante la UGEL.',
            documentTitle: 'Norma técnica de licencias, permisos y vacaciones',
          },
          true,
        ),
      ).toBe(false);
    });

    it('admite el plazo y los requisitos de la norma conjunta', () => {
      const reassignment = intent(
        'soy docente nombrado y quiero reasignarme a otra ugel',
      );
      // El título «reasignación y permuta» nombra los dos trámites: el hermano
      // que enuncia el mismo título no convierte el plazo en otra cosa.
      expect(
        treatsInheritedProcess(
          reassignment,
          {
            chunkContent:
              'El plazo para presentar la solicitud es de quince días hábiles.',
            documentTitle: 'Norma técnica de reasignación y permuta',
            sectionTitle: 'Del plazo',
          },
          true,
        ),
      ).toBe(true);
      expect(
        treatsInheritedProcess(
          reassignment,
          {
            chunkContent:
              'Se requiere tener nombramiento vigente y tres años de servicio oficial.',
            documentTitle: 'Norma técnica de reasignación y permuta',
            sectionTitle: 'Requisitos',
          },
          true,
        ),
      ).toBe(true);
    });

    it('no admite otra licencia ni otro permiso en un hilo de licencia', () => {
      const licencia = intent('necesito descanso medico');
      // La excepción es la causal propia, no la familia entera: una licencia por
      // paternidad o un permiso por matrimonio son otro trámite.
      expect(
        treatsInheritedProcess(
          licencia,
          {
            chunkContent:
              'La licencia por paternidad se otorga por diez días calendario con goce de remuneraciones.',
            documentTitle: 'Norma técnica de licencias, permisos y vacaciones',
          },
          true,
        ),
      ).toBe(false);
      expect(
        treatsInheritedProcess(
          licencia,
          {
            chunkContent:
              'El permiso por matrimonio se otorga por cinco días hábiles.',
            documentTitle: 'Norma técnica de licencias, permisos y vacaciones',
          },
          true,
        ),
      ).toBe(false);
    });

    it('admite los requisitos del destaque que mencionan el vínculo o la licencia', () => {
      // «Nombramiento» y «licencia» son condiciones del requisito, no trámites
      // que compitan con el destaque.
      expect(
        treatsInheritedProcess(
          destaque,
          {
            chunkContent:
              'Para ser destacado se requiere tener nombramiento vigente y tres años de servicio oficial.',
            documentTitle: 'RSG N.° 326-2017-MINEDU',
            sectionTitle: 'Requisitos',
          },
          true,
        ),
      ).toBe(true);
      expect(
        treatsInheritedProcess(
          destaque,
          {
            chunkContent:
              'Los postulantes deben acreditar nombramiento vigente y no encontrarse en uso de licencia.',
            documentTitle: 'RSG N.° 326-2017-MINEDU',
          },
          true,
        ),
      ).toBe(true);
      // «Licencia por» y «cese temporal» también pueden ser una condición o una
      // sanción del propio requisito, no otro trámite.
      expect(
        treatsInheritedProcess(
          destaque,
          {
            chunkContent:
              'No encontrarse en uso de licencia por más de treinta (30) días.',
            documentTitle: 'RSG N.° 326-2017-MINEDU',
            sectionTitle: 'Requisitos',
          },
          true,
        ),
      ).toBe(true);
      expect(
        treatsInheritedProcess(
          destaque,
          {
            chunkContent:
              'No haber sido sancionado con cese temporal en los últimos tres años.',
            documentTitle: 'RSG N.° 326-2017-MINEDU',
            sectionTitle: 'Requisitos',
          },
          true,
        ),
      ).toBe(true);
      // La licencia aparece en la subordinada del propio plazo, no como el
      // trámite del fragmento.
      expect(
        treatsInheritedProcess(
          destaque,
          {
            chunkContent:
              'El plazo se suspende si el docente tiene licencia por enfermedad.',
            documentTitle: 'RSG N.° 326-2017-MINEDU',
            sectionTitle: 'Del plazo',
          },
          true,
        ),
      ).toBe(true);
      // Si el fragmento abre con el otro trámite, la subordinada no lo salva.
      expect(
        treatsInheritedProcess(
          destaque,
          {
            chunkContent:
              'Si el docente solicita permuta, debe presentar el acuerdo entre las partes.',
            documentTitle: 'RSG N.° 326-2017-MINEDU',
          },
          true,
        ),
      ).toBe(false);
    });

    it('no admite la licencia de la causal de un familiar en un hilo de salud', () => {
      // «Enfermedad» no basta: la licencia por la enfermedad de un familiar es
      // otra causal, y su plazo no responde el descanso médico propio.
      expect(
        treatsInheritedProcess(
          intent('necesito descanso medico'),
          {
            chunkContent:
              'La licencia por enfermedad de familiar directo se otorga por tres días hábiles.',
            documentTitle: 'Norma técnica de licencias, permisos y vacaciones',
            sectionTitle: 'De la licencia por enfermedad de familiar',
          },
          true,
        ),
      ).toBe(false);
    });

    it('descarta la sección de permuta aunque el cuerpo nombre la reasignación', () => {
      const reassignment = intent(
        'soy docente nombrado y quiero reasignarme a otra ugel',
      );
      expect(
        treatsInheritedProcess(
          reassignment,
          {
            chunkContent:
              'Disposiciones específicas de la permuta. La permuta y la reasignación se solicitan ante la UGEL de destino.',
            documentTitle: 'Norma técnica de reasignación y permuta',
            sectionTitle: 'Disposiciones específicas de la permuta',
          },
          true,
        ),
      ).toBe(false);
      // Es la sección la que acusa: el mismo cuerpo sin ella no descarta el
      // fragmento, porque su primera oración desarrolla la reasignación.
      expect(
        treatsInheritedProcess(
          reassignment,
          {
            chunkContent:
              'La permuta y la reasignación se solicitan ante la UGEL de destino.',
            documentTitle: 'Norma técnica de reasignación y permuta',
          },
          true,
        ),
      ).toBe(true);
    });

    it('acusa la sección aunque el cuerpo presente el otro trámite como condición', () => {
      // La exención por condición es de la oración, no del encuadre: una sección
      // «De la licencia por paternidad» no deja de ser otro trámite porque el
      // cuerpo lo nombre como requisito («no encontrarse en uso de…»).
      expect(
        treatsInheritedProcess(
          intent('necesito descanso medico'),
          {
            chunkContent:
              'No encontrarse en uso de licencia por paternidad al momento de la solicitud.',
            documentTitle: 'Norma técnica de licencias, permisos y vacaciones',
            sectionTitle: 'De la licencia por paternidad',
          },
          true,
        ),
      ).toBe(false);
    });

    it('no exime el otro trámite cuando el cuerpo lo desarrolla', () => {
      // «Acogerse a» y «gozar de» describen el otro trámite, no una condición del
      // propio: solo el requisito o la sanción se exceptúan.
      expect(
        treatsInheritedProcess(
          destaque,
          {
            chunkContent:
              'El directivo puede gozar de un encargo de funciones directivas por un año.',
            documentTitle: 'RSG N.° 326-2017-MINEDU',
          },
          true,
        ),
      ).toBe(false);
      expect(
        treatsInheritedProcess(
          intent('soy docente nombrado y quiero reasignarme a otra ugel'),
          {
            chunkContent:
              'Los docentes pueden acogerse a la permuta cuando exista acuerdo entre las partes.',
            documentTitle: 'Norma técnica de reasignación y permuta',
          },
          true,
        ),
      ).toBe(false);
      expect(
        treatsInheritedProcess(
          destaque,
          {
            chunkContent:
              'La licencia por capacitación oficial se otorga con goce de remuneraciones.',
            documentTitle: 'RSG N.° 326-2017-MINEDU',
            sectionTitle: 'Requisitos',
          },
          true,
        ),
      ).toBe(false);
    });

    it('no acusa la mención del otro trámite en la subordinada del propio plazo', () => {
      // «Mientras» y «cuando» describen una condición del trámite consultado: el
      // plazo sigue siendo el del proceso abierto.
      expect(
        treatsInheritedProcess(
          destaque,
          {
            chunkContent:
              'El plazo para presentar la solicitud se suspende mientras se resuelve la permuta.',
            documentTitle: 'RSG N.° 326-2017-MINEDU',
            sectionTitle: 'Del plazo',
          },
          true,
        ),
      ).toBe(true);
      expect(
        treatsInheritedProcess(
          destaque,
          {
            chunkContent:
              'Se presenta la solicitud cuando se acredite el cese en el cargo anterior.',
            documentTitle: 'RSG N.° 326-2017-MINEDU',
            sectionTitle: 'Requisitos',
          },
          true,
        ),
      ).toBe(true);
    });

    it('acusa el enmarque del trámite en la subordinada', () => {
      // «Cuando se trata de» no describe una condición: dice de qué trámite
      // habla el fragmento. La marca también aparece con «si» y con la solicitud
      // como sujeto, y las tres formas se reconocen.
      for (const chunkContent of [
        'El plazo es de quince días cuando se trata de una permuta.',
        'El plazo es de quince días en el caso de la permuta.',
        'El plazo es de quince días si se trata de una permuta.',
        'El plazo es de quince días cuando la solicitud es por permuta.',
        'El plazo es de quince días en el marco de la permuta.',
      ])
        expect(
          treatsInheritedProcess(
            destaque,
            {
              chunkContent,
              documentTitle: 'RSG N.° 326-2017-MINEDU',
              sectionTitle: 'Del plazo',
            },
            true,
          ),
        ).toBe(false);
    });

    it('evalúa el trámite enmarcado con el patrón del proceso consultado', () => {
      // El enmarque de la causal propia no es otro trámite: en un hilo de
      // licencia, «en el caso de la licencia por enfermedad» nombra la licencia
      // que se consulta. Se evalúa por la ampliación de la versión, que no tiene
      // la salida por nombre propio del hilo heredado.
      const licencias = 'Norma técnica de licencias, permisos y vacaciones';
      for (const chunkContent of [
        'En el caso de la licencia por enfermedad, se otorga por el plazo del certificado médico.',
        'Cuando se trata de la licencia por incapacidad temporal, se requiere CITT.',
        'Si se trata de la licencia por salud, el plazo lo fija el certificado.',
      ])
        expect(
          belongsToAdmittedVersion(intent('necesito descanso medico'), {
            chunkContent,
            documentTitle: licencias,
            sectionTitle: 'Del plazo',
          }),
        ).toBe(true);
      // La causal ajena enmarcada sí es otro trámite.
      expect(
        belongsToAdmittedVersion(intent('necesito descanso medico'), {
          chunkContent:
            'En el caso de la licencia por paternidad, se otorgan diez días.',
          documentTitle: licencias,
          sectionTitle: 'Del plazo',
        }),
      ).toBe(false);
      // La enfermedad del familiar tampoco necesita «licencia por» delante: tras
      // la marca, «enfermedad de mi hijo» ya es la causal ajena.
      for (const chunkContent of [
        'Cuando la solicitud es por enfermedad de mi hijo, se otorgan tres días.',
        'Si se trata de enfermedad de un familiar directo, se otorgan cinco días.',
      ])
        expect(
          belongsToAdmittedVersion(intent('necesito descanso medico'), {
            chunkContent,
            documentTitle: licencias,
            sectionTitle: 'Del plazo',
          }),
        ).toBe(false);
    });

    it('admite el fragmento propio cuando el hermano se menciona de paso', () => {
      // La norma conjunta se titula por los dos trámites y el requisito del
      // propio puede nombrar el cese o la renuncia: nada de eso lo convierte en
      // otro trámite. La salida por nombre propio es la misma del hilo heredado.
      const conjunta = 'Norma técnica de reasignación, permuta y destaque';
      for (const source of [
        {
          chunkContent:
            'Para el destaque se requiere nombramiento vigente y tres años de servicio oficial.',
          documentTitle: conjunta,
          sectionTitle: 'Requisitos del destaque',
        },
        {
          chunkContent:
            'Los requisitos y el plazo se detallan en el anexo de la presente norma.',
          documentTitle: conjunta,
          sectionTitle: 'Requisitos del destaque y la permuta',
        },
        {
          chunkContent:
            'La plaza del destaque se genera por cese, jubilación o renuncia del titular.',
          documentTitle: conjunta,
          sectionTitle: 'De las plazas',
        },
      ])
        expect(
          belongsToAdmittedProcedure(
            intent('quiero destacarme en otro colegio'),
            source,
          ),
        ).toBe(true);
    });

    it('lee el anexo de la norma conjunta como fragmento del proceso', () => {
      // El título de la norma conjunta nombra la reasignación y la permuta, y el
      // anexo de plazas no repite el trámite: si el título contara como
      // encuadre, el cuadro de plazas del destaque se leería como reasignación y
      // la ampliación por versión lo perdería.
      for (const chunkContent of [
        'Anexo 2: el cuadro de plazas por región consigna 120 plazas para Lima Metropolitana.',
        'Anexo N.° 2: el cuadro de plazas por región consigna 120 plazas para Lima Metropolitana.',
        'Anexo Nº 2: el cuadro de plazas por región consigna 120 plazas para Lima Metropolitana.',
        'Anexo 2-A: el cuadro de plazas por región consigna 120 plazas para Lima Metropolitana.',
        'Cuadro N° 2: las plazas del destaque por región.',
        'Tabla 2: las plazas del destaque por región.',
        // Los rótulos se acumulan y el cuerpo empieza después del último.
        'Anexo 2: Cuadro N° 2: las plazas del destaque por región.',
        // El rótulo con dos puntos admite una palabra en lugar del número.
        'Tabla comparativa: las plazas del destaque por región.',
        // El rótulo conjunto —que nombra los dos trámites— es el encuadre de
        // ambos, igual que la sección conjunta: no desarrolla ninguno.
        'Anexo de la permuta y el destaque: 120 plazas para Lima Metropolitana.',
        'Cuadro comparativo destaque y permuta: 120 plazas para Lima Metropolitana.',
        'Anexo de la reasignación y el destaque: 120 plazas para Lima Metropolitana.',
      ])
        expect(
          belongsToAdmittedVersion(
            intent('quiero destacarme en otro colegio'),
            {
              chunkContent,
              documentTitle:
                'Norma técnica de reasignación, permuta y destaque',
              sectionTitle: 'Anexo 2',
            },
          ),
        ).toBe(true);
      // Contramuestra: el anexo que sí desarrolla el hermano sigue fuera, con
      // cualquiera de los rótulos, incluso con dos rótulos encadenados: el
      // contenido empieza después del último.
      for (const chunkContent of [
        'Anexo 3: la permuta se solicita ante la UGEL de destino con acuerdo de las partes.',
        'Anexo N.° 3: la permuta se solicita ante la UGEL de destino.',
        'Cuadro N° 3: la permuta se solicita ante la UGEL de destino con acuerdo de las partes.',
        'Anexo 3: Cuadro N° 3: la permuta se solicita ante la UGEL de destino.',
        'Tabla comparativa: la permuta se solicita ante la UGEL de destino.',
        // El rótulo con dos puntos puede nombrar el trámite que el anexo
        // desarrolla: recortarlo antes de la comprobación escondía al hermano y
        // el anexo se entregaba por las plazas que enunciaba su contenido.
        'Cuadro de la permuta: plazas por región y UGEL de destino.',
        'Tabla de plazas de la permuta: 120 plazas por región.',
        'Anexo de la reasignación: requisitos para postular.',
        'Anexo licencia por paternidad: se otorga por diez días calendario.',
        // Un separador suelto al inicio no vacía la primera oración: el trámite
        // sigue a la vista.
        '; la permuta se solicita ante la UGEL de destino con acuerdo de las partes.',
        // El separador puede encabezar un rótulo: ahí la oración recortada es la
        // única que ve el contenido, porque la cruda se corta en los dos puntos.
        '; Anexo 2: la permuta se solicita ante la UGEL de destino.',
        '. Anexo 3: la permuta se solicita ante la UGEL de destino.',
        // El rótulo no se come la primera letra del contenido: «contratación»
        // empieza por una letra romana y el numeral tiene que ser un token
        // completo, con o sin número de anexo delante.
        'Anexo contratación de docentes se rige por su propio procedimiento.',
        'Anexo 2: contratación de docentes se rige por su propio procedimiento.',
      ])
        expect(
          belongsToAdmittedVersion(
            intent('quiero destacarme en otro colegio'),
            {
              chunkContent,
              documentTitle:
                'Norma técnica de reasignación, permuta y destaque',
              sectionTitle: 'Anexo 3',
            },
          ),
        ).toBe(false);
      // El rótulo del anexo es el encuadre del fragmento igual que la sección:
      // aunque el cuerpo nombre el proceso consultado, el anexo dedicado a la
      // permuta no responde una pregunta de destaque. Sin la oración cruda, el
      // recorte del rótulo dejaba la salida por nombre propio y la entregaba.
      for (const chunkContent of [
        'Anexo de la permuta: el plazo del destaque es de quince días hábiles.',
        'Cuadro de la permuta: el plazo del destaque es de quince días hábiles.',
      ])
        expect(
          belongsToAdmittedProcedure(
            intent('quiero destacarme en otro colegio'),
            {
              chunkContent,
              documentTitle:
                'Norma técnica de reasignación, permuta y destaque',
              sectionTitle: 'Del plazo',
            },
          ),
        ).toBe(false);
    });

    it('no admite el fragmento de otro proceso del corpus en una pregunta de destaque', () => {
      // El título de la norma conjunta nombra el destaque, así que no sirve como
      // encuadre: sin la comprobación de otro proceso, la sección de la
      // reasignación quedaba como única cita de una pregunta de destaque.
      expect(
        belongsToAdmittedProcedure(
          intent('quiero destacarme en otro colegio'),
          {
            chunkContent:
              'La reasignación se solicita ante la UGEL de origen y se resuelve en la de destino.',
            documentTitle: 'Norma técnica de reasignación, permuta y destaque',
            sectionTitle: 'De la reasignación',
          },
        ),
      ).toBe(false);
      // Contramuestra: el plazo del destaque que no repite el trámite sigue
      // admitiéndose en la pregunta explícita.
      expect(
        belongsToAdmittedProcedure(
          intent('quiero destacarme en otro colegio'),
          {
            chunkContent:
              'El plazo para presentar la solicitud es de quince días hábiles.',
            documentTitle: 'Norma técnica de reasignación, permuta y destaque',
            sectionTitle: 'Del plazo',
          },
        ),
      ).toBe(true);
      // El régimen sigue rigiendo la compuerta explícita: un auxiliar no recibe
      // el procedimiento que solo desarrolla la norma de profesores.
      const auxiliar: TopicIntent = {
        ...intent('necesito descanso medico'),
        moduleName: 'Auxiliar de educación',
      };
      expect(
        belongsToAdmittedProcedure(auxiliar, {
          chunkContent:
            'La licencia por enfermedad del docente se otorga por el plazo que indique el certificado médico.',
          documentTitle: 'Norma técnica de licencias de profesores',
          sectionTitle: 'De la licencia por enfermedad',
        }),
      ).toBe(false);
    });

    it('acusa la sección dedicada al hermano aunque el cuerpo nombre el propio', () => {
      // La sección es el encuadre: la permuta se solicita ante la UGEL de
      // destino, y que la oración nombre también la reasignación no convierte el
      // fragmento en el trámite consultado. La salida por nombre propio mira el
      // cuerpo, no la sección que encabeza el fragmento.
      const conjunta = 'Norma técnica de reasignación, permuta y destaque';
      const casos = [
        {
          intent: intent('quiero reasignarme a otra ugel'),
          source: {
            chunkContent:
              'La permuta y la reasignación se solicitan ante la UGEL de destino.',
            documentTitle: conjunta,
            sectionTitle: 'Disposiciones específicas de la permuta',
          },
        },
        {
          intent: intent('necesito descanso medico'),
          source: {
            chunkContent:
              'La licencia por paternidad y el descanso médico se acreditan con el certificado correspondiente.',
            documentTitle: 'Norma técnica de licencias, permisos y vacaciones',
            sectionTitle: 'De la licencia por paternidad',
          },
        },
        {
          // El encabezado conjunto nombra los dos, y el cuerpo desarrolla solo
          // al hermano: tampoco es el trámite consultado.
          intent: intent('quiero reasignarme a otra ugel'),
          source: {
            chunkContent:
              'Los docentes pueden acogerse a la permuta cuando exista acuerdo entre las partes.',
            documentTitle: conjunta,
            sectionTitle: 'Requisitos de la reasignación y la permuta',
          },
        },
      ];
      for (const { intent: topicIntent, source } of casos) {
        expect(belongsToAdmittedProcedure(topicIntent, source)).toBe(false);
        expect(treatsInheritedProcess(topicIntent, source, true)).toBe(false);
      }
      // El encabezado que nombra los dos trámites no acusa: el cuerpo decide.
      expect(
        belongsToAdmittedProcedure(intent('quiero reasignarme a otra ugel'), {
          chunkContent:
            'La reasignación se solicita ante la UGEL de origen y se resuelve en la de destino.',
          documentTitle: conjunta,
          sectionTitle: 'Requisitos de la reasignación y la permuta',
        }),
      ).toBe(true);
      // Un fragmento que solo se identifica por su sección sigue siendo del
      // proceso: el cuerpo desarrolla el plazo sin repetir el trámite.
      expect(
        treatsProcessIntent(intent('necesito descanso medico'), {
          chunkContent: 'El plazo lo fija el certificado médico.',
          documentTitle: 'Norma técnica de licencias, permisos y vacaciones',
          sectionTitle: 'De la licencia por enfermedad',
        }),
      ).toBe(true);
    });

    it('no exime la causal de licencia ajena aunque se enuncie como requisito', () => {
      // El requisito exime el trámite hermano, no la causal ajena: la licencia
      // por paternidad sigue siendo otra licencia.
      expect(
        treatsInheritedProcess(
          intent('necesito descanso medico'),
          {
            chunkContent:
              'No encontrarse en uso de licencia por paternidad al momento de la solicitud.',
            documentTitle: 'Norma técnica de licencias, permisos y vacaciones',
            sectionTitle: 'Requisitos',
          },
          true,
        ),
      ).toBe(false);
      expect(
        treatsInheritedProcess(
          intent('necesito descanso medico'),
          {
            chunkContent:
              'No encontrarse en uso de licencia por paternidad al momento de la solicitud.',
            documentTitle: 'Norma técnica de licencias, permisos y vacaciones',
          },
          true,
        ),
      ).toBe(false);
      // La causal del familiar con posesivo es la misma causal ajena, también
      // cuando el fragmento la enuncia como requisito: el posesivo no la
      // convierte en la enfermedad de la persona.
      for (const chunkContent of [
        'No encontrarse en uso de licencia por enfermedad de mi hijo al momento de la solicitud.',
        'No encontrarse en uso de licencia por enfermedad de su hijo.',
        'No encontrarse en uso de licencia por enfermedad de mis padres.',
      ]) {
        expect(
          treatsInheritedProcess(
            intent('necesito descanso medico'),
            {
              chunkContent,
              documentTitle:
                'Norma técnica de licencias, permisos y vacaciones',
              sectionTitle: 'Requisitos',
            },
            true,
          ),
        ).toBe(false);
        expect(
          belongsToAdmittedProcedure(intent('necesito descanso medico'), {
            chunkContent,
            documentTitle: 'Norma técnica de licencias, permisos y vacaciones',
            sectionTitle: 'Requisitos',
          }),
        ).toBe(false);
      }
      // El requisito del propio trámite con la licencia por duración sigue
      // admitiéndose.
      expect(
        treatsInheritedProcess(
          destaque,
          {
            chunkContent:
              'No encontrarse en uso de licencia por el plazo que fije la UGEL.',
            documentTitle: 'RSG N.° 326-2017-MINEDU',
            sectionTitle: 'Requisitos',
          },
          true,
        ),
      ).toBe(true);
      expect(
        treatsInheritedProcess(
          destaque,
          {
            chunkContent: 'No encontrarse en uso de licencia por 30 días.',
            documentTitle: 'RSG N.° 326-2017-MINEDU',
            sectionTitle: 'Requisitos',
          },
          true,
        ),
      ).toBe(true);
    });

    it('acusa la licencia de otro motivo en un hilo de destaque', () => {
      // La licencia enunciada como trámite es otro proceso, con cualquier causal
      // y con cualquier duración; solo el requisito «en uso de» la exime.
      expect(
        treatsInheritedProcess(
          destaque,
          {
            chunkContent:
              'La licencia por 30 días requiere autorización de la UGEL.',
            documentTitle: 'RSG N.° 326-2017-MINEDU',
            sectionTitle: 'Requisitos',
          },
          true,
        ),
      ).toBe(false);
      expect(
        treatsInheritedProcess(
          destaque,
          {
            chunkContent:
              'La licencia por el plazo que fije la UGEL requiere autorización.',
            documentTitle: 'RSG N.° 326-2017-MINEDU',
            sectionTitle: 'Requisitos',
          },
          true,
        ),
      ).toBe(false);
    });

    it('descarta la enfermedad del hijo como causal propia', () => {
      // El posesivo también introduce la causal del familiar: «mi hijo» no es la
      // incapacidad temporal de la persona.
      for (const chunkContent of [
        'La licencia por enfermedad de mi hijo se otorga por tres días hábiles.',
        'La licencia por enfermedad de su hijo se otorga por tres días hábiles.',
      ])
        expect(
          treatsInheritedProcess(
            intent('necesito descanso medico'),
            {
              chunkContent,
              documentTitle:
                'Norma técnica de licencias, permisos y vacaciones',
              sectionTitle: 'De la licencia',
            },
            true,
          ),
        ).toBe(false);
    });

    it('reconoce la causal del familiar en plural y con artículo', () => {
      // El artículo plural —«de los padres», «de las madres»— y el parentesco en
      // plural enuncian la misma causal ajena que el posesivo singular. Sin
      // reconocerlos, «enfermedad de los padres» se leía como la enfermedad de la
      // persona y su plazo desplazaba a la causal clínica.
      const licencias = 'Norma técnica de licencias, permisos y vacaciones';
      for (const chunkContent of [
        'La licencia por enfermedad de los padres se otorga por cinco días hábiles.',
        'La licencia por enfermedad de las madres se otorga por cinco días hábiles.',
        'La licencia por enfermedad de familiares directos se otorga por cinco días hábiles.',
        // El singular femenino con artículo es la misma causal ajena: «la madre»,
        // «la esposa» y «la cónyuge» no son la enfermedad de la persona.
        'La enfermedad de la madre se acredita con el certificado médico.',
        'La enfermedad de la esposa se acredita con el certificado médico.',
        'La enfermedad de la cónyuge se acredita con el certificado médico.',
        // La forma con «u» —«cónyugue»— es la misma causal ajena.
        'La enfermedad de la cónyugue se acredita con el certificado médico.',
        // Como afirmación, enmarque y requisito del propio trámite. La causal
        // desnuda —sin «licencia por» delante— es la que prueba la enumeración:
        // con ella, el plural del parentesco no se lee como la enfermedad de la
        // persona.
        'Cuando la solicitud es por enfermedad de los padres, se otorgan tres días.',
        'Cuando la solicitud es por enfermedad de familiares directos, se otorgan tres días.',
        'En el caso de la enfermedad de las madres, se otorgan tres días.',
        'No encontrarse en uso de licencia por enfermedad de los padres.',
      ]) {
        expect(
          treatsInheritedProcess(
            intent('necesito descanso medico'),
            {
              chunkContent,
              documentTitle: licencias,
              sectionTitle: 'Del plazo',
            },
            true,
          ),
        ).toBe(false);
        expect(
          belongsToAdmittedProcedure(intent('necesito descanso medico'), {
            chunkContent,
            documentTitle: licencias,
            sectionTitle: 'Del plazo',
          }),
        ).toBe(false);
      }
      // Contramuestra: la enfermedad de la propia persona sigue siendo la causal
      // del proceso, con artículo definido.
      expect(
        treatsInheritedProcess(
          intent('necesito descanso medico'),
          {
            chunkContent:
              'En el caso de la enfermedad del docente, se otorgan siete días.',
            documentTitle: licencias,
            sectionTitle: 'Del plazo',
          },
          true,
        ),
      ).toBe(true);
    });

    it('admite la alternativa que incluye el proceso consultado', () => {
      // «optar por la permuta o el destaque» ofrece los dos trámites, y «o la
      // reasignación» también: el hermano va detrás de un verbo que lo rige,
      // pero la coordinación con el propio proceso mantiene el fragmento.
      expect(
        treatsInheritedProcess(
          destaque,
          {
            chunkContent:
              'El docente puede optar por la permuta o el destaque según las plazas disponibles.',
            documentTitle: 'Norma técnica de reasignación, permuta y destaque',
            sectionTitle: 'Disposiciones generales',
          },
          true,
        ),
      ).toBe(true);
      expect(
        treatsInheritedProcess(
          intent('quiero reasignarme a otra ugel'),
          {
            chunkContent:
              'El docente puede optar por la permuta o la reasignación según las plazas disponibles.',
            documentTitle: 'Norma técnica de reasignación y permuta',
            sectionTitle: 'Disposiciones generales',
          },
          true,
        ),
      ).toBe(true);
      // Contramuestra: sin el propio proceso en la alternativa, el fragmento
      // ofrece solo el hermano.
      expect(
        treatsInheritedProcess(
          destaque,
          {
            chunkContent:
              'El docente puede optar por la permuta o el encargo según las plazas disponibles.',
            documentTitle: 'Norma técnica de reasignación, permuta y destaque',
            sectionTitle: 'Disposiciones generales',
          },
          true,
        ),
      ).toBe(false);
    });

    it('acusa el hermano aunque la primera mención sea de paso', () => {
      // El cuerpo se recorre entero: la primera mención acompaña al propio
      // proceso y la segunda enuncia el régimen del hermano. Detenerse en la
      // primera dejaba pasar el fragmento.
      const licencias = 'Norma técnica de licencias, permisos y vacaciones';
      const chunkContent =
        'El descanso médico y la licencia por paternidad se acreditan con el certificado y la licencia por maternidad se otorga por noventa días.';
      expect(
        belongsToAdmittedVersion(intent('necesito descanso medico'), {
          chunkContent,
          documentTitle: licencias,
          sectionTitle: 'Del plazo',
        }),
      ).toBe(false);
      expect(
        treatsInheritedProcess(
          intent('necesito descanso medico'),
          { chunkContent, documentTitle: licencias, sectionTitle: 'Del plazo' },
          true,
        ),
      ).toBe(false);
      // Contramuestra: con las dos menciones acompañando al propio, el fragmento
      // sigue siendo suyo.
      expect(
        belongsToAdmittedProcedure(intent('necesito descanso medico'), {
          chunkContent:
            'El descanso médico y la licencia por paternidad se acreditan con el mismo certificado.',
          documentTitle: licencias,
          sectionTitle: 'Del plazo',
        }),
      ).toBe(true);
    });

    it('acusa el régimen del hermano aunque el propio se nombre antes', () => {
      // El descanso médico es el sujeto de la oración, pero la cláusula de
      // relativo enuncia el régimen de la paternidad: el fragmento desarrolla
      // otra licencia y su plazo no responde la causal clínica.
      const licencias = 'Norma técnica de licencias, permisos y vacaciones';
      for (const chunkContent of [
        'El descanso médico no es acumulable con la licencia por paternidad, que se otorga por diez días.',
        'El descanso médico y la licencia por maternidad, que se otorga por noventa días, no son acumulables.',
        // El hermano abre la oración y el propio aparece después: el artículo
        // delante no lo convierte en complemento.
        'La licencia por maternidad se otorga por noventa días; el descanso médico se acredita con el CITT.',
        // El hermano es el sujeto de la segunda cláusula coordinada: también
        // enuncia su régimen, aunque el propio abra la oración.
        'El descanso médico se acredita con el CITT y la licencia por paternidad se otorga por diez días calendario.',
        // La cláusula del hermano no coordina con el nombre del propio: el
        // proceso consultado no cierra la enumeración.
        'El plazo es de quince días hábiles, la licencia por paternidad se otorga por diez días calendario.',
        // Tampoco cuando el propio aparece después: la cláusula sigue siendo del
        // hermano y no del proceso consultado.
        'El plazo es de quince días hábiles, la licencia por paternidad se otorga por diez días y el descanso médico se acredita con el CITT.',
        // El tramo puede no nombrar el proceso consultado: el hermano sigue
        // siendo el sujeto de su cláusula, aunque el propio se nombre después.
        'Según el reglamento interno, la licencia por paternidad se otorga por diez días calendario y el descanso médico se acredita con el CITT.',
        // El verbo del propio puede quedar fuera de cualquier inventario: lo que
        // decide el sujeto es la concordancia de la cláusula del hermano. En
        // singular, la cláusula enuncia su régimen y el fragmento no sirve.
        'La licencia por enfermedad del docente cubre siete días y la licencia por paternidad se otorga por diez días calendario.',
        'El descanso médico dura siete días hábiles y la licencia por paternidad se otorga por diez días calendario.',
        'El descanso médico incluye siete días y la licencia por paternidad se otorga por diez días calendario.',
        'El descanso médico varía según el certificado y la licencia por paternidad se otorga por diez días calendario.',
        // El hermano en plural concuerda con su propio verbo plural: la cláusula
        // no comparte sujeto con el proceso consultado.
        'El descanso médico se acredita con el CITT y las licencias por paternidad se otorgan por diez días calendario.',
      ]) {
        expect(
          belongsToAdmittedVersion(intent('necesito descanso medico'), {
            chunkContent,
            documentTitle: licencias,
            sectionTitle: 'Del plazo',
          }),
        ).toBe(false);
        expect(
          treatsInheritedProcess(
            intent('necesito descanso medico'),
            {
              chunkContent,
              documentTitle: licencias,
              sectionTitle: 'Del plazo',
            },
            true,
          ),
        ).toBe(false);
      }
      // Contramuestra: la mención del hermano de paso no acusa cuando el cuerpo
      // desarrolla el propio trámite. La tolera la compuerta del proceso
      // consultado, no la de la versión, que solo admite fragmentos sin
      // mención alguna del hermano.
      expect(
        belongsToAdmittedProcedure(intent('necesito descanso medico'), {
          chunkContent:
            'El descanso médico se otorga por el plazo del certificado y no suspende el cese del vínculo.',
          documentTitle: licencias,
          sectionTitle: 'Del plazo',
        }),
      ).toBe(true);
    });

    it('admite el sujeto conjunto con lead-in, complemento o participio', () => {
      // El sujeto conjunto no depende de lo que precede al nombre del propio ni
      // de la forma en que lo nombra: un lead-in, un complemento o el participio
      // del destaque dejan la cláusula tratando los dos trámites. El criterio
      // mira el tramo que va del inicio de la oración al conector: si el nombre
      // del propio llega hasta el conector y el tramo es una cadena nominal, los
      // nombres se coordinan y el verbo concuerda con el conjunto o con el núcleo
      // del sintagma.
      const licencias = 'Norma técnica de licencias, permisos y vacaciones';
      for (const chunkContent of [
        'Asimismo, el descanso médico y la licencia por paternidad se acreditan con el mismo certificado.',
        'El descanso médico del docente y la licencia por paternidad se acreditan con el mismo certificado.',
        // El relativo del propio no cambia el sujeto: la concordancia sigue
        // siendo plural.
        'El descanso médico, que se otorga por siete días, y la licencia por paternidad se acreditan con el mismo certificado.',
        // El pretérito plural y el hermano en plural quedan admitidos por la
        // misma rama: el nombre del propio llega hasta el conector, así que los
        // dos nombres se coordinan y la cláusula no es del hermano.
        'El descanso médico y la licencia por paternidad se otorgaron por diez días calendario.',
        'El descanso médico y las licencias por paternidad se otorgan por diez días calendario.',
        // El relativo del propio con pretérito plural concuerda igual con el
        // conjunto: la cláusula sigue siendo de los dos trámites.
        'El descanso médico, que se otorga por siete días, y la licencia por paternidad se otorgaron por diez días calendario.',
        // El tramo puede abrir con el propio trámite: no hay nada antes de su
        // nombre y los dos siguen compartiendo el sujeto de la cláusula.
        'Descanso médico y la licencia por paternidad se otorgan por diez días calendario.',
        'Descanso médico y la licencia por paternidad se acreditan con el mismo certificado.',
      ]) {
        expect(
          belongsToAdmittedProcedure(intent('necesito descanso medico'), {
            chunkContent,
            documentTitle: licencias,
            sectionTitle: 'Del plazo',
          }),
        ).toBe(true);
        expect(
          treatsInheritedProcess(
            intent('necesito descanso medico'),
            {
              chunkContent,
              documentTitle: licencias,
              sectionTitle: 'Del plazo',
            },
            true,
          ),
        ).toBe(true);
      }
      for (const chunkContent of [
        'El plazo del destaque y la permuta se fijan por la UGEL de destino.',
        'El docente destacado en otra UGEL y la permuta se rigen por el mismo plazo.',
        // El par coordinado es el complemento del núcleo —«el plazo para el
        // destaque y la permuta»— y el verbo singular concuerda con «el plazo»:
        // el fragmento enuncia el plazo compartido y no el del hermano.
        'El plazo para el destaque y la permuta es de quince días hábiles.',
        'El plazo para el destaque y la permuta se fija en quince días hábiles.',
        'El plazo fijado por la UGEL para el destaque y la permuta es de quince días hábiles.',
        'El plazo del destaque y la permuta es de quince días hábiles.',
        'El plazo del destaque y la permuta se fijaron por la UGEL de destino.',
        'El plazo del destaque y las permutas se fijan por la UGEL de destino.',
        // El marco discursivo, el anafórico y el cuantificador no son un
        // predicado: el sintagma que rige al hermano empieza después de ellos.
        'Cabe señalar que el plazo del destaque y la permuta es de quince días hábiles.',
        'Es preciso indicar que el plazo del destaque y la permuta es de quince días hábiles.',
        'Se precisa que el plazo del destaque y la permuta es de quince días hábiles.',
        'Se establece que el plazo del destaque y la permuta es de quince días hábiles.',
        'Dicho plazo del destaque y la permuta es de quince días hábiles.',
        'Todo plazo del destaque y la permuta se fija por la UGEL de destino.',
        'Conforme a la norma, el plazo del destaque y la permuta es de quince días hábiles.',
        // La locución de marco va también sin coma: no es el sujeto del trámite.
        'Conforme a la norma el plazo del destaque y la permuta es de quince días hábiles.',
        // La subordinada antepuesta, el absoluto participial y la locución de
        // marco tampoco son el sujeto: el tramo nominal empieza después de ellos.
        'Cuando la UGEL publica el cronograma, el plazo del destaque y la permuta es de quince días hábiles.',
        'Si el docente presenta la solicitud, el plazo del destaque y la permuta es de quince días hábiles.',
        'Para postular, el plazo del destaque y la permuta es de quince días hábiles.',
        'Como señala la norma, el plazo del destaque y la permuta es de quince días hábiles.',
        'Aprobado el cronograma, el plazo del destaque y la permuta es de diez días hábiles.',
        'Publicado el cronograma, el plazo del destaque y la permuta es de diez días hábiles.',
        'De aprobarse el cronograma, el plazo del destaque y la permuta es de diez días hábiles.',
        'En tanto se publique el cronograma, el plazo del destaque y la permuta es de diez días hábiles.',
        // El anuncio con sujeto propio también es marco: el sujeto del anuncio
        // no rige al trámite.
        'La norma establece que el plazo del destaque y la permuta es de quince días hábiles.',
        'El artículo 12 señala que el plazo del destaque y la permuta es de quince días hábiles.',
        // El conector compuesto coordina igual que la conjunción simple.
        'El plazo del destaque, así como la permuta, es de quince días hábiles.',
      ]) {
        expect(
          belongsToAdmittedProcedure(destaque, {
            chunkContent,
            documentTitle: 'Norma técnica de reasignación, permuta y destaque',
            sectionTitle: 'Del plazo',
          }),
        ).toBe(true);
      }
      // Contramuestra: el propio enunció su predicado antes del conector, así que
      // el hermano abre su propia cláusula aunque el proceso consultado se nombre
      // primero.
      for (const chunkContent of [
        'El descanso médico se acredita con el CITT y la licencia por paternidad se otorga por diez días calendario.',
        'El descanso médico se acredita con el CITT y las licencias por paternidad se otorgan por diez días calendario.',
        // El par coordinado que sigue al sujeto es una licencia ajena: el
        // fragmento desarrolla la otra licencia y el propio aparece al final.
        'En la UGEL, la licencia por paternidad y la licencia por maternidad se otorgan por diez días y el descanso médico se acredita con el CITT.',
      ])
        expect(
          treatsInheritedProcess(
            intent('necesito descanso medico'),
            {
              chunkContent,
              documentTitle: licencias,
              sectionTitle: 'Del plazo',
            },
            true,
          ),
        ).toBe(false);
      expect(
        belongsToAdmittedProcedure(destaque, {
          chunkContent:
            'El plazo para el destaque es de quince días hábiles y la permuta se solicita ante la UGEL de destino.',
          documentTitle: 'Norma técnica de reasignación, permuta y destaque',
          sectionTitle: 'Del plazo',
        }),
      ).toBe(false);
    });

    it('acusa cuando el predicado abre el tramo y el propio queda dentro', () => {
      // La coordinación de nombres admite el fragmento cuando los dos nombres son
      // el sujeto o el complemento de un núcleo compartido. Si el tramo abre con
      // el predicado —«se fija el plazo del destaque»—, o si entre el inicio de la
      // oración y el nombre del propio hay un sujeto y su verbo —«la UGEL fija el
      // plazo del destaque»—, el nombre del propio ya está dentro de ese predicado
      // y la cláusula que sigue es del hermano.
      for (const chunkContent of [
        'Se fija el plazo del destaque y la permuta se solicita con acuerdo de partes.',
        'Se establece el plazo del destaque y la permuta se solicita con acuerdo entre las partes.',
        'Fija la UGEL el plazo del destaque y la permuta se solicita con acuerdo de partes.',
        'La UGEL fija el plazo del destaque y la permuta se solicita con acuerdo de partes.',
        'El artículo 12 fija el plazo del destaque y la permuta se solicita con acuerdo de partes.',
        // El verbo no está en el inventario de marcas y aun así hay un sujeto y
        // su predicado antes del sintagma del trámite.
        'La UGEL determina el plazo del destaque y la permuta se solicita con acuerdo de partes.',
        // Sin sujeto expreso, el verbo de anuncio antes del sintagma sigue siendo
        // predicado: el tramo no abre con el sintagma nominal.
        'Se determina el plazo del destaque y la permuta se solicita con acuerdo de partes.',
        // El verbo del predicado no está en el inventario de marcas: el tramo
        // tampoco abre con el sintagma nominal.
        'Determina el plazo del destaque y la permuta se solicita con acuerdo de partes.',
        'Fija el plazo del destaque y la permuta se solicita con acuerdo de partes.',
        'Se fija, según la norma, el plazo del destaque y la permuta se solicita con acuerdo de partes.',
        'Se fija, luego, el plazo del destaque y la permuta se solicita con acuerdo de partes.',
        // El determinante enlazado después del predicado no lo vuelve nominal: la
        // cadena se corta con la marca de verbo conjugado del tramo.
        'El plazo se fija con la norma del destaque y la permuta se solicita con acuerdo de partes.',
        // El verbo de anuncio no protege al predicado que lo sigue: la subordinada
        // vuelve a medirse y el sujeto con su verbo siguen dentro del tramo.
        'Se establece que la UGEL fija el plazo del destaque y la permuta se solicita con acuerdo de partes.',
        // La subordinada antepuesta y el absoluto participial tampoco protegen al
        // predicado que los sigue, y la incidental entre el verbo y su objeto deja
        // el predicado delante del trámite.
        'Cuando la UGEL publica el cronograma, la UGEL fija el plazo del destaque y la permuta se solicita con acuerdo de partes.',
        'Aprobado el cronograma, la UGEL fija el plazo del destaque y la permuta se solicita con acuerdo de partes.',
        'La norma indica que la UGEL fija el plazo del destaque y la permuta se solicita con acuerdo de partes.',
        'Se fija, cuando la norma lo dispone, el plazo del destaque y la permuta se solicita con acuerdo de partes.',
        // El relativo con verbo conjugado queda del lado seguro: el tramo se mide
        // completo y el predicado deja el nombre del propio dentro de él. Es un
        // coste fail-closed conocido: el participio —«el plazo fijado por la
        // UGEL para el destaque y la permuta»— sí se admite, porque es un
        // modificador y no una cláusula.
        'El plazo que la UGEL fija para el destaque y la permuta es de quince días hábiles.',
        'El plazo que corresponde al destaque y la permuta es de diez días hábiles.',
        // El conector compuesto no exime al predicado que lo precede.
        'La UGEL fija el plazo del destaque, así como la permuta se solicita con acuerdo de partes.',
      ])
        expect(
          belongsToAdmittedProcedure(destaque, {
            chunkContent,
            documentTitle: 'Norma técnica de reasignación, permuta y destaque',
            sectionTitle: 'Del plazo',
          }),
        ).toBe(false);
      // El lead-in con coma no impide reconocer el arranque nominal.
      expect(
        belongsToAdmittedProcedure(destaque, {
          chunkContent:
            'Según la norma, el plazo para el destaque y la permuta es de quince días hábiles.',
          documentTitle: 'Norma técnica de reasignación, permuta y destaque',
          sectionTitle: 'Del plazo',
        }),
      ).toBe(true);
      // La palabra que abre el complemento del hermano —«la permuta joven del
      // concurso»— termina como un verbo plural pero no concuerda con el
      // conjunto: no desactiva la acusación.
      expect(
        belongsToAdmittedProcedure(destaque, {
          chunkContent:
            'El plazo del destaque es de quince días hábiles y la permuta joven del concurso se resuelve en la UGEL.',
          documentTitle: 'Norma técnica de reasignación, permuta y destaque',
          sectionTitle: 'Del plazo',
        }),
      ).toBe(false);
    });

    it('documenta el límite conocido del tramo nominal con verbo y enlace', () => {
      // Riesgo aceptado (R19-4): el verbo que no está en la lista de marcas y rige
      // al trámite a través de un enlace —«autoriza para el destaque»— deja el
      // predicado una posición antes de la preposición, así que la cadena lo lee
      // como un complemento nominal. Cerrarlo exige categoría gramatical, no un
      // inventario de verbos. Si se cierra, esta prueba debe pasar a `false`.
      for (const chunkContent of [
        'La UGEL autoriza para el destaque y la permuta se solicita con acuerdo de partes.',
        'La UGEL evalúa al destaque y la permuta se solicita con acuerdo de partes.',
      ])
        expect(
          belongsToAdmittedProcedure(destaque, {
            chunkContent,
            documentTitle: 'Norma técnica de reasignación, permuta y destaque',
            sectionTitle: 'Del plazo',
          }),
        ).toBe(true);
    });

    it('admite la concordancia plural cuando la palabra parece un nombre', () => {
      // «Resumen» termina como un verbo plural y concuerda con los dos nombres:
      // el fragmento trata los dos trámites y no se pierde por parecer un nombre
      // como «joven» o «examen», que sí abren el complemento del hermano.
      expect(
        belongsToAdmittedProcedure(intent('necesito descanso medico'), {
          chunkContent:
            'El descanso médico, que se otorga por siete días, y la licencia por paternidad resumen los requisitos.',
          documentTitle: 'Norma técnica de licencias, permisos y vacaciones',
          sectionTitle: 'Del plazo',
        }),
      ).toBe(true);
    });

    it('admite la licencia por enfermedad del propio docente', () => {
      // «Enfermedad del docente» es la causal propia; solo la del familiar es
      // otra causal.
      expect(
        treatsInheritedProcess(
          intent('necesito descanso medico'),
          {
            chunkContent:
              'La licencia por enfermedad del docente se otorga por el plazo que indique el certificado médico.',
            documentTitle: 'Norma técnica de licencias, permisos y vacaciones',
            sectionTitle: 'De la licencia por enfermedad',
          },
          true,
        ),
      ).toBe(true);
    });

    it('conserva el régimen del título cuando el cuerpo solo dice «personal nombrado»', () => {
      // El módulo de la licencia lo fija la comprobación clínica del servicio;
      // aquí se representa la intención que llega a la compuerta.
      const auxiliar: TopicIntent = {
        ...intent('soy auxiliar de educacion y necesito descanso medico'),
        moduleName: 'Auxiliar de educación',
      };
      // «Nombrado» describe el vínculo, no el régimen: el título sigue siendo la
      // fuente cuando el cuerpo no nombra a la población.
      expect(
        treatsInheritedProcess(
          auxiliar,
          {
            chunkContent:
              'El personal nombrado presenta su solicitud de licencia por salud ante la UGEL.',
            documentTitle:
              'Norma técnica de licencias para auxiliares de educación',
            sectionTitle: 'De la licencia',
          },
          true,
        ),
      ).toBe(true);
    });

    it('no atribuye el régimen por el título del documento', () => {
      const auxiliar = intent('soy auxiliar y quiero reasignarme');
      // Un documento titulado «para auxiliares de educación» puede tener
      // fragmentos que desarrollan el procedimiento de profesores: el cuerpo
      // manda.
      expect(
        treatsInheritedProcess(
          auxiliar,
          {
            chunkContent:
              'El profesor presenta su solicitud de licencia por incapacidad temporal con el certificado médico.',
            documentTitle:
              'Norma técnica de licencias para auxiliares de educación',
            sectionTitle: 'De la licencia',
          },
          true,
        ),
      ).toBe(false);
    });
  });

  describe('turnos que no heredan', () => {
    it.each([
      // Rechazo explícito del tema: no hay trámite que completar.
      'no quiero nada de eso',
      'no me interesa, dejemos eso',
      // Pregunta autónoma que ya trae su propio tema.
      'que documentos piden para la matricula escolar',
      // Otro asunto: un verbo del trámite («qué hago») no basta cuando el
      // turno habla de una persona o de un conflicto del aula.
      'que hago si mi colega me insulta',
      'como presento un reclamo contra el director',
      'que hago si mis alumnos no tienen materiales',
      // La condicional no basta por sí sola: una condición sobre la salud de un
      // tercero es otra consulta, no un seguimiento del trámite.
      'y si mi hijo esta enfermo',
      'y si mi esposo consigue trabajo en otra region',
      'y si mi hijo no aprende en la ie',
      // Una persona del centro de trabajo no convierte en trámite propio la
      // condicional sobre lo que a ella le pasa: la solicitud o el plazo sí.
      'y si el director no me acepta en el aula',
      'y si la directora no me acepta el cambio de seccion',
      'y si mi colega no me acepta en el aula',
    ])('no hereda el proceso en «%s»', (question) => {
      expect(
        inheritedTopicIntent(question, [
          'como destacarme en otro colegio',
          'que causales existen en el destaque',
        ]),
      ).toBeNull();
    });

    it('conserva el proceso cuando el rechazo viene con una nueva pregunta', () => {
      // «No quiero eso» descarta la respuesta anterior, no el proceso: el
      // plazo sigue siendo el del proceso abierto.
      expect(
        inheritedTopicIntent('no quiero eso, y el plazo', [
          'como destacarme en otro colegio',
        ]),
      ).toMatchObject({ id: 'temporary-placement' });
    });

    it.each([
      'y que necesito',
      'y a quien le pido',
      'que tengo que hacer',
      'y ahora que hago',
      // Condicional que continúa el proceso abierto sin nombrarlo.
      'y si la ugel no me responde',
      'y si no me firma la solicitud',
      'y si no me aceptan',
      // La causal nombrada como tal sí ata el turno al proceso abierto, aunque
      // el motivo sea la salud o la familia.
      'y si tengo una enfermedad, que causal invoco',
      'y por causal de unidad familiar',
      'y por mi familia',
      'y por razones familiares',
      'y por motivo familiar',
      'y por razón de familia',
      // Condicional sobre el trámite en la que interviene un tercero.
      'y si el director no firma mi solicitud',
      'y si el director no firma la resolucion',
    ])('reconoce «%s» como dependiente del proceso abierto', (question) => {
      expect(
        inheritedTopicIntent(question, ['como destacarme en otro colegio']),
      ).toMatchObject({ id: 'temporary-placement' });
    });
  });
});
