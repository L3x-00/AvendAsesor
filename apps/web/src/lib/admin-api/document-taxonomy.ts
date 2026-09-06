export const DOCUMENT_TYPE_OPTIONS = [
  { label: "Resolución Ministerial", value: "RESOLUCION_MINISTERIAL" },
  { label: "Resolución Viceministerial", value: "RESOLUCION_VICEMINISTERIAL" },
  { label: "Resolución Directoral", value: "RESOLUCION_DIRECTORAL" },
  { label: "Decreto Supremo", value: "DECRETO_SUPREMO" },
  { label: "Decreto Legislativo", value: "DECRETO_LEGISLATIVO" },
  { label: "Ley", value: "LEY" },
  { label: "Reglamento", value: "REGLAMENTO" },
  { label: "Directiva", value: "DIRECTIVA" },
  { label: "Norma Técnica", value: "NORMA_TECNICA" },
  { label: "Oficio", value: "OFICIO" },
  { label: "Memorándum", value: "MEMORANDUM" },
  { label: "Comunicado", value: "COMUNICADO" },
  { label: "Cronograma", value: "CRONOGRAMA" },
  { label: "Anexo", value: "ANEXO" },
  { label: "Informe", value: "INFORME" },
  { label: "Infografía", value: "INFOGRAFIA" },
  { label: "Otro", value: "OTRO" },
] as const;

export const ISSUING_ENTITY_OPTIONS = [
  { label: "MINEDU", value: "MINEDU" },
  { label: "MTPE", value: "MTPE" },
  { label: "UGEL", value: "UGEL" },
  { label: "DRE/GRE", value: "DRE_GRE" },
  { label: "SERVIR", value: "SERVIR" },
  { label: "SUNAFIL", value: "SUNAFIL" },
  { label: "MEF", value: "MEF" },
  { label: "PCM", value: "PCM" },
  { label: "Congreso de la República", value: "CONGRESO_REPUBLICA" },
  { label: "Tribunal Constitucional", value: "TRIBUNAL_CONSTITUCIONAL" },
  { label: "Defensoría del Pueblo", value: "DEFENSORIA_PUEBLO" },
  { label: "Gobierno Regional", value: "GOBIERNO_REGIONAL" },
  { label: "Otra institución", value: "OTRA_INSTITUCION" },
] as const;

export const MINEDU_DEPENDENCIES = [
  "Viceministerio de Gestión Pedagógica",
  "Viceministerio de Gestión Institucional",
  "DIGEDD",
  "Secretaría General",
] as const;

export const UGEL_DEPENDENCIES = Array.from(
  { length: 20 },
  (_, index) => `UGEL ${String(index + 1).padStart(2, "0")}`,
);

export const DOCUMENT_SITUATION_OPTIONS = [
  { label: "Vigente", value: "current" },
  { label: "Reemplazado / Sin vigencia", value: "replaced" },
  { label: "Archivado", value: "archived" },
] as const;

export const ARCHIVE_REASON_OPTIONS = [
  { label: "Documento ya no aplicable al proceso", value: "NOT_APPLICABLE" },
  { label: "Documento derogado o sin vigencia", value: "DEROGATED_OR_EXPIRED" },
  { label: "Documento duplicado", value: "DUPLICATE" },
  { label: "Documento cargado por error", value: "UPLOADED_BY_ERROR" },
  { label: "Información incompleta", value: "INCOMPLETE_INFORMATION" },
  { label: "Pendiente de validación", value: "PENDING_VALIDATION" },
  {
    label: "Conservado únicamente como antecedente histórico",
    value: "HISTORICAL_ANTECEDENT",
  },
  {
    label: "Reemplazado por una versión o documento más reciente",
    value: "REPLACED_BY_NEWER",
  },
  { label: "Otro", value: "OTHER" },
] as const;

export type ArchiveReasonCode =
  (typeof ARCHIVE_REASON_OPTIONS)[number]["value"];

export function documentYears(
  currentYear = new Date().getFullYear(),
): number[] {
  const years: number[] = [];
  for (let year = Math.max(currentYear, 2014); year >= 2014; year -= 1) {
    years.push(year);
  }
  return years;
}

export function documentTypeLabel(value: string): string {
  return (
    DOCUMENT_TYPE_OPTIONS.find((option) => option.value === value)?.label ??
    value
  );
}

export function issuingEntityLabel(value: string): string {
  return (
    ISSUING_ENTITY_OPTIONS.find((option) => option.value === value)?.label ??
    value
  );
}

export function archiveReasonLabel(value: string): string {
  return (
    ARCHIVE_REASON_OPTIONS.find((option) => option.value === value)?.label ??
    value
  );
}
