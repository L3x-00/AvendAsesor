import type { RetrievedChunk } from './retrieval.gateway';
import {
  evaluationEvidenceQueries,
  isEvaluationSourceCompatible,
} from './evaluation-retrieval';

function source(
  chunkContent: string,
): Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'> {
  return { chunkContent, documentTitle: 'Norma de evaluación' };
}

describe('evaluationEvidenceQueries', () => {
  it.each([
    [
      'Estoy en segunda escala, ¿qué se evalúa para ascender?',
      'concurso de ascenso escala magisterial requisitos etapas prueba nacional trayectoria profesional',
    ],
    [
      '¿Puedo postular al ascenso si no cumplo la permanencia mínima?',
      'concurso ascenso permanencia mínima escala magisterial requisitos',
    ],
    [
      '¿Una maestría suma para el ascenso?',
      'concurso ascenso maestría puntaje trayectoria profesional',
    ],
  ])('reconoce una consulta coloquial de ascenso: %s', (question, expected) => {
    expect(evaluationEvidenceQueries(question)).toContain(expected);
  });

  it.each([
    '¿Cuánto gana un docente de primera escala magisterial con 30 horas?',
    '¿La maestría suma puntos en la renovación de mi contrato?',
    '¿Dónde reclamo mi boleta de pago?',
  ])('no desplaza una consulta ajena hacia ascenso: %s', (question) => {
    expect(evaluationEvidenceQueries(question)).toEqual([]);
  });
});

describe('isEvaluationSourceCompatible', () => {
  it('no mezcla desempeño de contratación con desempeño de docentes nombrados', () => {
    const question =
      'Si desapruebo la evaluación de desempeño como docente nombrado, ¿qué ocurre?';
    expect(
      isEvaluationSourceCompatible(
        question,
        source(
          'Ficha de evaluación del desempeño laboral para docentes contratados y renovación de contrato.',
        ),
      ),
    ).toBe(false);
  });

  it('no usa una tabla de contratación como puntaje del concurso de ascenso', () => {
    expect(
      isEvaluationSourceCompatible(
        '¿Una maestría da puntos en el concurso de ascenso?',
        source(
          'Evaluación de expediente para contratación docente: maestría seis puntos.',
        ),
      ),
    ).toBe(false);
  });

  it('acepta una fuente que nombra expresamente el concurso de ascenso', () => {
    expect(
      isEvaluationSourceCompatible(
        '¿Qué se evalúa en el ascenso de escala?',
        source(
          'Concurso de ascenso: prueba nacional y trayectoria profesional.',
        ),
      ),
    ).toBe(true);
  });
});
