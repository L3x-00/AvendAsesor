export const DOCUMENT_TYPE_CODES = [
  'RESOLUCION_MINISTERIAL',
  'RESOLUCION_VICEMINISTERIAL',
  'RESOLUCION_DIRECTORAL',
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
  'INFORME',
  'INFOGRAFIA',
  'OTRO',
] as const;

export const ISSUING_ENTITY_CODES = [
  'MINEDU',
  'MTPE',
  'UGEL',
  'DRE_GRE',
  'SERVIR',
  'SUNAFIL',
  'MEF',
  'PCM',
  'CONGRESO_REPUBLICA',
  'TRIBUNAL_CONSTITUCIONAL',
  'DEFENSORIA_PUEBLO',
  'GOBIERNO_REGIONAL',
  'OTRA_INSTITUCION',
] as const;

export const ARCHIVE_REASON_CODES = [
  'NOT_APPLICABLE',
  'DEROGATED_OR_EXPIRED',
  'DUPLICATE',
  'UPLOADED_BY_ERROR',
  'INCOMPLETE_INFORMATION',
  'PENDING_VALIDATION',
  'HISTORICAL_ANTECEDENT',
  'REPLACED_BY_NEWER',
  'OTHER',
] as const;

export type DocumentTypeCode = (typeof DOCUMENT_TYPE_CODES)[number];
export type IssuingEntityCode = (typeof ISSUING_ENTITY_CODES)[number];
export type ArchiveReasonCode = (typeof ARCHIVE_REASON_CODES)[number];
export type DocumentApprovalStatus = 'pending_approval' | 'ready';

export const currentDocumentYear = (): number => new Date().getUTCFullYear();
