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
  it.each([
    'mi boleta está equivocada, cómo la reclamo',
    'quiero que revisen mi boleta porque me falta plata',
    'mi pago vino incompleto en la boleta, donde reclamo',
    'mi boleta de pago está mal',
    'quiero revisar mi boleta y mis notas personales',
    'no necesito revisar mis notas pero mi boleta de pago está equivocada y quiero reclamar',
    'no quiero revisar mi boleta del mes pasado, quiero reclamar mi boleta de pago actual',
    'mi boleta de notas no está mal pero quiero reclamar la boleta de pago',
    'mi boleta de pago, quiero reclamarla',
    'mi sueldo, tiene un descuento injustificado',
    'mi boleta de pago tiene errores, como reclamo',
    'mi boleta de notas está bien y quiero reclamar mi boleta de pago',
  ])(
    'reconoce una solicitud coloquial de revisión de boleta: %s',
    (question) => {
      expect(isPayrollReviewQuestion(question)).toBe(true);
    },
  );

  it('no confunde una boleta de notas con un reclamo remunerativo', () => {
    expect(isPayrollReviewQuestion('quiero reclamar la boleta de notas')).toBe(
      false,
    );
  });
  it.each([
    'quiero reclamar la boleta de venta',
    'cuál es la sanción por tardanza y descuento',
    'no necesito revisar mi boleta de pago',
    'mi boleta ya está correcta, no quiero hacer un reclamo',
    'qué es la boleta de sueldo',
    'cómo descargar mi boleta de sueldo',
    'no voy a reclamar mi boleta de pago',
  ])('no trata como reclamo remunerativo: %s', (question) => {
    expect(isPayrollReviewQuestion(question)).toBe(false);
  });
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
