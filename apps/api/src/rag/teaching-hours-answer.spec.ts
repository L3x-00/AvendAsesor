import { buildTeachingHoursDecisionAnswer } from './teaching-hours-answer';
import type { RetrievedChunk } from './retrieval.gateway';

const source = {
  articleReference: null,
  chunkContent:
    'La propuesta de cuadro de distribución de horas recae directamente en el director de la IE. Aprueba las propuestas del cuadro de distribución de horas pedagógicas de las IIEE a través de acto resolutivo, debidamente firmado por el director de la UGEL o DRE.',
  chunkId: 'chunk-cuadro-horas',
  documentId: 'document-cuadro-horas',
  documentSituation: 'current' as const,
  documentTitle:
    'Norma técnica de cuadros de distribución de horas pedagógicas',
  documentVersionId: 'version-cuadro-horas',
  lexicalScore: 0.5,
  moduleIds: ['module-a'],
  moduleNames: ['Cargos y plazas'],
  numeralReference: '5.1',
  pageEnd: 12,
  pageStart: 12,
  sectionTitle: '5.1 Disposiciones generales',
  semanticScore: 0.9,
  versionNumber: 1,
} as RetrievedChunk;

describe('buildTeachingHoursDecisionAnswer', () => {
  it('responde desde el fragmento verificado quién decide las horas', () => {
    const result = buildTeachingHoursDecisionAnswer(
      'Soy profesor de secundaria y quiero saber quién decide cuántas horas me tocan.',
      [source],
    );
    expect(result).not.toBeNull();
    expect(result?.answer).toContain('director de la institución educativa');
    expect(result?.answer).toContain('UGEL o a la DRE');
    expect(result?.answer).toContain('[1]');
    expect(result?.sources).toEqual([source]);
  });

  it('no responde si la pregunta no pide quién decide las horas', () => {
    expect(
      buildTeachingHoursDecisionAnswer('¿Cuánto gana un docente?', [source]),
    ).toBeNull();
  });

  it('no responde si el fragmento niega la regla', () => {
    expect(
      buildTeachingHoursDecisionAnswer(
        '¿Quién decide cuántas horas me tocan?',
        [
          {
            ...source,
            chunkContent: source.chunkContent.replace(
              'recae directamente',
              'no recae directamente',
            ),
          },
        ],
      ),
    ).toBeNull();
  });

  it('no responde si el fragmento no contiene la aprobación verificable', () => {
    expect(
      buildTeachingHoursDecisionAnswer(
        '¿Quién decide cuántas horas me tocan?',
        [
          {
            ...source,
            chunkContent: 'El cuadro de distribución de horas se usa en la IE.',
          },
        ],
      ),
    ).toBeNull();
  });
});
