import {
  hasUnsupportedAdministrativeInference,
  needsAdministrativeAnswerSafety,
} from './administrative-answer-safety';

describe('administrative answer safety', () => {
  it('retiene una afirmación que convierte los primeros veinte días en máximo', () => {
    const question =
      'Estoy enfermo, ¿cuántos días puedo faltar con descanso médico?';
    expect(needsAdministrativeAnswerSafety(question)).toBe(true);
    expect(
      hasUnsupportedAdministrativeInference(
        question,
        'Puedes faltar hasta un máximo de veinte días con goce de remuneraciones.',
      ),
    ).toBe(true);
  });

  it('no niega vacaciones a contratados por el silencio de una sección para nombrados', () => {
    const answer = hasUnsupportedAdministrativeInference(
      'Si soy contratado, ¿también tengo derecho a vacaciones o solo los nombrados?',
      'Parece que solo los nombrados tienen derecho a vacaciones.',
    );
    expect(answer).toBe(true);
  });

  it('no completa la distribución de la jornada con actividades no recuperadas', () => {
    const answer = hasUnsupportedAdministrativeInference(
      'Trabajo 30 horas en secundaria, ¿todas son horas de clase?',
      'También incluye planificación, reuniones y formación continua.',
    );
    expect(answer).toBe(true);
  });

  it('no deduce una exoneración para una tardanza aislada', () => {
    const answer = hasUnsupportedAdministrativeInference(
      'Mi director me quiere descontar por llegar tarde 10 minutos, ¿eso procede?',
      'Si solo has llegado tarde una vez, el descuento no debería proceder.',
    );
    expect(answer).toBe(true);
  });

  it('no modifica una respuesta administrativa que ya declara su límite', () => {
    const answer =
      'La fuente no precisa cómo se distribuyen las horas entre clases y otras actividades.';
    expect(
      hasUnsupportedAdministrativeInference(
        'Trabajo 30 horas en secundaria, ¿todas son horas de clase?',
        answer,
      ),
    ).toBe(false);
  });
});
