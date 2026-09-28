const DOCUMENT_TYPE_PROMPT_LABELS: Record<string, string> = {
  ANEXO: 'Anexo',
  COMUNICADO: 'Comunicado',
  CRONOGRAMA: 'Cronograma',
  DECRETO_LEGISLATIVO: 'Decreto Legislativo (DL)',
  DECRETO_SUPREMO: 'Decreto Supremo (DS)',
  DIRECTIVA: 'Directiva',
  INFOGRAFIA: 'Infografía',
  INFORME: 'Informe',
  LEY: 'Ley',
  MEMORANDUM: 'Memorándum (M)',
  NORMA_TECNICA: 'Norma Técnica',
  OFICIO: 'Oficio',
  OTRO: 'Otro',
  PREGUNTAS_FRECUENTES: 'Preguntas frecuentes',
  REGLAMENTO: 'Reglamento',
  RESOLUCION_DIRECTORAL: 'Resolución Directoral (RD)',
  RESOLUCION_MINISTERIAL: 'Resolución Ministerial (RM)',
  RESOLUCION_VICEMINISTERIAL: 'Resolución Viceministerial (RVM)',
};

/** Etiqueta legible con abreviatura para el prompt (RM, RD, DS, M…). */
export function documentTypePromptLabel(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  return DOCUMENT_TYPE_PROMPT_LABELS[value] ?? value;
}
