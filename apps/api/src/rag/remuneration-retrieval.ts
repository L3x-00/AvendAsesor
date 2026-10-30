import type { RetrievedChunk } from './retrieval.gateway';
import { normalizeSpanishText } from './text-normalization';

/**
 * Consultas canónicas para conceptos remunerativos que suelen expresarse de
 * manera coloquial. No aportan montos ni reglas: solo nombran las categorías
 * que ya usa el propio corpus para que la búsqueda híbrida pueda llegar a la
 * evidencia normativa pertinente.
 */
const RIM_SIGNAL =
  /\b(?:rim|remuneraci[oó]n(?:es)?|sueldo(?:s)?|salario(?:s)?|gan(?:a|an|amos|ar|ar[ií]a|ar[ií]an)|percib(?:e|en|ir)|escala(?:s)?\s+magisterial(?:es)?)\b/u;
const SCALE_SIGNAL =
  /\b(?:primera|segunda|tercera|cuarta|quinta|sexta|s[eé]ptima|octava|escala(?:s)?|ascens[oa])\b/u;
const CONTRACT_SIGNAL = /\b(?:nombrad[oa]s?|contratad[oa]s?)\b/u;
const RURAL_SIGNAL =
  /\b(?:rural(?:es|idad)?|zona\s+rural|[aá]mbito\s+rural)\b/u;
const PADRON_SIGNAL = /\b(?:padr[oó]n(?:es)?|figura|incluid[oa]|listad[oa])\b/u;
const PAYROLL_DETAIL_SIGNAL =
  /\b(?:descuento(?:s)?|deducci[oó]n|reintegro(?:s)?|diferencia(?:s)?\s+remunerativa(?:s)?|monto\s+menor)\b/u;
const PAYROLL_DOCUMENT_SIGNAL = /\b(?:boleta|planilla)\b/u;
const PAYROLL_DOCUMENT_CONTEXT =
  /\b(?:pago(?:s)?|remuneraci[oó]n(?:es)?|sueldo(?:s)?|haberes|descuento(?:s)?|deducci[oó]n|reintegro(?:s)?)\b/u;
const CLAIM_SIGNAL = /\b(?:reclamo|reclamar|revision|revisar)\b/u;
const SALARY_REVIEW_CONTEXT =
  /\b(?:remuneraci[oó]n(?:es)?|sueldo(?:s)?|salario(?:s)?|haberes)\b/u;
const ASCENSO_SIGNAL =
  /\b(?:ascenso|ascensos|ascend(?:er|ido|iendo)|asciend[oa])\b/u;
const ALLOCATION_SIGNAL = /\b(?:asignaci[oó]n|bono|beneficio|pago)\b/u;
const AMOUNT_REQUEST_SIGNAL =
  /\b(?:cuanto|cu[aá]nto).{0,50}\b(?:corresponde|percibo|recibo)|\bme\s+corresponde\b/u;

function evidenceText(
  source: Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'>,
): string {
  return normalizeSpanishText(`${source.documentTitle} ${source.chunkContent}`);
}

const EDUCATIONAL_INSTITUTION_PADRON =
  /\bpadron(?:es)?\s+de\s+(?:las\s+)?(?:instituciones?\s+educativa(?:s)?|ii\.?\s*ee\.?)\b/u;
const RURAL_ASSIGNMENT_BENEFIT =
  /\basignacion(?:es)?\s+(?:temporal(?:es)?\s+)?(?:rural(?:es)?|por\s+(?:prestar|trabajo|servicio))\b|\bmonto\s+de\s+la\s+asignacion\b[\s\S]{0,120}\brural\b/u;

function ownDocumentReferencePrecedes(
  source: Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'>,
  contentIndex: number,
): boolean {
  const reference =
    /(\d{1,8})\s*-\s*((?:19|20)\d{2})\s*-\s*([a-z]{2,20})/iu.exec(
      source.documentTitle,
    );
  // Los dobles de prueba y algunos documentos no normativos no declaran número
  // en el título; no se les atribuye una cabecera inexistente.
  if (!reference) return true;
  const flexiblePart = (value: string) =>
    [...value].map((character) => `${character}\\D*`).join('');
  const heading = new RegExp(
    `${flexiblePart(reference[1])}${flexiblePart(reference[2])}${flexiblePart(reference[3])}`,
    'iu',
  );
  const match = heading.exec(source.chunkContent);
  return match?.index !== undefined && match.index < contentIndex;
}

/**
 * Un padrón al que se puede remitir la inclusión de una institución no es una
 * mención incidental de "padrón" dentro de una norma salarial. Se exige que
 * el propio fragmento identifique un listado de instituciones educativas y
 * su vínculo con ruralidad.
 */
export function isRuralPadronEvidence(
  source: Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'>,
): boolean {
  const content = normalizeSpanishText(source.chunkContent);
  const padron = EDUCATIONAL_INSTITUTION_PADRON.exec(content);
  return Boolean(
    padron && ownDocumentReferencePrecedes(source, padron.index ?? 0),
  );
}

/**
 * Para orientar sobre la asignación se conserva únicamente la norma que une
 * asignación rural y el padrón habilitante; así una jornada adicional que
 * mencione ruralidad no se presenta como el beneficio consultado.
 */
export function isRuralAllocationEvidence(
  source: Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'>,
): boolean {
  const evidence = normalizeSpanishText(source.chunkContent);
  return (
    /\brural(?:es|idad)?\b/u.test(evidence) &&
    /\b(?:decreta|articulo\s+1\b)\b/u.test(evidence) &&
    RURAL_ASSIGNMENT_BENEFIT.test(evidence)
  );
}

export function isRuralPadronQuestion(question: string): boolean {
  const text = normalizeSpanishText(question);
  return RURAL_SIGNAL.test(text) && PADRON_SIGNAL.test(text);
}

export function isRuralAllocationQuestion(question: string): boolean {
  const text = normalizeSpanishText(question);
  return RURAL_SIGNAL.test(text) && ALLOCATION_SIGNAL.test(text);
}

/** Un reclamo genérico no se asume remunerativo: necesita una boleta o un dato salarial. */
export function isPayrollReviewQuestion(question: string): boolean {
  const text = normalizeSpanishText(question);
  return (
    PAYROLL_DETAIL_SIGNAL.test(text) ||
    (PAYROLL_DOCUMENT_SIGNAL.test(text) &&
      PAYROLL_DOCUMENT_CONTEXT.test(text)) ||
    (CLAIM_SIGNAL.test(text) && SALARY_REVIEW_CONTEXT.test(text))
  );
}

export function isAscensoRemunerationQuestion(question: string): boolean {
  const text = normalizeSpanishText(question);
  return (
    ASCENSO_SIGNAL.test(text) &&
    (RIM_SIGNAL.test(text) || AMOUNT_REQUEST_SIGNAL.test(text))
  );
}

/**
 * Expansiones semánticas acotadas. Cada una se habilita por un concepto que
 * el usuario sí escribió, mantiene la selección de módulo de la consulta y
 * se limita a cuatro búsquedas para no convertir una pregunta corta en una
 * exploración indiscriminada del corpus.
 */
export function remunerationEvidenceQueries(question: string): string[] {
  const text = normalizeSpanishText(question);
  const queries: string[] = [];

  if (
    (RIM_SIGNAL.test(text) || AMOUNT_REQUEST_SIGNAL.test(text)) &&
    (SCALE_SIGNAL.test(text) || CONTRACT_SIGNAL.test(text))
  ) {
    queries.push(
      'monto de la remuneración íntegra mensual RIM primera escala magisterial',
      'monto de la remuneración mensual del profesor contratado jornada laboral',
      'incremento posterior de la remuneración íntegra mensual RIM primera escala magisterial',
    );
  }

  if (isRuralPadronQuestion(question) || isRuralAllocationQuestion(question)) {
    queries.push(
      'asignación por trabajo en ámbito rural padrón de instituciones educativas instrumento habilitante',
    );
    if (isRuralPadronQuestion(question)) {
      queries.push(
        'padrón de instituciones educativas públicas unidocentes y multigrado rural',
      );
    }
  }

  if (isPayrollReviewQuestion(question)) {
    queries.push(
      'boleta de pago descuentos diferencias remunerativas planilla única de pagos reintegros actos administrativos',
    );
  }

  if (isAscensoRemunerationQuestion(question)) {
    queries.push(
      'ascenso de escala magisterial acto resolutivo pago planilla única de pagos',
    );
  }

  return [...new Set(queries)].slice(0, 4);
}

/**
 * La búsqueda canónica ya exige señales inequívocas de la persona. Este filtro
 * conserva una fuente que trata directamente ese concepto aunque su similitud
 * quede apenas fuera de la banda general, donde suelen predominar decretos de
 * incremento que comparten el vocabulario de remuneraciones pero no responden
 * sobre padrones, ascenso o la revisión de planilla.
 */
export function isDirectRemunerationEvidence(
  question: string,
  source: Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'>,
): boolean {
  const requested = normalizeSpanishText(question);
  const evidence = evidenceText(source);
  if (isRuralPadronQuestion(question)) {
    return isRuralPadronEvidence(source);
  }
  if (isRuralAllocationQuestion(question)) {
    return isRuralAllocationEvidence(source);
  }
  if (isAscensoRemunerationQuestion(question)) {
    return (
      ASCENSO_SIGNAL.test(evidence) &&
      /\b(?:acto(?:s)? resolutiv|planilla|pago|descuento)\b/u.test(evidence)
    );
  }
  if (isPayrollReviewQuestion(question)) {
    return (
      /\b(?:planilla|boleta)\b/u.test(evidence) &&
      /\b(?:descuento|deducci[oó]n|reintegro|validaci[oó]n|pago)\b/u.test(
        evidence,
      )
    );
  }
  return false;
}
