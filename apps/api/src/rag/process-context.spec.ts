import {
  inheritedTopicIntent,
  isProcessDependentTurn,
  processCanonicalQuery,
  processQueriesForIntent,
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
    });
  });

  describe('turnos que no heredan', () => {
    it.each([
      // Rechazo explícito del tema: no hay trámite que completar.
      'no quiero nada de eso',
      'no me interesa, dejemos eso',
      // Pregunta autónoma que ya trae su propio tema.
      'que documentos piden para la matricula escolar',
    ])('no hereda el proceso en «%s»', (question) => {
      expect(
        inheritedTopicIntent(question, [
          'como destacarme en otro colegio',
          'que causales existen en el destaque',
        ]),
      ).toBeNull();
    });

    it.each([
      'y que necesito',
      'y a quien le pido',
      'que tengo que hacer',
      'y ahora que hago',
    ])('reconoce «%s» como dependiente del proceso abierto', (question) => {
      expect(
        inheritedTopicIntent(question, ['como destacarme en otro colegio']),
      ).toMatchObject({ id: 'temporary-placement' });
    });
  });
});
