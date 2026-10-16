import { disambiguateRouteByQuestion } from './rag.service';
import { normalizeDomainQuery } from './query-normalization';
import { sourceLocationRequestIn } from '../chat/intent/source-location';
import type { RetrievedChunk } from './retrieval.gateway';

const contract = { id: 'contract', name: 'Contratación y desplazamientos' };
const auxiliary = { id: 'auxiliary', name: 'Auxiliar de educación' };
function source(root: typeof contract, submoduleName: string): RetrievedChunk {
  return {
    articleReference: null,
    numeralReference: null,
    sectionTitle: null,
    chunkId: submoduleName,
    chunkContent: 'Contenido documental pertinente.',
    documentId: submoduleName,
    documentVersionId: submoduleName,
    documentSituation: 'current',
    documentTitle: 'Norma técnica',
    versionNumber: 1,
    lexicalScore: 0.5,
    semanticScore: 0.7,
    pageStart: 1,
    pageEnd: 1,
    moduleIds: [root.id],
    moduleNames: [root.name],
    moduleAssociations: [
      {
        rootModuleId: root.id,
        rootModuleName: root.name,
        submoduleId: submoduleName,
        submoduleName,
      },
    ],
  };
}
const sources = [
  source(contract, 'Reasignación y permuta'),
  source(auxiliary, 'Contratación de auxiliares'),
];

describe('OBS-005/014/015 — regresiones de proceso explícito', () => {
  it('una tabla de contenido documental no es un pedido de abrir archivos', () => {
    expect(
      sourceLocationRequestIn(
        'Muéstrame en una tabla los incrementos de remuneración de los profesores que figuran en los documentos, ordenados del más reciente al más antiguo.',
      ),
    ).toBeNull();
    expect(
      sourceLocationRequestIn('Dame el enlace a la tabla del documento.'),
    ).toEqual({ asksMinute: false });
    for (const question of [
      'Abre el documento de remuneraciones con la tabla.',
      'Muéstrame el documento que contiene la tabla de remuneraciones',
      'Abre el documento con una tabla de remuneraciones.',
      'Muéstrame el documento que contiene una tabla de remuneraciones.',
    ])
      expect(sourceLocationRequestIn(question)).toEqual({ asksMinute: false });
  });
  it('reconoce el proceso de un submódulo aunque la raíz tenga otro nombre', () => {
    expect(
      disambiguateRouteByQuestion(
        '¿Qué requisitos se exigen para la reasignación docente por salud?',
        [contract, auxiliary],
        sources,
      ),
    ).toEqual(contract);
  });
  it('contratación de auxiliares no empata con contratación docente por la palabra compartida', () => {
    expect(
      disambiguateRouteByQuestion(
        '¿Quién aprueba la norma del proceso de contratación de auxiliares de educación 2026?',
        [contract, auxiliary],
        sources,
      ),
    ).toEqual(auxiliary);
  });
  it('una pregunta sin tema no adquiere tema por los nombres disponibles', () => {
    expect(
      disambiguateRouteByQuestion(
        '¿Qué requisitos necesitan los docentes?',
        [contract, auxiliary],
        sources,
      ),
    ).toBeNull();
  });
  it.each(['contratación', 'contrato'])(
    'preserva el proceso explícito de %s docente ante submódulos vecinos',
    (term) => {
      expect(
        disambiguateRouteByQuestion(
          `¿Cuáles son las etapas de la ${term} docente 2026?`,
          [contract, auxiliary],
          [
            source(contract, 'Contratación docente'),
            source(auxiliary, 'Contratación de auxiliares'),
          ],
        ),
      ).toEqual(contract);
    },
  );
  it('una comparación explícita entre procesos conserva la ambigüedad', () => {
    expect(
      disambiguateRouteByQuestion(
        'Compara contratación docente versus contratación de auxiliares',
        [contract, auxiliary],
        sources,
      ),
    ).toBeNull();
    expect(
      disambiguateRouteByQuestion(
        'Compara requisitos de reasignación y auxiliar de educación',
        [contract, auxiliary],
        sources,
      ),
    ).toBeNull();
  });
  it('normaliza solo la falta concreta demostrada por la campaña', () => {
    const original =
      'Ola, kiero saver los rekisitos para reasingnacion docente';
    expect(normalizeDomainQuery(original)).toBe(
      'Ola, kiero saver los requisitos para reasignación docente',
    );
    expect(original).toBe(
      'Ola, kiero saver los rekisitos para reasingnacion docente',
    );
    expect(normalizeDomainQuery('la resignación no es una reasignación')).toBe(
      'la resignación no es una reasignación',
    );
  });
});
