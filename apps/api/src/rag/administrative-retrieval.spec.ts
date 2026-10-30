import type { RetrievedChunk } from './retrieval.gateway';
import {
  administrativeEvidenceQueries,
  isDirectAdministrativeEvidence,
} from './administrative-retrieval';

function source(
  chunkContent: string,
): Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'> {
  return { chunkContent, documentTitle: 'Norma administrativa' };
}

describe('administrativeEvidenceQueries', () => {
  it('lleva un descanso médico a licencia por incapacidad temporal, no a permiso por horas', () => {
    expect(
      administrativeEvidenceQueries(
        'Soy profesor nombrado y estoy enfermo, cuantos dias puedo faltar con descanso medico',
      ),
    ).toContain(
      'licencia por incapacidad temporal descanso médico CITT certificado médico profesor',
    );
  });

  it.each([
    [
      'necesito faltar dos dias al colegio por motivos personales',
      'permiso por motivos particulares profesor nombrado ausencia por horas requisitos',
    ],
    [
      'si soy contratado tambien tengo derecho a vacaciones o solo los nombrados',
      'vacaciones profesores nombrados contratados Carrera Pública Magisterial',
    ],
    [
      'mi director me quiere descontar por llegar tarde 10 minutos',
      'tardanza descuento asistencia tercera tardanza factor minuto jornada laboral profesor',
    ],
    [
      'un docente puede ser sancionado sin que le permitan defenderse',
      'proceso administrativo disciplinario docente derecho de defensa descargos notificación',
    ],
    [
      'trabajo 30 horas en secundaria pero quiero saber si todas son horas de clase',
      'jornada de trabajo profesor secundaria horas pedagógicas horas lectivas',
    ],
  ])(
    'reconoce una consulta administrativa coloquial: %s',
    (question, expected) => {
      expect(administrativeEvidenceQueries(question)).toContain(expected);
    },
  );

  it('no convierte una notificación ajena al PAD en una búsqueda disciplinaria', () => {
    expect(
      administrativeEvidenceQueries('No veo la notificación de mi boleta'),
    ).toEqual([]);
  });

  it.each([
    '¿Cómo reclamo una nota de mi hijo?',
    '¿Cuál es el horario de atención de la biblioteca?',
    '¿Qué actividades complementarias hace un estudiante?',
  ])(
    'no convierte una consulta ajena en una búsqueda administrativa: %s',
    (question) => {
      expect(administrativeEvidenceQueries(question)).toEqual([]);
    },
  );
});

describe('isDirectAdministrativeEvidence', () => {
  it('prefiere la licencia por incapacidad temporal frente a la licencia por asistencia médica', () => {
    const question =
      'Estoy enfermo, ¿cuántos días puedo faltar con descanso médico?';
    expect(
      isDirectAdministrativeEvidence(
        question,
        source(
          '5.4 Licencia por incapacidad temporal. La solicitud se sustenta con CITT o certificado médico.',
        ),
      ),
    ).toBe(true);
    expect(
      isDirectAdministrativeEvidence(
        question,
        source(
          'Licencia por asistencia médica y terapia de rehabilitación: se otorga por horas.',
        ),
      ),
    ).toBe(false);
  });

  it('reserva la fuente que regula la defensa y no solo una sanción incidental', () => {
    const question =
      '¿Un docente puede ser sancionado sin que le permitan defenderse?';
    expect(
      isDirectAdministrativeEvidence(
        question,
        source(
          'El proceso administrativo disciplinario reconoce el derecho de defensa, descargos y notificación.',
        ),
      ),
    ).toBe(true);
    expect(
      isDirectAdministrativeEvidence(
        question,
        source('Las sanciones se registran en el escalafón.'),
      ),
    ).toBe(false);
  });
});
