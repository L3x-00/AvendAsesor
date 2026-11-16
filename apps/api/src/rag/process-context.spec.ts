import {
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
      // La causal nombrada como tal sí ata el turno al proceso abierto, aunque
      // el motivo sea la salud o la familia.
      'y si tengo una enfermedad, que causal invoco',
      'y por causal de unidad familiar',
    ])('reconoce «%s» como dependiente del proceso abierto', (question) => {
      expect(
        inheritedTopicIntent(question, ['como destacarme en otro colegio']),
      ).toMatchObject({ id: 'temporary-placement' });
    });
  });
});
