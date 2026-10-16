import { salaryQuestionProfile } from './salary-applicability';

describe('OBS-002/004 — consulta salarial en lenguaje natural', () => {
  it.each([
    'Soy docente contratado de secundaria con jornada de 30 horas. ¿Cuánto debería ganar en 2025?',
    'Soy docente contratado, 30 horas. ¿Cuánto gano en 2025?',
    '¿Cuánto debo ganar como docente contratado?',
    '¿Cuánto puedo ganar como profesor?',
    '¿Cuánto voy a ganar como docente?',
  ])('reconoce la pregunta por el importe: %s', (question) => {
    expect(salaryQuestionProfile(question).isSalaryQuestion).toBe(true);
  });

  it.each([
    '¿Cómo puedo ganar un concurso de nombramiento docente?',
    '¿Cuántos puntos necesito para ganar el concurso?',
    'Quiero ganar una plaza como docente.',
  ])('no confunde ganar un concurso con remuneración: %s', (question) => {
    expect(salaryQuestionProfile(question).isSalaryQuestion).toBe(false);
  });

  it('conserva los factores explícitos de la pregunta original', () => {
    expect(
      salaryQuestionProfile(
        'Soy docente contratado de secundaria con jornada de 30 horas. ¿Cuánto debería ganar en 2025?',
      ),
    ).toMatchObject({
      condition: 'contratado',
      jornadaHours: 30,
      role: 'docente',
      year: 2025,
    });
  });
});
