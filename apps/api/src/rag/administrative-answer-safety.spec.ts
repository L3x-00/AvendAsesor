import {
  hasUnsupportedAdministrativeInference,
  needsAdministrativeAnswerSafety,
} from './administrative-answer-safety';

describe('administrative answer safety', () => {
  it('retiene la confusión entre CITT y receta de certificado médico', () => {
    const question =
      'me dieron descanso medico por una semana, como presento mi licencia';
    expect(needsAdministrativeAnswerSafety(question)).toBe(true);
    expect(
      hasUnsupportedAdministrativeInference(
        question,
        'Adjunta la receta médica suscrita por el médico que expide el CITT.',
      ),
    ).toBe(true);
    expect(
      hasUnsupportedAdministrativeInference(
        question,
        'Puedes presentar CITT o certificado médico; para el certificado médico adjunta la receta médica.',
      ),
    ).toBe(false);
  });

  it('retiene una constancia de hospitalización presentada como obligatoria', () => {
    expect(
      hasUnsupportedAdministrativeInference(
        'soy auxiliar contratado y me enferme, puedo pedir descanso medico',
        'Deberás adjuntar la constancia de hospitalización.',
      ),
    ).toBe(true);
    expect(
      hasUnsupportedAdministrativeInference(
        'soy auxiliar contratado y me enferme, puedo pedir descanso medico',
        'Puedes adjuntar la constancia de hospitalización.',
      ),
    ).toBe(false);
  });

  it('retiene requisitos acumulados y obligatoriedad con orden inverso', () => {
    const question = 'licencia por descanso medico';
    expect(
      hasUnsupportedAdministrativeInference(
        question,
        'Debes adjuntar el CITT y presentar receta médica y recibos.',
      ),
    ).toBe(true);
    expect(
      hasUnsupportedAdministrativeInference(
        question,
        'La constancia de hospitalización es obligatoria.',
      ),
    ).toBe(true);
    expect(
      hasUnsupportedAdministrativeInference(
        question,
        'Debe presentar CITT, junto con receta y recibos. Consulte al director o a la UGEL.',
      ),
    ).toBe(true);
    expect(
      hasUnsupportedAdministrativeInference(
        question,
        'Debes adjuntar el CITT y receta médica o recibos de atención.',
      ),
    ).toBe(true);
  });

  it('no acepta una alternativa seguida de una obligación incompatible', () => {
    const question = 'licencia por descanso medico';
    expect(
      hasUnsupportedAdministrativeInference(
        question,
        'Puede presentar CITT o certificado médico. Debe adjuntar el CITT y la receta médica para toda solicitud.',
      ),
    ).toBe(true);
    expect(
      hasUnsupportedAdministrativeInference(
        question,
        'Puedes presentar CITT o certificado médico. En ambos casos debes acompañar la receta médica y recibos.',
      ),
    ).toBe(true);
    expect(
      hasUnsupportedAdministrativeInference(
        question,
        'Puede presentar CITT o certificado médico. Deberás adjuntar receta y comprobantes independientemente del documento presentado.',
      ),
    ).toBe(true);
    expect(
      hasUnsupportedAdministrativeInference(
        question,
        'Puede presentar CITT o certificado médico. Debes adjuntar la receta médica y los recibos.',
      ),
    ).toBe(true);
    expect(
      hasUnsupportedAdministrativeInference(
        question,
        'Puedes presentar CITT o certificado médico. Además, adjunta siempre la receta médica y los recibos.',
      ),
    ).toBe(true);
  });
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
