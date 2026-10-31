import type { RetrievedChunk } from './retrieval.gateway';
import {
  auxiliaryEvidenceQueries,
  isAuxiliarySourceCompatible,
  isDirectAuxiliaryEvidence,
} from './auxiliary-retrieval';

function source(
  chunkContent: string,
  documentTitle = 'Norma auxiliar',
): Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'> {
  return { chunkContent, documentTitle };
}

describe('auxiliaryEvidenceQueries', () => {
  it.each([
    [
      'Quiero trabajar como auxiliar de educación, ¿qué necesito?',
      'contratación auxiliares educación requisitos por nivel modalidad capacitación edad documentos expediente 2026',
    ],
    [
      'Soy auxiliar contratado y tengo licencia por enfermedad.',
      'auxiliar de educación licencia incapacidad temporal enfermedad CITT contratado nombrado',
    ],
    [
      '¿Puedo nombrarme como auxiliar si ya llevo años contratado?',
      'concurso público nombramiento auxiliar de educación requisitos experiencia',
    ],
    [
      '¿Un auxiliar puede pedir reasignación para otra UGEL?',
      'reasignación auxiliar de educación otra UGEL requisitos causales titular nombrado',
    ],
  ])('traduce la consulta cotidiana: %s', (question, expected) => {
    expect(auxiliaryEvidenceQueries(question)).toContain(expected);
  });

  it('no activa una búsqueda de auxiliar ante una consulta docente', () => {
    expect(
      auxiliaryEvidenceQueries('¿Qué vacaciones tiene un docente?'),
    ).toEqual([]);
  });
});

describe('isAuxiliarySourceCompatible', () => {
  it('rechaza la experiencia de contratación como evidencia de nombramiento', () => {
    expect(
      isAuxiliarySourceCompatible(
        '¿Puedo nombrarme como auxiliar si ya llevo años contratado?',
        source(
          'Contratación de auxiliar de educación: experiencia laboral y puntaje.',
        ),
      ),
    ).toBe(false);
  });

  it('acepta el concurso de nombramiento del auxiliar', () => {
    expect(
      isAuxiliarySourceCompatible(
        '¿Puedo nombrarme como auxiliar si ya llevo años contratado?',
        source(
          'Concurso público de nombramiento de auxiliar de educación: requisitos y evaluación.',
        ),
      ),
    ).toBe(true);
  });

  it('no atribuye una remuneración docente a un auxiliar', () => {
    expect(
      isAuxiliarySourceCompatible(
        '¿Cuánto gana un auxiliar de educación nombrado?',
        source(
          'Remuneración mensual del profesor nombrado.',
          'Ley remunerativa',
        ),
      ),
    ).toBe(false);
  });

  it('no admite contratación docente cuando el cargo auxiliar se expresa en singular', () => {
    expect(
      isAuxiliarySourceCompatible(
        'Quiero trabajar como auxiliar, ¿qué requisitos necesito?',
        source('Contratación docente: requisitos y expediente.'),
      ),
    ).toBe(false);
  });

  it('tampoco admite contratación docente ante la forma plural abreviada', () => {
    expect(
      isAuxiliarySourceCompatible(
        '¿Qué requisitos piden para auxiliares?',
        source('Contratación docente: requisitos y expediente.'),
      ),
    ).toBe(false);
  });

  it('reserva una fuente directa de vacaciones del auxiliar aunque sea transversal', () => {
    const vacation = source(
      'El auxiliar de educación nombrado percibe remuneración vacacional y al contratado le corresponde vacaciones truncas.',
      'Instructivo de planilla',
    );
    expect(
      isDirectAuxiliaryEvidence(
        'El auxiliar tiene vacaciones pagadas igual que un profesor?',
        vacation,
      ),
    ).toBe(true);
  });
});
