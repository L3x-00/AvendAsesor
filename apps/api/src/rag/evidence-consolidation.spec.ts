import {
  consolidateDocumentEvidence,
  isMateriallyDistinct,
} from './evidence-consolidation';
import type { RetrievedChunk } from './retrieval.gateway';

function chunk(overrides: Partial<RetrievedChunk> = {}): RetrievedChunk {
  return {
    articleReference: null,
    chunkContent: 'Contenido del fragmento.',
    chunkId: 'chunk-1',
    documentId: 'document-1',
    documentSituation: 'current',
    documentTitle: 'Norma interna',
    documentVersionId: 'version-1',
    issuanceYear: 2025,
    lexicalScore: 0.4,
    moduleIds: ['module-a'],
    moduleNames: ['Módulo A'],
    numeralReference: null,
    pageEnd: 1,
    pageStart: 1,
    sectionTitle: null,
    semanticScore: 0.8,
    versionNumber: 1,
    ...overrides,
  };
}

describe('consolidateDocumentEvidence', () => {
  // OBS-009 y OBS-017: cinco fragmentos del mismo archivo no deben ocupar
  // cinco referencias visibles.
  it('devuelve una sola referencia por documento aunque lleguen varios fragmentos contiguos', () => {
    const consolidated = consolidateDocumentEvidence([
      chunk({ chunkId: 'c-1', pageStart: 2, pageEnd: 2, semanticScore: 0.8 }),
      chunk({ chunkId: 'c-2', pageStart: 3, pageEnd: 3, semanticScore: 0.7 }),
      chunk({ chunkId: 'c-3', pageStart: 4, pageEnd: 4, semanticScore: 0.6 }),
      chunk({ chunkId: 'c-4', pageStart: 5, pageEnd: 5, semanticScore: 0.5 }),
      chunk({ chunkId: 'c-5', pageStart: 6, pageEnd: 6, semanticScore: 0.4 }),
    ]);

    expect(consolidated).toHaveLength(1);
    expect(consolidated[0]?.chunkId).toBe('c-1');
    // La referencia conservada es un fragmento real: su rango sigue siendo verificable.
    expect(consolidated[0]?.pageStart).toBe(2);
    expect(consolidated[0]?.pageEnd).toBe(2);
  });

  // OBS-015: no se puede ocultar una excepción o una cifra distinta solo
  // porque comparte documento.
  it('conserva una segunda ubicación del mismo documento cuando aporta algo material', () => {
    const consolidated = consolidateDocumentEvidence([
      chunk({
        chunkId: 'c-1',
        pageStart: 2,
        pageEnd: 2,
        chunkContent: 'La remuneración mensual es de S/ 3 300,60.',
        semanticScore: 0.8,
      }),
      chunk({
        chunkId: 'c-2',
        pageStart: 9,
        pageEnd: 9,
        chunkContent:
          'Salvo en el supuesto de jornada reducida, la remuneración equivale a S/ 2 000,10.',
        semanticScore: 0.7,
      }),
    ]);

    expect(consolidated.map((source) => source.chunkId)).toEqual([
      'c-1',
      'c-2',
    ]);
  });

  it('no conserva un fragmento que no aporta nada materialmente distinto', () => {
    expect(
      isMateriallyDistinct(
        chunk({ chunkContent: 'La remuneración mensual es de S/ 3 300,60.' }),
        chunk({ chunkContent: 'Se abona la remuneración mensual indicada.' }),
      ),
    ).toBe(false);
  });

  it('no abre otra referencia para un tramo separado sin contenido material', () => {
    const consolidated = consolidateDocumentEvidence([
      chunk({
        chunkId: 'c-1',
        chunkContent: 'Disposiciones generales del reglamento.',
        pageEnd: 2,
        pageStart: 2,
      }),
      chunk({
        chunkId: 'c-2',
        chunkContent: 'Anexo con el formato de solicitud.',
        pageEnd: 18,
        pageStart: 18,
      }),
    ]);

    expect(consolidated.map((source) => source.chunkId)).toEqual(['c-1']);
  });

  // Hallazgo del cross-review: un tramo lejano que no aporta nada no puede
  // ocupar la segunda plaza y dejar fuera una condición del tramo consultado.
  it('no deja que un tramo lejano trivial desplace a un fragmento material', () => {
    const consolidated = consolidateDocumentEvidence([
      chunk({
        chunkId: 'c-general',
        chunkContent: 'La remuneración mensual es de S/ 3 300,60.',
        pageEnd: 1,
        pageStart: 1,
        semanticScore: 0.97,
      }),
      chunk({
        chunkId: 'c-footer',
        chunkContent: 'Anexo con el formato de solicitud.',
        pageEnd: 90,
        pageStart: 90,
        semanticScore: 0.95,
      }),
      chunk({
        chunkId: 'c-requisito',
        chunkContent:
          'Solo el personal nombrado percibe la remuneración indicada.',
        pageEnd: 2,
        pageStart: 2,
        semanticScore: 0.85,
      }),
    ]);

    // El tramo lejano no aporta nada material: la segunda referencia debe ser el
    // fragmento con la exclusión, no el anexo mejor puntuado.
    expect(consolidated.map((source) => source.chunkId)).toEqual([
      'c-general',
      'c-requisito',
    ]);
  });

  // Hallazgo del cross-review: cuando el mejor puntaje es un pie de firma sin
  // contenido propio y hay dos fragmentos materiales, el ruido cede la plaza.
  it('da la referencia principal al fragmento con contenido si el mejor puntaje es ruido', () => {
    const consolidated = consolidateDocumentEvidence([
      chunk({
        chunkId: 'c-pie',
        chunkContent:
          'Documento electrónico firmado digitalmente. Verifique su autenticidad.',
        pageEnd: 90,
        pageStart: 90,
        semanticScore: 0.97,
      }),
      chunk({
        chunkId: 'c-general',
        chunkContent: 'La remuneración mensual es de S/ 3 300,60.',
        pageEnd: 1,
        pageStart: 1,
        semanticScore: 0.9,
      }),
      chunk({
        chunkId: 'c-requisito',
        chunkContent:
          'Solo el personal nombrado percibe la remuneración indicada.',
        pageEnd: 2,
        pageStart: 2,
        semanticScore: 0.85,
      }),
    ]);

    expect(consolidated.map((source) => source.chunkId)).toEqual([
      'c-general',
      'c-requisito',
    ]);
  });

  it('no usa un pie de firma como referencia principal aunque tenga mejor puntaje', () => {
    const consolidated = consolidateDocumentEvidence([
      chunk({
        chunkId: 'c-pie',
        chunkContent:
          'Documento electrónico firmado digitalmente. Verifique su autenticidad.',
        pageEnd: 90,
        pageStart: 90,
        semanticScore: 0.97,
      }),
      chunk({
        chunkId: 'c-general',
        chunkContent: 'La remuneración mensual es de S/ 3 300,60.',
        pageEnd: 1,
        pageStart: 1,
        semanticScore: 0.9,
      }),
    ]);

    expect(consolidated.map((source) => source.chunkId)).toEqual(['c-general']);
  });

  // Hallazgo del cross-review: una referencia de página no es contenido. Un pie
  // con «Página 90 de 120» no conserva la plaza principal ni ocupa la segunda
  // como si aportara una cifra propia.
  it('no trata una referencia de página como contenido propio', () => {
    const consolidated = consolidateDocumentEvidence([
      chunk({
        chunkId: 'c-pie-pagina',
        chunkContent:
          'Página 90 de 120\nDocumento electrónico firmado digitalmente.',
        pageEnd: 90,
        pageStart: 90,
        semanticScore: 0.97,
      }),
      chunk({
        chunkId: 'c-general',
        chunkContent: 'La remuneración mensual es de S/ 3 300,60.',
        pageEnd: 1,
        pageStart: 1,
        semanticScore: 0.9,
      }),
      chunk({
        chunkId: 'c-requisito',
        chunkContent:
          'Solo el personal nombrado percibe la remuneración indicada.',
        pageEnd: 2,
        pageStart: 2,
        semanticScore: 0.85,
      }),
    ]);

    expect(consolidated.map((source) => source.chunkId)).toEqual([
      'c-general',
      'c-requisito',
    ]);
  });

  // Hallazgo del cross-review: el porcentaje es una cifra material y el patrón
  // debe reconocerlo con y sin espacio («30 %», «30%»).
  it('conserva un porcentaje material del mismo tramo de páginas', () => {
    const consolidated = consolidateDocumentEvidence([
      chunk({
        chunkId: 'c-remuneracion',
        chunkContent: 'La remuneración mensual es de S/ 3 300,60.',
        pageEnd: 2,
        pageStart: 2,
        semanticScore: 0.95,
      }),
      chunk({
        chunkId: 'c-descuento',
        chunkContent: 'El descuento por tardanza equivale al 30 % del total.',
        pageEnd: 3,
        pageStart: 2,
        semanticScore: 0.9,
      }),
    ]);

    expect(consolidated.map((source) => source.chunkId)).toEqual([
      'c-remuneracion',
      'c-descuento',
    ]);
    expect(
      isMateriallyDistinct(
        chunk({ chunkContent: 'La remuneración mensual es de S/ 3 300,60.' }),
        chunk({ chunkContent: 'Se descuenta el 30% de la remuneración.' }),
      ),
    ).toBe(true);
  });

  // Hallazgo del cross-review: el año de un código de norma y el numeral de un
  // artículo no son contenido propio.
  it('no trata un código de norma ni un numeral como contenido propio', () => {
    const consolidated = consolidateDocumentEvidence([
      chunk({
        chunkId: 'c-pie-codigo',
        chunkContent:
          'D.S. N.° 049-2025-EF\nPágina 90 de 120\nDocumento electrónico firmado digitalmente.',
        pageEnd: 90,
        pageStart: 90,
        semanticScore: 0.97,
      }),
      chunk({
        chunkId: 'c-general',
        chunkContent: 'La remuneración mensual es de S/ 3 300,60.',
        pageEnd: 1,
        pageStart: 1,
        semanticScore: 0.9,
      }),
      chunk({
        chunkId: 'c-condicion',
        chunkContent:
          'Solo el personal nombrado percibe la remuneración indicada.',
        pageEnd: 2,
        pageStart: 2,
        semanticScore: 0.85,
      }),
    ]);

    expect(consolidated.map((source) => source.chunkId)).toEqual([
      'c-general',
      'c-condicion',
    ]);
    expect(
      isMateriallyDistinct(
        chunk({ chunkContent: 'La remuneración mensual es de S/ 3 300,60.' }),
        chunk({ chunkContent: 'Artículo 5.1 Condiciones de la jornada.' }),
      ),
    ).toBe(false);
  });

  it('detecta como material una negación o una restricción', () => {
    const primary = chunk({
      chunkContent: 'La remuneración mensual es de S/ 3 300,60.',
    });

    expect(
      isMateriallyDistinct(
        primary,
        chunk({ chunkContent: 'Tampoco se percibe durante el mes de enero.' }),
      ),
    ).toBe(true);
    expect(
      isMateriallyDistinct(
        primary,
        chunk({
          chunkContent: 'Sin perjuicio de lo indicado, se abona en marzo.',
        }),
      ),
    ).toBe(true);
    expect(
      isMateriallyDistinct(
        primary,
        chunk({ chunkContent: 'La asignación se otorga a partir de marzo.' }),
      ),
    ).toBe(true);
  });

  it('trata una cadena de fragmentos vecinos como una sola ubicación', () => {
    const consolidated = consolidateDocumentEvidence(
      [2, 3, 4, 5].map((page, index) =>
        chunk({
          chunkContent:
            [
              'Primer tramo del reglamento.',
              'Segundo tramo del reglamento.',
              'Tercer tramo del reglamento.',
              'Cuarto tramo del reglamento.',
            ][index] ?? '',
          chunkId: `c-${index + 1}`,
          pageEnd: page,
          pageStart: page,
          semanticScore: 0.8 - index / 10,
        }),
      ),
    );

    expect(consolidated).toHaveLength(1);
    expect(consolidated[0]?.chunkId).toBe('c-1');
  });

  it('conserva toda condición material aunque el documento aporte más de dos fragmentos', () => {
    const consolidated = consolidateDocumentEvidence([
      chunk({
        chunkId: 'c-1',
        chunkContent: 'Remuneración mensual S/ 3 300,60.',
      }),
      chunk({
        chunkId: 'c-2',
        pageStart: 4,
        chunkContent: 'Salvo excepción, el monto es S/ 2 000,10.',
      }),
      chunk({
        chunkId: 'c-3',
        pageStart: 7,
        chunkContent: 'Requisito adicional: contar con S/ 500,00 de descuento.',
      }),
    ]);

    expect(consolidated).toHaveLength(3);
    expect(consolidated.map((source) => source.chunkId)).toEqual([
      'c-1',
      'c-2',
      'c-3',
    ]);
  });

  it('conserva condiciones distintas aunque usen la misma marca normativa', () => {
    const consolidated = consolidateDocumentEvidence([
      chunk({
        chunkId: 'nombrado',
        chunkContent:
          'Solo el personal nombrado percibe la remuneración indicada.',
      }),
      chunk({
        chunkId: 'contratado',
        chunkContent:
          'Solo el personal contratado percibe la asignación correspondiente.',
        pageStart: 4,
      }),
    ]);

    expect(consolidated.map((source) => source.chunkId)).toEqual([
      'nombrado',
      'contratado',
    ]);
  });

  it('mantiene documentos distintos como referencias distintas', () => {
    const consolidated = consolidateDocumentEvidence([
      chunk({ chunkId: 'c-1', documentVersionId: 'version-1' }),
      chunk({
        chunkId: 'c-2',
        documentId: 'document-2',
        documentVersionId: 'version-2',
      }),
    ]);

    expect(consolidated.map((source) => source.chunkId)).toEqual([
      'c-1',
      'c-2',
    ]);
  });

  it('conserva la identidad real de cada referencia para que la cita [n] siga apuntando bien', () => {
    const consolidated = consolidateDocumentEvidence([
      chunk({
        articleReference: 'Artículo 4.',
        chunkId: 'c-1',
        chunkContent: 'El plazo es de cinco días hábiles.',
      }),
      chunk({
        articleReference: 'Artículo 9.',
        chunkId: 'c-2',
        chunkContent: 'Salvo caso fortuito, el plazo se amplía.',
        pageStart: 5,
        pageEnd: 5,
      }),
    ]);

    expect(consolidated).toEqual([
      expect.objectContaining({
        articleReference: 'Artículo 4.',
        chunkId: 'c-1',
        documentVersionId: 'version-1',
      }),
      expect.objectContaining({
        articleReference: 'Artículo 9.',
        chunkId: 'c-2',
        documentVersionId: 'version-1',
      }),
    ]);
  });
});
