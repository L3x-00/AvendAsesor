import {
  belongsToAdmittedProcedure,
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
      // habla el fragmento.
      expect(
        treatsInheritedProcess(
          destaque,
          {
            chunkContent:
              'El plazo es de quince días cuando se trata de una permuta.',
            documentTitle: 'RSG N.° 326-2017-MINEDU',
            sectionTitle: 'Del plazo',
          },
          true,
        ),
      ).toBe(false);
      expect(
        treatsInheritedProcess(
          destaque,
          {
            chunkContent:
              'El plazo es de quince días en el caso de la permuta.',
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
      // que se consulta. La compuerta explícita no tiene la salida por nombre
      // propio del hilo heredado, así que aquí se ve el efecto del enmarque.
      const licencias = 'Norma técnica de licencias, permisos y vacaciones';
      for (const chunkContent of [
        'En el caso de la licencia por enfermedad, se otorga por el plazo del certificado médico.',
        'Cuando se trata de la licencia por incapacidad temporal, se requiere CITT.',
        'Tratándose de la licencia por salud, el plazo lo fija el certificado.',
      ])
        expect(
          belongsToAdmittedProcedure(intent('necesito descanso medico'), {
            chunkContent,
            documentTitle: licencias,
            sectionTitle: 'Del plazo',
          }),
        ).toBe(true);
      // La causal ajena enmarcada sí es otro trámite.
      expect(
        belongsToAdmittedProcedure(intent('necesito descanso medico'), {
          chunkContent:
            'En el caso de la licencia por paternidad, se otorgan diez días.',
          documentTitle: licencias,
          sectionTitle: 'Del plazo',
        }),
      ).toBe(false);
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
