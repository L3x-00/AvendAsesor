import {
  ARCHIVE_REASON_CODES,
  DOCUMENT_TYPE_CODES,
  ISSUING_ENTITY_CODES,
} from './document-governance.constants';

/**
 * Lista canónica compartida por la restricción gobernada de la base
 * (`documents_governed_type_check`, probada en
 * `supabase/tests/database/module_document_governance_test.sql`), el panel
 * (`DOCUMENT_TYPE_OPTIONS`) y la API. Si una capa agrega o quita un tipo sin
 * actualizar las demás, esta prueba falla a propósito (ADR-0025).
 */
const CANONICAL_DOCUMENT_TYPE_CODES = [
  'RESOLUCION_MINISTERIAL',
  'RESOLUCION_VICEMINISTERIAL',
  'RESOLUCION_DIRECTORAL',
  'RESOLUCION_SECRETARIA_GENERAL',
  'DECRETO_SUPREMO',
  'DECRETO_LEGISLATIVO',
  'LEY',
  'REGLAMENTO',
  'DIRECTIVA',
  'NORMA_TECNICA',
  'OFICIO',
  'MEMORANDUM',
  'COMUNICADO',
  'CRONOGRAMA',
  'ANEXO',
  'PREGUNTAS_FRECUENTES',
  'INFORME',
  'INFOGRAFIA',
  'OTRO',
];

describe('document governance catalogs', () => {
  it('keeps the governed document types aligned with the database constraint', () => {
    expect(DOCUMENT_TYPE_CODES).toEqual(CANONICAL_DOCUMENT_TYPE_CODES);
  });

  it('offers a dedicated code for the Secretaría General resolutions', () => {
    expect(DOCUMENT_TYPE_CODES).toContain('RESOLUCION_SECRETARIA_GENERAL');
  });

  it('keeps the issuing entities and archive reasons unchanged', () => {
    expect(ISSUING_ENTITY_CODES).toContain('MINEDU');
    expect(ISSUING_ENTITY_CODES).toContain('OTRA_INSTITUCION');
    expect(ARCHIVE_REASON_CODES).toContain('REPLACED_BY_NEWER');
  });
});
