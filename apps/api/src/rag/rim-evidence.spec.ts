import fixture from './fixtures/rim-277-2025.json';
import { firstScaleRimEvidence } from './rim-evidence';
import type { RetrievedChunk } from './retrieval.gateway';
import { buildExtractiveSalaryAnswer } from './salary-extractive-answer';

const question =
  'soy profesor nombrado de primera escala con 30 horas, cuanto me toca ganar ahora';
const complete =
  'Artículo 1.- Monto de la Remuneración Íntegra Mensual de la Primera Escala Magisterial. La RIM por hora de trabajo semanal-mensual es S/ 116,69.';
function source(
  text: string,
  overrides: Partial<RetrievedChunk> = {},
): RetrievedChunk {
  return {
    articleReference: null,
    chunkContent: text,
    chunkId: 'a',
    documentId: fixture.documentId,
    documentVersionId: fixture.documentVersionId,
    documentTitle: fixture.documentTitle,
    documentSituation: 'current',
    issuanceYear: 2025,
    lexicalScore: 0.8,
    semanticScore: 0.9,
    moduleIds: ['m'],
    moduleNames: ['Remuneraciones'],
    numeralReference: null,
    sectionTitle: null,
    pageStart: 1,
    pageEnd: 1,
    versionNumber: 2,
    ...overrides,
  };
}
const real = fixture.chunks.map((chunk) =>
  source(chunk.chunk_content, {
    chunkId: chunk.id,
    chunkIndex: chunk.chunk_index,
    pageStart: chunk.page_start,
    pageEnd: chunk.page_end,
  }),
);

describe('RIM evidence association', () => {
  it('preserves a complete hourly provision and the exact arithmetic', () => {
    const answer = buildExtractiveSalaryAnswer(
      [source(complete)],
      question,
      'current',
    );
    expect(answer?.answer).toContain('S/ 3 500,70');
    expect(answer?.hasVerifiedAmount).toBe(true);
  });
  it('reconstructs the captured DS277 provision by stored order and open syntax, citing both real chunks', () => {
    const answer = buildExtractiveSalaryAnswer(
      [...real].reverse(),
      question,
      'current',
    );
    expect(answer?.answer).toContain('S/ 3 500,70');
    expect(answer?.sources.map((item) => item.chunkId)).toEqual([
      fixture.chunks[1].id,
      fixture.chunks[2].id,
    ]);
  });
  it('rejects E05 instead of multiplying an unrelated allocation', () => {
    const sources = [
      source(
        'Artículo 1.- Se fija la Remuneración Íntegra Mensual (RIM) por hora de trabajo semanal-mensual de la primera escala magisterial de la Carrera Pública Magisterial de la Ley N.° 29944.',
        { chunkIndex: 2 },
      ),
      source(
        'La asignación excepcional de traslado se fija en la suma de S/ 900,00. Artículo 2.- Otras disposiciones.',
        { chunkId: 'b', chunkIndex: 3, pageStart: 2, pageEnd: 2 },
      ),
    ];
    expect(
      buildExtractiveSalaryAnswer(sources, question, 'current'),
    ).toBeNull();
  });
  it.each([
    complete.replace('La RIM', 'La asignación adicional de la RIM'),
    complete.replace('es S/', 'de la quinta escala es S/'),
    complete.replace('es S/', 'del profesor contratado es S/'),
    complete.replace('es S/', 'del auxiliar es S/'),
    complete.replace('La RIM', 'No se fija la RIM'),
    complete.replace('La RIM', 'Se deja sin efecto la RIM'),
    complete.replace('es S/', 'para el año 2023 es S/'),
    complete.replace('es S/', 'a partir de diciembre de 2027 es S/'),
    `CONSIDERANDO: Que mediante otro decreto se estableció: ${complete}`,
    complete.replace('La RIM', 'La RIM no aplicable'),
    complete.replace('es S/', 'de la 5.ª escala magisterial es S/'),
    complete.replace('es S/', 'del ejercicio 2023 es S/'),
    complete.replace('es S/', 'del personal administrativo es S/'),
    complete.replace('es S/', 'es la base de una ayuda que es S/'),
    complete.replace('116,69.', '116,69 (solo para personal administrativo).'),
    complete.replace('116,69.', '116,69 (NOVECIENTOS Y 00/100 SOLES).'),
  ])('rejects conflicting concept, subject, polarity or period: %s', (text) => {
    expect(firstScaleRimEvidence([source(text)])).toBeNull();
  });
  it('does not supply first scale from metadata for a different concept in the text', () => {
    expect(
      firstScaleRimEvidence([
        source(
          'La RIM por hora es una referencia. La asignación excepcional es S/ 900,00.',
          { sectionTitle: 'Primera Escala Magisterial' },
        ),
      ]),
    ).toBeNull();
  });
  it.each(['missing-index', 'gap', 'other-version'])(
    'rejects an unproved continuation (%s)',
    (change) => {
      const [article, amount] = real.slice(1);
      const invalid = {
        ...amount,
        chunkIndex:
          change === 'missing-index'
            ? undefined
            : change === 'gap'
              ? 5
              : amount.chunkIndex,
        documentVersionId:
          change === 'other-version' ? 'other' : amount.documentVersionId,
      };
      expect(firstScaleRimEvidence([article, invalid])).toBeNull();
    },
  );
  it('does not rescue an older complete rule when the newest is incomplete', () => {
    expect(
      firstScaleRimEvidence([
        source(complete, { issuanceYear: 2023, documentVersionId: 'old' }),
        ...real.slice(0, 2),
      ]),
    ).toBeNull();
  });
  it('does not pick the first of conflicting supported hourly amounts', () => {
    expect(
      firstScaleRimEvidence([
        source(complete),
        source(complete.replace('116,69', '120,00'), { chunkId: 'b' }),
      ]),
    ).toBeNull();
  });
  it('does not reject a current provision because a later article derogates a different norm', () => {
    expect(
      firstScaleRimEvidence([
        source(`${complete} Artículo 2.- Derogar el decreto anterior.`),
      ])?.amount,
    ).toBe('116.69');
  });
});
