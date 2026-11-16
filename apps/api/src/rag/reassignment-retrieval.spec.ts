import {
  isDirectReassignmentEvidence,
  isExclusiveExchangeSectionForReassignment,
} from './reassignment-retrieval';
import type { RetrievedChunk } from './retrieval.gateway';

describe('secciones incompatibles con la consulta de reasignación', () => {
  const section = {
    sectionTitle: 'DISPOSICIONES ESPECÍFICAS DE LA PERMUTA La permuta procede',
    chunkContent:
      'DISPOSICIONES ESPECÍFICAS DE LA PERMUTA La permuta procede. 8.1 Requisitos: informe escalafonario.',
  };
  const reassignment =
    'Soy profesor nombrado y quiero solicitar una reasignación por unidad familiar';
  it('excluye una sección inequívoca de permuta en una consulta de reasignación', () => {
    expect(
      isExclusiveExchangeSectionForReassignment(reassignment, section),
    ).toBe(true);
    expect(
      isExclusiveExchangeSectionForReassignment(reassignment, {
        ...section,
        chunkContent: `Página 27 de 45 ${section.chunkContent}`,
      }),
    ).toBe(true);
  });
  it('respeta la negación expresa de permuta, pero conserva una segunda mención ambigua', () => {
    expect(
      isExclusiveExchangeSectionForReassignment(
        'Soy docente, no quiero permuta, solo reasignación familiar',
        section,
      ),
    ).toBe(true);
    expect(
      isExclusiveExchangeSectionForReassignment(
        'No quiero permuta, pero explica también los requisitos de permuta y reasignación',
        section,
      ),
    ).toBe(false);
  });
  it.each([
    '¿Qué diferencia hay entre reasignación y permuta?',
    'Quiero hacer una permuta con otra docente',
    'Soy docente y solicito reasignación, ¿puedo permutar?',
    '¿Qué diferencia hay entre reasignación e intercambio de plazas?',
    'Quiero reasignación o cambiar mi plaza con otra docente',
  ])(
    'conserva la evidencia cuando la consulta incluye permuta: %s',
    (question) => {
      expect(isExclusiveExchangeSectionForReassignment(question, section)).toBe(
        false,
      );
    },
  );
  it.each([
    { ...section, sectionTitle: 'Norma de reasignación y permuta' },
    { ...section, sectionTitle: null },
    {
      ...section,
      chunkContent:
        'La reasignación se regula en otra sección. ' + section.chunkContent,
    },
    {
      ...section,
      chunkContent:
        section.chunkContent + ' DISPOSICIONES ESPECÍFICAS DE LA REASIGNACIÓN.',
    },
    {
      ...section,
      sectionTitle: 'DISPOSICIONES ESPECÍFICAS DE LA PERMUTA Y REASIGNACIÓN',
      chunkContent: 'DISPOSICIONES ESPECÍFICAS DE LA PERMUTA Y REASIGNACIÓN.',
    },
  ])('conserva fuentes mixtas o con estructura ambigua', (candidate) => {
    expect(
      isExclusiveExchangeSectionForReassignment(reassignment, candidate),
    ).toBe(false);
  });
});

/**
 * El título del corpus puede ser solo la identidad de la norma
 * («RSG N.° 326-2017-MINEDU»). Exigir la palabra en el título descartaba
 * fragmentos que tratan el proceso, y el turno terminaba en «sin evidencia»
 * aunque la documentación existiera.
 */
describe('evidencia directa de reasignación', () => {
  const source = (
    chunkContent: string,
    documentTitle = 'RSG N.° 326-2017-MINEDU',
  ): RetrievedChunk => ({
    articleReference: null,
    chunkContent,
    chunkId: 'chunk',
    documentId: 'document',
    documentSituation: 'current',
    documentTitle,
    documentVersionId: 'version',
    issuanceYear: 2017,
    lexicalScore: 0.4,
    moduleIds: ['module'],
    moduleNames: ['Módulo'],
    numeralReference: null,
    pageEnd: 1,
    pageStart: 1,
    sectionTitle: null,
    semanticScore: 0.7,
    versionNumber: 1,
  });

  it('acepta el fragmento que presenta el proceso como trámite', () => {
    expect(
      isDirectReassignmentEvidence(
        'como postular a reasignacion por motivo de unidad familiar',
        source(
          'Solicitud de reasignación: se presenta ante la UGEL de destino con los requisitos señalados.',
        ),
      ),
    ).toBe(true);
    expect(
      isDirectReassignmentEvidence(
        'como postular a reasignacion por motivo de unidad familiar',
        source(
          'Reasignación docente por unidad familiar: el profesor acredita la convivencia.',
        ),
      ),
    ).toBe(true);
  });

  it('sigue rechazando la mención incidental de otro régimen', () => {
    expect(
      isDirectReassignmentEvidence(
        'como postular a reasignacion por motivo de unidad familiar',
        source(
          'La reasignación de los auxiliares de educación se solicita a la UGEL.',
        ),
      ),
    ).toBe(false);
    expect(
      isDirectReassignmentEvidence(
        'como postular a reasignacion por motivo de unidad familiar',
        source('Es causal de cese el desplazamiento por reasignación.'),
      ),
    ).toBe(false);
  });

  it('no evalúa el fragmento si la consulta no es de reasignación', () => {
    expect(
      isDirectReassignmentEvidence(
        'cuanto gana un docente',
        source('Solicitud de reasignación: requisitos.'),
      ),
    ).toBe(false);
  });

  it('rechaza el fragmento que solo trata el régimen de auxiliares', () => {
    // El título es la identidad de la norma: la palabra que decide el régimen
    // está en el cuerpo, no en el título.
    expect(
      isDirectReassignmentEvidence(
        'soy docente nombrado y quiero reasignarme a otra ugel',
        source(
          'Los auxiliares de educación presentan su solicitud de reasignación ante la UGEL de destino.',
        ),
      ),
    ).toBe(false);
    // «Los auxiliares de la UGEL» es una función de oficina: no atribuye el
    // fragmento al régimen de auxiliares de educación.
    expect(
      isDirectReassignmentEvidence(
        'soy docente nombrado y quiero reasignarme a otra ugel',
        source(
          'Los auxiliares de la UGEL recepcionan la solicitud de reasignación y sellan el expediente.',
        ),
      ),
    ).toBe(true);
    // Un fragmento mixto conserva su alcance: no se descarta por nombrar a los
    // auxiliares junto con los docentes.
    expect(
      isDirectReassignmentEvidence(
        'soy docente nombrado y quiero reasignarme a otra ugel',
        source(
          'Requisitos de reasignación para docentes y auxiliares de educación.',
        ),
      ),
    ).toBe(true);
    // Y en el orden inverso, el fragmento se atribuye al régimen auxiliar.
    expect(
      isDirectReassignmentEvidence(
        'soy docente nombrado y quiero reasignarme a otra ugel',
        source(
          'Los auxiliares de educación presentan su solicitud de reasignación en los mismos plazos que los docentes.',
        ),
      ),
    ).toBe(false);
  });
});
