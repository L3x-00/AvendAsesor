import { INTENT_EXPANSIONS, INTENT_TRIGGERS } from './intent-routing.config';
import type { RetrievedChunk } from './retrieval.gateway';
import { normalizeSpanishText } from './text-normalization';

/**
 * Consultas canónicas para conceptos remunerativos que suelen expresarse de
 * manera coloquial. No aportan montos ni reglas: solo nombran las categorías
 * que ya usa el propio corpus para que la búsqueda híbrida pueda llegar a la
 * evidencia normativa pertinente.
 */
const RIM_SIGNAL = INTENT_TRIGGERS.RIM_SIGNAL;
const SCALE_SIGNAL = INTENT_TRIGGERS.SCALE_SIGNAL;
const CONTRACT_SIGNAL = INTENT_TRIGGERS.SALARY_CONTRACT_SIGNAL;
const RURAL_SIGNAL = INTENT_TRIGGERS.RURAL_SIGNAL;
const PADRON_SIGNAL = INTENT_TRIGGERS.PADRON_SIGNAL;
const PAYROLL_DETAIL_SIGNAL = INTENT_TRIGGERS.PAYROLL_DETAIL_SIGNAL;
const REINTEGRATION_SIGNAL = INTENT_TRIGGERS.REINTEGRATION_SIGNAL;
const PAYROLL_DOCUMENT_SIGNAL = INTENT_TRIGGERS.PAYROLL_DOCUMENT_SIGNAL;
const PAYROLL_DOCUMENT_CONTEXT = INTENT_TRIGGERS.PAYROLL_DOCUMENT_CONTEXT;
const CLAIM_SIGNAL = INTENT_TRIGGERS.CLAIM_SIGNAL;
const SALARY_REVIEW_CONTEXT = INTENT_TRIGGERS.SALARY_REVIEW_CONTEXT;
const ASCENSO_SIGNAL = INTENT_TRIGGERS.SALARY_ASCENSO_SIGNAL;
const ALLOCATION_SIGNAL = INTENT_TRIGGERS.ALLOCATION_SIGNAL;
const AMOUNT_REQUEST_SIGNAL = INTENT_TRIGGERS.AMOUNT_REQUEST_SIGNAL;

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
  // Las salvedades se aplican a su propia cláusula: una boleta escolar o una
  // revisión negada no deben ocultar un reclamo salarial posterior.
  return (
    isPayrollReviewClause(text) ||
    text
      .split(/[,;]|\b(?:pero|aunque|sino|y)\b/u)
      .some((clause) => isPayrollReviewClause(clause))
  );
}

function isPayrollReviewClause(text: string): boolean {
  if (
    /\bboleta\s+(?:de\s+)?(?:notas?|calificaciones?|compras?|ventas?)\b/u.test(
      text,
    )
  )
    return false;
  if (
    /\bno\s+(?:(?:necesito|quiero|deseo|voy\s+a)\s+(?:revisar|reclamar)\s+(?:mi\s+|la\s+)?(?:boleta|planilla)|(?:quiero|deseo)\s+hacer\s+(?:un\s+)?reclamo)\b/u.test(
      text,
    )
  )
    return false;
  return (
    (PAYROLL_DETAIL_SIGNAL.test(text) &&
      (PAYROLL_DOCUMENT_SIGNAL.test(text) ||
        SALARY_REVIEW_CONTEXT.test(text))) ||
    (PAYROLL_DOCUMENT_SIGNAL.test(text) &&
      /\b(?:reclam\p{L}*|revis\p{L}*|equivocad[oa]s?|incomplet[oa]s?|errores?|mal|falta\s+(?:plata|pago|dinero))\b/u.test(
        text,
      )) ||
    (PAYROLL_DOCUMENT_SIGNAL.test(text) &&
      PAYROLL_DOCUMENT_CONTEXT.test(text) &&
      /\b(?:reclam\p{L}*|revis\p{L}*|equivocad[oa]s?|incomplet[oa]s?|mal|diferencia(?:s)?)\b/u.test(
        text,
      )) ||
    (REINTEGRATION_SIGNAL.test(text) &&
      (PAYROLL_DOCUMENT_SIGNAL.test(text) ||
        SALARY_REVIEW_CONTEXT.test(text))) ||
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
      INTENT_EXPANSIONS.RIM_SCALE_1,
      INTENT_EXPANSIONS.RIM_CONTRACT,
      INTENT_EXPANSIONS.RIM_INCREMENT,
    );
  }

  if (isRuralPadronQuestion(question) || isRuralAllocationQuestion(question)) {
    queries.push(INTENT_EXPANSIONS.RURAL_ASSIGNMENT);
    if (isRuralPadronQuestion(question)) {
      queries.push(INTENT_EXPANSIONS.RURAL_PADRON);
    }
  }

  if (isPayrollReviewQuestion(question)) {
    queries.push(INTENT_EXPANSIONS.PAYROLL_REVIEW);
  }

  if (isAscensoRemunerationQuestion(question)) {
    queries.push(INTENT_EXPANSIONS.ASCENSO_PAYMENT);
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
