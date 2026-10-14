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
    expect(cleaned?.sectionTitle).toBeNull();
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
    expect(cleaned?.sectionTitle).toBeNull();
  });

  it('elimina el encabezado genérico de El Peruano y conserva las referencias verificables', () => {
    const cleaned = sanitizeRetrievedEvidence({
      ...source,
      articleReference: 'Artículo 3.-',
      chunkContent: [
        'Artículo 3.- Implementación de la nueva remuneración docente.',
        'h) Los profesores encargados perciben una remuneración mensual de S/ 2 666,80.',
      ].join('\n\n'),
      numeralReference: 'Literal h)',
      sectionTitle:
        '7 NORMAS LEGALES Domingo 29 de octubre de 2017 El Peruano / N° 28044, Ley General de Educación, la Ley N° 29944, Ley de Reforma Magisterial.',
    });

    expect(cleaned?.sectionTitle).toBeNull();
    expect(cleaned?.articleReference).toBe('Artículo 3.-');
    expect(cleaned?.numeralReference).toBe('Literal h)');
  });

  it('no presenta una oración de cuerpo como sección tras quitar una cabecera genérica', () => {
    const cleaned = sanitizeRetrievedEvidence({
      ...source,
      articleReference: null,
      chunkContent:
        'Los profesores encargados perciben una remuneración mensual según la jornada adicional autorizada.',
      numeralReference: null,
      sectionTitle: '7 NORMAS LEGALES Domingo 29 de octubre de 2017 El Peruano',
    });

    expect(cleaned?.sectionTitle).toBeNull();
  });

  it('preserva un título normativo preciso aunque mencione El Peruano', () => {
    const cleaned = sanitizeRetrievedEvidence({
      ...source,
      sectionTitle: 'Artículo 3.- Publicación en El Peruano.',
    });

    expect(cleaned?.sectionTitle).toBe(
      'Artículo 3.- Publicación en El Peruano.',
    );
  });

  it('limpia artículo y literal que no se pueden demostrar en el fragmento saneado', () => {
    const cleaned = sanitizeRetrievedEvidence({
      ...source,
      articleReference: 'Artículo 3.-',
      chunkContent:
        'Los profesores encargados perciben una remuneración mensual según su jornada de trabajo.',
      numeralReference: 'Literal h)',
      sectionTitle: 'Remuneraciones docentes',
    });

    expect(cleaned?.articleReference).toBeNull();
    expect(cleaned?.numeralReference).toBeNull();
  });

  it('conserva un numeral compuesto cuando todos sus componentes aparecen en el fragmento', () => {
    const cleaned = sanitizeRetrievedEvidence({
      ...source,
      articleReference: 'Artículo 8.-',
      chunkContent: [
        'Artículo 8.- Requisitos para la evaluación.',
        '2.1. Condiciones de postulación.',
        'Literal a) Haber prestado servicios en el nivel inicial.',
      ].join('\n\n'),
      numeralReference: '2.1 · Literal a)',
      sectionTitle: 'Requisitos para la evaluación',
    });

    expect(cleaned?.articleReference).toBe('Artículo 8.-');
    expect(cleaned?.numeralReference).toBe('2.1 · Literal a)');
  });

  it('deja intacta la evidencia educativa ordinaria', () => {
    expect(sanitizeRetrievedEvidence(source)).toEqual(source);
  });
});
