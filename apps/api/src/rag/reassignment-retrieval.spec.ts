import { isExclusiveExchangeSectionForReassignment } from './reassignment-retrieval';

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
