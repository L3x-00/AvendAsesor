import {
  isMedicalLeaveQuestion,
  administrativeEvidenceQueries,
} from './administrative-retrieval';
import {
  isAuxiliaryRequirementsQuestion,
  auxiliaryEvidenceQueries,
} from './auxiliary-retrieval';
import {
  isCareerProgressionQuestion,
  evaluationEvidenceQueries,
} from './evaluation-retrieval';
import {
  isDirectReassignmentEvidence,
  isReassignmentQuestion,
  reassignmentEvidenceQueries,
} from './reassignment-retrieval';
import {
  isDirectRationalizationEvidence,
  isRationalizationQuestion,
} from './rationalization-retrieval';
import { inheritedFactorQuestions } from './rag.service';
import {
  isBroadSalaryQuestion,
  isPersonalSalaryQuestion,
  salaryClarificationFor,
} from './salary-applicability';
import type { RetrievedChunk } from './retrieval.gateway';

function source(
  chunkContent: string,
  documentTitle = 'Norma interna',
): RetrievedChunk {
  return {
    articleReference: null,
    chunkContent,
    chunkId: chunkContent.slice(0, 20),
    documentId: 'document',
    documentSituation: 'current',
    documentTitle,
    documentVersionId: 'version',
    lexicalScore: 0.5,
    moduleIds: ['module'],
    moduleNames: ['Módulo'],
    numeralReference: null,
    pageEnd: 1,
    pageStart: 1,
    sectionTitle: null,
    semanticScore: 0.8,
    versionNumber: 1,
  };
}

/**
 * Guardas generales de intención que evitan dos fallos del chat general:
 * clasificar un beneficio o un ascenso como una pregunta de cifra personal, y
 * heredar una consulta salarial anterior cuando la nueva pregunta cambia de
 * tema. No se fijan respuestas: solo el enrutamiento y la ausencia de
 * aclaraciones innecesarias.
 */
describe('intención del chat general', () => {
  it('reconoce el descanso prescrito como licencia por incapacidad temporal', () => {
    expect(
      isMedicalLeaveQuestion(
        'el doctor me dio descanso por 15 dias como justifico eso en mi colegio',
      ),
    ).toBe(true);
    expect(isMedicalLeaveQuestion('¿Cómo solicito una licencia?')).toBe(false);
    expect(
      administrativeEvidenceQueries(
        'el doctor me dio descanso por 15 dias como justifico eso en mi colegio',
      ).join(' '),
    ).toContain('incapacidad temporal');
  });

  it('reconoce la progresión a otra escala como ascenso y no como cifra', () => {
    const question =
      'ya tengo varios años en primera escala como hago para subir a segunda';
    expect(isCareerProgressionQuestion(question)).toBe(true);
    expect(isPersonalSalaryQuestion(question)).toBe(false);
    expect(evaluationEvidenceQueries(question).join(' ')).toContain('ascenso');
    expect(
      inheritedFactorQuestions(
        question,
        ['mi colegio esta en zona rural me toca recibir un pago adicional'],
        false,
      ),
    ).toEqual([]);
  });

  it('no pide el vínculo cuando la consulta es una asignación por ruralidad', () => {
    const question =
      'mi colegio esta en zona rural me toca recibir un pago adicional';
    expect(isPersonalSalaryQuestion(question)).toBe(false);
    expect(isBroadSalaryQuestion(question)).toBe(true);
    const sources = [
      source('Asignación rural: S/ 500,00 para el profesor nombrado.'),
      source('Asignación rural: S/ 300,00 para el profesor contratado.'),
    ];
    expect(salaryClarificationFor(question, sources)).toBeNull();
  });

  it('no pide el cargo en una pregunta de ascenso aunque no use la palabra', () => {
    const question =
      'ya tengo varios años en primera escala como hago para subir a segunda';
    const sources = [
      source('Ascenso de escala: S/ 2 000,00 para el docente.'),
      source('Ascenso de escala: S/ 3 000,00 para el directivo.'),
    ];
    expect(salaryClarificationFor(question, sources)).toBeNull();
  });

  it('traduce el traslado familiar a la reasignación y su causal', () => {
    const question =
      'soy nombrado en junin pero quiero irme a lima porque mi familia vive alla que hago';
    expect(isReassignmentQuestion(question)).toBe(true);
    expect(reassignmentEvidenceQueries(question).join(' ')).toContain(
      'unidad familiar',
    );
    expect(
      isDirectReassignmentEvidence(
        question,
        source(
          'Reasignación por unidad familiar: el profesor acredita convivencia familiar.',
          'Norma técnica de la reasignación y permuta docente',
        ),
      ),
    ).toBe(true);
    expect(
      isDirectReassignmentEvidence(
        question,
        source(
          'La reasignación de los auxiliares de educación se solicita a la UGEL.',
          'Norma de situaciones administrativas de auxiliares',
        ),
      ),
    ).toBe(false);
    // El rol declarado por la persona decide qué procedimiento la respalda.
    const auxiliaryQuestion =
      'soy auxiliar y quiero reasignarme a otra UGEL que necesito';
    expect(auxiliaryQuestion.length).toBeGreaterThan(0);
    expect(
      isDirectReassignmentEvidence(
        auxiliaryQuestion,
        source(
          'La reasignación de los auxiliares de educación se solicita a la UGEL de destino.',
          'Norma de situaciones administrativas de auxiliares',
        ),
      ),
    ).toBe(true);
    expect(
      isDirectReassignmentEvidence(
        auxiliaryQuestion,
        source(
          'La reasignación por unidad familiar procede para el profesor nombrado.',
          'Norma técnica de la reasignación y permuta docente',
        ),
      ),
    ).toBe(false);
  });

  it('distingue la norma de racionalización de una mención incidental', () => {
    const question =
      'en mi colegio estan bajando los alumnos y dicen que van a reducir plazas eso se puede';
    expect(isRationalizationQuestion(question)).toBe(true);
    expect(
      isDirectRationalizationEvidence(
        question,
        source(
          'La racionalización de plazas por disminución de estudiantes se aprueba mediante resolución.',
        ),
      ),
    ).toBe(true);
    expect(
      isDirectRationalizationEvidence(
        question,
        source(
          'Es causal de conclusión del contrato el desplazamiento por racionalización de personal excedente.',
        ),
      ),
    ).toBe(false);
  });

  it('identifica los requisitos del auxiliar sin confundirlos con su sueldo', () => {
    const question =
      'mi hermana quiere trabajar de auxiliar en inicial que estudios necesita';
    expect(isAuxiliaryRequirementsQuestion(question)).toBe(true);
    expect(auxiliaryEvidenceQueries(question).join(' ')).toContain(
      'requisitos',
    );
    expect(
      isAuxiliaryRequirementsQuestion('¿Cuánto gana un auxiliar de educación?'),
    ).toBe(false);
  });
});
