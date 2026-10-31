import type { RetrievedChunk } from './retrieval.gateway';
import {
  isDirectRemunerationEvidence,
  isPayrollReviewQuestion,
  remunerationEvidenceQueries,
} from './remuneration-retrieval';

function source(
  chunkContent: string,
  documentTitle = 'Documento de remuneraciones',
): Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'> {
  return { chunkContent, documentTitle };
}

describe('remunerationEvidenceQueries', () => {
  it('reconoce una consulta personal coloquial por quinta escala', () => {
    expect(
      remunerationEvidenceQueries(
        'Soy docente de quinta escala, cuánto me corresponde?',
      ),
    ).toContain(
      'monto de la remuneración íntegra mensual RIM primera escala magisterial',
    );
  });

  it('reconoce ruralidad aunque no se escriba la palabra rural', () => {
    expect(
      remunerationEvidenceQueries(
        '¿Cómo sé si mi institución figura en los padrones de ruralidad?',
      ),
    ).toContain(
      'asignación por trabajo en ámbito rural padrón de instituciones educativas instrumento habilitante',
    );
  });

  it('reconoce la flexión coloquial de ascender y busca el acto de planilla', () => {
    expect(
      remunerationEvidenceQueries(
        'Si asciendo de escala, cambia mi remuneración?',
      ),
    ).toContain(
      'ascenso de escala magisterial acto resolutivo pago planilla única de pagos',
    );
  });

  it.each([
    '¿Qué requisito tiene mi institución educativa para recibir una asignación?',
    '¿Cómo presento un reclamo por mi evaluación?',
    '¿Cómo asciendo a un cargo directivo?',
    '¿Cómo se registra la planilla de asistencia?',
    '¿Qué es la boleta de notas?',
  ])('no desvía una consulta ajena a remuneraciones: %s', (question) => {
    expect(remunerationEvidenceQueries(question)).toEqual([]);
  });
});

describe('isDirectRemunerationEvidence', () => {
  it('no confunde una finalidad de planilla ni un reintegro administrativo con revisión remunerativa', () => {
    expect(
      isPayrollReviewQuestion(
        '¿Cuál es la finalidad del instructivo para elaborar la planilla de pagos?',
      ),
    ).toBe(false);
    expect(
      isPayrollReviewQuestion('¿Qué dice sobre reintegro extraordinario?'),
    ).toBe(false);
  });
  it('prioriza un acto de ascenso que deriva en pago y no una escala genérica', () => {
    const question = 'Si asciendo de escala, cambia mi remuneración?';
    expect(
      isDirectRemunerationEvidence(
        question,
        source(
          'El acto resolutivo de ascenso de escala magisterial deriva en pago por planilla.',
        ),
      ),
    ).toBe(true);
    expect(
      isDirectRemunerationEvidence(
        question,
        source('La remuneración mensual se fija para una jornada de 30 horas.'),
      ),
    ).toBe(false);
  });

  it('prioriza el padrón sin asumir que confirme una institución actual', () => {
    expect(
      isDirectRemunerationEvidence(
        '¿Cómo sé si mi institución figura en los padrones de ruralidad?',
        source(
          'Anexo: Padrón de Instituciones Educativas Públicas Unidocentes en ámbito rural.',
        ),
      ),
    ).toBe(true);
  });

  it('no confunde una mención incidental de padrón con el listado rural consultado', () => {
    expect(
      isDirectRemunerationEvidence(
        '¿Cómo sé si mi institución figura en los padrones de ruralidad?',
        source('El padrón de pago de la RIM se actualiza durante el año.'),
      ),
    ).toBe(false);
  });

  it('excluye un padrón de alumnos aunque mencione instituciones y zona rural', () => {
    expect(
      isDirectRemunerationEvidence(
        '¿Cómo sé si mi institución figura en los padrones de ruralidad?',
        source(
          'La distribución de plazas usa un padrón nominado de alumnos registrados en instituciones educativas de zona rural.',
        ),
      ),
    ).toBe(false);
  });

  it('no atribuye al decreto nuevo un padrón que aparece antes de su cabecera', () => {
    expect(
      isDirectRemunerationEvidence(
        '¿Cómo sé si mi institución figura en los padrones de ruralidad?',
        source(
          'El padrón de instituciones educativas públicas rurales se actualiza anualmente. DECRETO SUPREMO Nº 227-2015-EF',
          'Modifica asignación rural Decreto Supremo N.° 227-2015-EF',
        ),
      ),
    ).toBe(false);
  });

  it('no toma una asignación rural previa como artículo propio del decreto siguiente', () => {
    expect(
      isDirectRemunerationEvidence(
        'Si trabajo en una zona rural, ¿me corresponde una asignación?',
        source(
          'La asignación temporal por prestar servicios en zona rural continúa vigente. DECRETO SUPREMO Nº 227-2015-EF',
          'Modifica asignación rural Decreto Supremo N.° 227-2015-EF',
        ),
      ),
    ).toBe(false);
  });

  it('exige padrón habilitante para una asignación rural y excluye jornada adicional', () => {
    const question =
      'Si trabajo en una zona rural, ¿me corresponde una asignación?';
    expect(
      isDirectRemunerationEvidence(
        question,
        source(
          'DECRETA: Artículo 1.- La asignación temporal por prestar servicios en una institución educativa pública ubicada en zona rural se aplica según la clasificación de ruralidad.',
        ),
      ),
    ).toBe(true);
    expect(
      isDirectRemunerationEvidence(
        question,
        source('La jornada adicional de encargatura recibe un pago mensual.'),
      ),
    ).toBe(false);
  });
});
