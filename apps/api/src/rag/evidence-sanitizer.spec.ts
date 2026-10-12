import { sanitizeRetrievedEvidence } from './evidence-sanitizer';
import type { RetrievedChunk } from './retrieval.gateway';

const source: RetrievedChunk = {
  articleReference: 'Artículo 3.',
  chunkContent: 'Artículo 3. La publicación corresponde al MINEDU.',
  chunkId: 'chunk-id',
  documentId: 'document-id',
  documentSituation: 'current',
  documentTitle: 'RVM de auxiliares de educación',
  documentVersionId: 'version-id',
  lexicalScore: 0.5,
  moduleIds: ['module-id'],
  moduleNames: ['Auxiliares de educación'],
  numeralReference: null,
  pageEnd: 2,
  pageStart: 2,
  sectionTitle: 'Artículo 3.',
  semanticScore: 0.9,
  versionNumber: 1,
};

describe('sanitizeRetrievedEvidence', () => {
  it('recorta el sector contiguo de El Peruano después de la norma educativa', () => {
    const cleaned = sanitizeRetrievedEvidence({
      ...source,
      chunkContent:
        'Artículo 3. Disponer la publicación en la sede digital del Ministerio de Educación (www.gob.pe/minedu). 2471664-1 ENERGÍA Y MINAS Dan por concluida la designación en INGEMMET.',
    });

    expect(cleaned?.chunkContent).toContain('Ministerio de Educación');
    expect(cleaned?.chunkContent).not.toContain('ENERGÍA Y MINAS');
    expect(cleaned?.chunkContent).not.toContain('INGEMMET');
  });

  it('descarta un fragmento que solo pertenece a Energía y Minas', () => {
    expect(
      sanitizeRetrievedEvidence({
        ...source,
        articleReference: 'artículo 64',
        chunkContent:
          'El Ministerio de Energía y Minas autoriza una concesión eléctrica a favor de una empresa generadora.',
        sectionTitle: 'ENERGÍA Y MINAS',
      }),
    ).toBeNull();
  });

  it('quita el sello de firma y conserva la resolución del MINEDU que sigue', () => {
    const cleaned = sanitizeRetrievedEvidence({
      ...source,
      articleReference: 'artículo 64',
      chunkContent: [
        'Que, el artículo 64 del Ministerio de Energía y Minas regula la Dirección General de Electricidad.',
        'Documento electrónico firmado digitalmente en el marco de la Ley N° 27269.',
        'La integridad del documento y la autoría de las firmas pueden verificarse en https://apps.firmaperu.gob.pe. N° 074-2026-MINEDU Lima, 7 de mayo de 2026 VISTOS, el expediente de reasignación docente.',
      ].join('\n\n'),
      sectionTitle:
        'La integridad del documento y la autoría de las firmas pueden verificarse.',
    });

    expect(cleaned?.chunkContent).toMatch(/^N° 074-2026-MINEDU/u);
    expect(cleaned?.chunkContent).not.toContain('firmaperu');
    expect(cleaned?.articleReference).toBeNull();
    expect(cleaned?.sectionTitle).toContain('N° 074-2026-MINEDU');
  });

  it('conserva contenido educativo legítimo aunque mencione otro sector', () => {
    const cleaned = sanitizeRetrievedEvidence({
      ...source,
      chunkContent:
        'El Ministerio de Energía y Minas y el sector Educación coordinan acciones para las instituciones educativas rurales.',
      sectionTitle: 'Coordinación intersectorial',
    });

    expect(cleaned?.chunkContent).toContain('sector Educación');
  });

  it('reconoce una Dirección Regional de Educación en texto intersectorial', () => {
    const cleaned = sanitizeRetrievedEvidence({
      ...source,
      chunkContent:
        'La Dirección Regional de Educación de Lima y el Ministerio de Energía y Minas suscribieron un convenio de cooperación.',
      sectionTitle: 'Convenio intersectorial',
    });

    expect(cleaned?.chunkContent).toContain(
      'Dirección Regional de Educación de Lima',
    );
  });

  it('quita un sello inicial aunque el contenido útil no repita el código MINEDU', () => {
    const cleaned = sanitizeRetrievedEvidence({
      ...source,
      chunkContent:
        'La integridad del documento y la autoría de las firmas pueden verificarse en el validador. La evaluación del expediente docente considera la formación académica.',
      sectionTitle:
        'La integridad del documento y la autoría de las firmas pueden verificarse.',
    });

    expect(cleaned?.chunkContent).toBe(
      'La evaluación del expediente docente considera la formación académica.',
    );
    expect(cleaned?.sectionTitle).toBe(
      'La evaluación del expediente docente considera la formación académica.',
    );
  });

  it('deja intacta la evidencia educativa ordinaria', () => {
    expect(sanitizeRetrievedEvidence(source)).toEqual(source);
  });
});
