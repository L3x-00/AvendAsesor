import type { RetrievedChunk } from './retrieval.gateway';
import { causalsInQuestion } from './process-clarification';
import { normalizeSpanishText } from './text-normalization';

/**
 * Reconocimiento de la reasignación cuando se expresa como un deseo cotidiano
 * («soy nombrado en Junín, quiero irme a Lima porque mi familia vive allá»).
 * No agrega requisitos ni causales: solo traduce la intención al proceso que
 * regula el corpus para que la búsqueda y el prompt la traten como tal.
 */

const REASSIGNMENT_SIGNAL =
  /\b(?:reasignacion(?:es)?|reasignar(?:me|se|nos)?)\b/u;
const AUXILIARY_ROLE_SIGNAL = /\bauxiliar(?:es)?(?:\s+de\s+educaci[oó]n)?\b/u;
const TEACHING_ROLE_SIGNAL =
  /\b(?:nombrad[oa]s?|contratad[oa]s?|docentes?|profesor(?:a|es|as)?|maestr[oa]s?)\b/u;
const FIRST_PERSON_AUXILIARY =
  /\b(?:soy|trabajo como|me desempe[nñ]o como|estoy como)\s+(?:un |una |el |la )?auxiliar(?:es)?(?:\s+de\s+educaci[oó]n)?\b/u;
const FIRST_PERSON_TEACHER =
  /\b(?:soy|trabajo como|me desempe[nñ]o como|estoy como)\s+(?:un |una |el |la )?(?:docente|profesor(?:a)?|maestr[oa]|nombrad[oa]|contratad[oa])\b/u;
const RELOCATION_SIGNAL =
  /\b(?:quiero|quisiera|deseo|necesito|planeo|pienso)\s+(?:irme|mudarme|trasladarme|reubicarme|cambiarme)\b|\b(?:irme|mudarme|trasladarme|reubicarme)\s+(?:a|hacia|para)\b|\b(?:trasladar(?:me|se|nos)?|reubicar(?:me|nos)?|mudar(?:me|se|nos)?)\s+(?:a|hacia|de)\b|\bcambiar(?:me)?\s+de\s+(?:colegio|ie|institucion educativa|region|ciudad|departamento|ugel|dre|plaza|lugar)\b/u;

/**
 * Excluye solo una sección explícitamente dedicada a otra figura: esto evita
 * entregar requisitos de permuta como si fueran requisitos de reasignación.
 * No certifica que las demás fuentes respalden una afirmación. Las consultas
 * que también mencionan permuta y los fragmentos mixtos conservan su alcance.
 */
export function isExclusiveExchangeSectionForReassignment(
  question: string,
  source: Pick<RetrievedChunk, 'chunkContent' | 'sectionTitle'>,
): boolean {
  if (!isReassignmentQuestion(question)) return false;
  const asked = normalizeSpanishText(question);
  // Una negación inequívoca no convierte la consulta en comparación. Si la
  // figura se menciona otra vez, se conserva por ambigüedad.
  const exchangeRequest = asked.replace(
    /\b(?:no\s+(?:quiero|deseo|solicito|pido)\s+(?:(?:una|la)\s+)?|sin\s+)permut\p{L}*\b/gu,
    ' ',
  );
  if (
    /\b(?:permut\p{L}*|intercambi\p{L}*)\b/u.test(exchangeRequest) ||
    /\bcambiar\b.{0,50}\bplazas?\b.{0,50}\bcon\s+(?:otro|otra|alguien)\b/u.test(
      asked,
    )
  )
    return false;
  return isExclusiveExchangeSection(source);
}

const EXCLUSIVE_EXCHANGE_HEADING =
  /^disposiciones\s+especificas\s+de\s+la\s+permuta\b(?!\s+(?:y|o)\s+reasignacion)/u;
const EXCLUSIVE_EXCHANGE_HEADING_AFTER_PAGE =
  /^pagina\s+\d+\s+de\s+\d+\s+disposiciones\s+especificas\s+de\s+la\s+permuta\b(?!\s+(?:y|o)\s+reasignacion)/u;

/**
 * La sección del fragmento está dedicada solo a la permuta. No depende de la
 * pregunta: sirve también cuando el proceso se heredó del hilo y el turno
 * actual no repite «reasignación».
 */
export function isExclusiveExchangeSection(
  source: Pick<RetrievedChunk, 'chunkContent'> & {
    sectionTitle?: string | null;
  },
): boolean {
  const heading = normalizeSpanishText(source.sectionTitle ?? '');
  const content = normalizeSpanishText(source.chunkContent);
  return (
    EXCLUSIVE_EXCHANGE_HEADING.test(heading) &&
    (EXCLUSIVE_EXCHANGE_HEADING.test(content) ||
      EXCLUSIVE_EXCHANGE_HEADING_AFTER_PAGE.test(content)) &&
    !/\bdisposiciones\s+especificas\s+de\s+la\s+reasignacion\b/u.test(content)
  );
}

function evidenceText(
  source: Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'>,
): string {
  return normalizeSpanishText(`${source.documentTitle} ${source.chunkContent}`);
}

/**
 * La consulta pide trasladarse de lugar de trabajo, con o sin el término
 * «reasignación». Se exige el deseo de desplazamiento y un vínculo docente: una
 * mudanza personal sin contexto laboral no se convierte en este trámite.
 */
export function isReassignmentQuestion(question: string): boolean {
  const text = normalizeSpanishText(question);
  if (REASSIGNMENT_SIGNAL.test(text)) return true;
  if (
    TEACHING_ROLE_SIGNAL.test(text) &&
    /\b(?:pedir|solicitar)\s+(?:mi|el|un)\s+(?:cambio|traslado)\b/u.test(
      text,
    ) &&
    !/\bcambio\s+de\s+(?:horario|jornada|turno|nivel|especialidad)\b/u.test(
      text,
    ) &&
    /\b(?:espos[oa]|conyuge|pareja|familia|hij[oa]s?)\b/u.test(text)
  )
    return true;
  return TEACHING_ROLE_SIGNAL.test(text) && RELOCATION_SIGNAL.test(text);
}

/**
 * Régimen del traslado consultado. Un auxiliar no se rige por la norma de
 * reasignación de profesores: el catálogo tiene un procedimiento propio. El rol
 * se toma solo del texto de la persona; si no lo declara, no se supone.
 */
export function reassignmentRole(
  question: string,
): 'auxiliar' | 'docente' | null {
  const text = normalizeSpanishText(question);
  const ownAuxiliary = FIRST_PERSON_AUXILIARY.test(text);
  const ownTeacher = FIRST_PERSON_TEACHER.test(text);
  // La primera persona del solicitante manda: «soy docente y mi esposa es
  // auxiliar» no convierte su traslado en un procedimiento de auxiliares.
  if (ownAuxiliary && !ownTeacher) return 'auxiliar';
  if (ownTeacher && !ownAuxiliary) return 'docente';
  if (ownAuxiliary && ownTeacher) return null;
  // Sin primera persona se acepta una consulta temática sobre auxiliares solo
  // si el texto no habla de profesores.
  if (AUXILIARY_ROLE_SIGNAL.test(text) && !TEACHING_ROLE_SIGNAL.test(text)) {
    return 'auxiliar';
  }
  if (TEACHING_ROLE_SIGNAL.test(text)) return 'docente';
  return null;
}

/**
 * Consultas canónicas que usan la denominación del corpus. Cuando la persona
 * nombró un motivo, se añade su causal para que la búsqueda llegue a la regla
 * que efectivamente rige ese caso.
 */
export function reassignmentEvidenceQueries(question: string): string[] {
  if (!isReassignmentQuestion(question)) return [];
  const causals = causalsInQuestion(question);
  const queries: string[] = [];
  if (reassignmentRole(question) === 'auxiliar') {
    queries.push(
      'reasignación auxiliares de educación otra UGEL requisitos causales unidad familiar',
    );
  }
  if (causals.includes('unidad-familiar')) {
    queries.push(
      'reasignación docente unidad familiar requisitos traslado otra región convivencia familiar',
    );
  }
  queries.push(
    'reasignación docente requisitos etapas proceso norma técnica de reasignación y permuta',
  );
  if (causals.length) {
    queries.push(
      'causales de reasignación docente salud emergencia unidad familiar interés personal requisitos',
    );
  }
  return [...new Set(queries)].slice(0, 4);
}

/**
 * Fragmento que además nombra el motivo que la persona declaró (por ejemplo,
 * unidad familiar). Se entrega junto con la norma general para que la respuesta
 * no tenga que generalizar la causal desde otra norma.
 */
export function isReassignmentCausalEvidence(
  question: string,
  source: Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'>,
): boolean {
  if (!isReassignmentQuestion(question)) return false;
  const causals = causalsInQuestion(question);
  if (!causals.length) return false;
  const evidence = evidenceText(source);
  if (!/\breasignacion(?:es)?\b/u.test(evidence)) return false;
  return causals.some((causal) => {
    if (causal === 'unidad-familiar') {
      return /\b(?:unidad familiar|familia(?:r|res)?|hij[oa]s?|conyuge|espos[oa]|pareja)\b/u.test(
        evidence,
      );
    }
    if (causal === 'salud') {
      return /\b(?:salud|enfermedad|discapacidad)\b/u.test(evidence);
    }
    if (causal === 'emergencia') return /\bemergencias?\b/u.test(evidence);
    if (causal === 'violencia') return /\bviolencia\b/u.test(evidence);
    if (causal === 'interes-personal') {
      return /\binteres personal\b/u.test(evidence);
    }
    return false;
  });
}

/**
 * El texto presenta la reasignación como el trámite que regula, no como una
 * mención incidental. Muchos títulos del corpus son solo la identidad de la
 * norma («RSG N.° 326-2017-MINEDU»), así que la ausencia de la palabra en el
 * título no impide reconocer un fragmento que trata el proceso.
 */
const REASSIGNMENT_PROCESS_FRAMING =
  /\b(?:proceso|procedimiento|solicitud|tramite|norma tecnica|etapas?|cronograma|causales?|requisitos|plazas?)\b[\s\S]{0,60}\breasignacion(?:es)?\b|\breasignacion(?:es)?\b[\s\S]{0,60}\b(?:docentes?|profesor(?:es)?|proceso|procedimiento|solicitud|etapas?|causales?|requisitos|norma tecnica|plazas?)\b/u;

/**
 * El fragmento trata el régimen de auxiliares y no el docente. Se compara el
 * régimen en el propio texto: un título que es solo la identidad de la norma
 * («RSG N.° 326-2017-MINEDU») no dice a quién rige, así que la palabra
 * «auxiliares» en el cuerpo es la que decide. Lo usan también los procesos que
 * ambos regímenes comparten (reasignación, licencias), en los dos sentidos.
 *
 * Se exige la población del proceso («auxiliares de educación»), no la palabra
 * suelta: «los auxiliares de la UGEL» o «los auxiliares administrativos» son
 * funciones de oficina que aparecen en normas de cualquier régimen. Un
 * fragmento mixto se atribuye al régimen que nombra primero: «requisitos de
 * reasignación para docentes y auxiliares» trata de docentes.
 */
const AUXILIARY_POPULATION = /\bauxiliares?\s+de\s+educaci[oó]n\b/u;

/** Docencia propiamente dicha: no incluye el vínculo («nombrado», «contratado»). */
const TEACHING_POPULATION =
  /\b(?:docentes?|profesor(?:a|es|as)?|maestr[oa]s?)\b/u;

export function onlyAuxiliaryRegime(evidence: string): boolean {
  const auxiliary = AUXILIARY_POPULATION.exec(evidence);
  if (!auxiliary) return false;
  const teaching = TEACHING_ROLE_SIGNAL.exec(evidence);
  if (!teaching) return true;
  return teaching.index > auxiliary.index;
}

/**
 * El texto nombra a alguno de los dos regímenes. Lo usa la compuerta del
 * proceso heredado para decidir si el régimen se lee del desarrollo del
 * fragmento o, cuando el cuerpo no lo repite (un plazo no dice a quién rige),
 * del título de la norma. «Nombrado» y «contratado» describen el vínculo, no el
 * régimen: un requisito del «personal nombrado» rige a los dos.
 */
export function namesStaffRegime(evidence: string): boolean {
  return (
    AUXILIARY_POPULATION.test(evidence) || TEACHING_POPULATION.test(evidence)
  );
}

/**
 * Fuente que trata el proceso de reasignación, no una mención incidental de la
 * palabra en un listado de supuestos de otro régimen.
 */
export function isDirectReassignmentEvidence(
  question: string,
  source: Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'>,
): boolean {
  if (!isReassignmentQuestion(question)) return false;
  const title = normalizeSpanishText(source.documentTitle);
  const evidence = evidenceText(source);
  if (!/\breasignacion(?:es)?\b/u.test(evidence)) return false;
  const role = reassignmentRole(question);
  if (role === 'auxiliar') {
    // El auxiliar se rige por su propio procedimiento, no por la norma de
    // reasignación y permuta de profesores. «Auxiliares» aislado puede aludir a
    // otro cargo, así que se exige el régimen de educación.
    return /\bauxiliar(?:es)?\s+de\s+educacion\b/u.test(evidence);
  }
  // Una mención de «reasignación» dentro de un procedimiento de otro régimen
  // (por ejemplo, situaciones administrativas de auxiliares) no responde la
  // consulta de un profesor y no debe desplazar a la norma propia.
  if (onlyAuxiliaryRegime(evidence)) return false;
  // La norma que regula el proceso lo anuncia en su título.
  if (/\breasignacion\b/u.test(title)) return true;
  if (
    role === 'docente' &&
    /\bprofesor(?:es)?\b[\s\S]{0,80}\breasignacion\b|\breasignacion\b[\s\S]{0,80}\bprofesor(?:es)?\b/u.test(
      evidence,
    )
  )
    return true;
  return REASSIGNMENT_PROCESS_FRAMING.test(evidence);
}
