import {
  asksForDocumentStatus,
  noIdentifiedChangesMessage,
} from './document-status';

const source = {
  articleReference: null,
  chunkContent: 'La licencia se solicita ante la entidad competente.',
  chunkId: 'chunk-id',
  documentId: 'document-id',
  documentSituation: 'current' as const,
  documentTitle: 'Norma docente',
  documentVersionId: 'version-id',
  lexicalScore: 0.1,
  moduleIds: ['module-id'],
  moduleNames: ['Módulo'],
  numeralReference: null,
  pageEnd: 1,
  pageStart: 1,
  sectionTitle: null,
  semanticScore: 0.9,
  versionNumber: 1,
};

describe('política determinista de vigencia documental', () => {
  it.each([
    '¿La norma sigue vigente?',
    '¿Cuál es la vigencia de la norma?',
    '¿Hay cambios en la reasignación docente?',
  ])('reconoce %s como consulta de estado documental', (question) => {
    expect(asksForDocumentStatus(question)).toBe(true);
  });

  it('no confunde la vigencia de un cronograma con la de una norma', () => {
    expect(asksForDocumentStatus('¿Cuál es la vigencia del cronograma?')).toBe(
      false,
    );
  });

  it('responde de forma conservadora cuando no hay un cambio expreso', () => {
    expect(
      noIdentifiedChangesMessage('¿La norma sigue vigente?', [source]),
    ).toBe(
      'Sin cambios identificados en las fuentes disponibles. [1]\n\nEsto no equivale a una vigencia confirmada: las fuentes recuperadas no muestran una modificación o un reemplazo expreso para este punto. El sistema no puede determinar si existe una publicación posterior que no haya sido incorporada al corpus ni consultada desde una fuente oficial actualizada.',
    );
  });

  it('deja que la evidencia explícita de modificación se explique con sus fuentes', () => {
    expect(
      noIdentifiedChangesMessage('¿Qué cambios tiene la norma?', [
        { ...source, chunkContent: 'La resolución modifica el artículo 5.' },
      ]),
    ).toBeNull();
  });
});
