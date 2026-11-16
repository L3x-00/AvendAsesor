import { refersBack } from './anaphora';
import { hasTopicTerm } from './domain-lexicon';
import {
  causalLabelsInQuestion,
  causalsInQuestion,
} from './process-clarification';
import type { RetrievedChunk } from './retrieval.gateway';
import {
  isExclusiveExchangeSection,
  namesStaffRegime,
  onlyAuxiliaryRegime,
  reassignmentRole,
} from './reassignment-retrieval';
import {
  detectTopicIntent,
  type TopicIntent,
  type TopicIntentId,
} from './topic-intent';
import { namesTemporaryPlacementProcess } from './temporary-placement-retrieval';
import { normalizeSpanishText } from './text-normalization';

/**
 * Contexto de proceso del hilo conversacional.
 *
 * El chat ya hereda factores salariales (`inheritedFactorQuestions`) y resuelve
 * elipsis y deícticos (`contextualQuery`, `refersBack`). Faltaba el caso
 * simétrico para los procesos: en un hilo sobre el destaque, «¿y por causal de
 * salud?» o «¿cómo postulo?» no repiten el término del proceso. Sin heredarlo,
 * la recuperación buscaba una consulta sin tema, no generaba ninguna expansión
 * canónica y el turno terminaba en «sin evidencia» o en una aclaración de
 * módulo aunque la documentación existiera en el módulo abierto.
 *
 * La herencia es deliberadamente estrecha, porque inventar un proceso sería
 * peor que no responder:
 *  - Solo actúa cuando la consulta actual NO nombra un tema propio: si dice
 *    «licencia» o «permuta» no hereda nada, aunque el hilo fuera del destaque.
 *  - Solo actúa cuando el turno depende del proceso (una causal, un verbo de
 *    trámite, un aspecto normativo o una referencia a lo anterior). Una pregunta
 *    autónoma («¿cuánto gana un auxiliar?») se busca por sí misma.
 *  - No hereda de un turno que rechaza el tema («no quiero nada de eso»).
 *  - Conserva el régimen del proceso: si el hilo es de un auxiliar de
 *    educación, la consulta heredada no usa la denominación del régimen
 *    docente.
 *  - Solo aporta vocabulario de búsqueda. No agrega hechos, no elige evidencia
 *    por sí misma, no cambia el umbral de admisión y no autoriza a responder sin
 *    fuentes: la compuerta de citas sigue intacta.
 */

/** Texto sintético del propio servicio: no es una declaración de la persona. */
const SYNTHETIC_CONTEXT = /^(?:Respuesta anterior|Propuesta aceptada):/u;

/** Verbos con los que se pide un trámite sin nombrarlo. */
const PROCEDURE_VERB =
  /\b(?:postular|postulo|postule|postularme|postulacion|solicitar|solicito|solicite|tramitar|tramito|present(?:ar|o|aria)(?:l[oa])?|inscribir(?:me)?|inscribo|pedir|pido|pediria|necesit(?:o|aria)|gestionar|gestiono|conseguir|consigo|hacer|hago|renovar|renuevo|renovacion)\b/u;

/** Aspectos normativos o de trámite que completan un proceso ya abierto. */
const NORMATIVE_ASPECT =
  /\b(?:requisitos?|plazos?|cronograma|procedimiento|tramites?|documentos?|etapas?|formato|formulario|anexo|pasos?)\b/u;

/**
 * Condicional que continúa el trámite abierto («¿y si la UGEL no me
 * responde?»). Exige un elemento del procedimiento —la autoridad que tramita,
 * la solicitud, el plazo o su rechazo—: «¿y si mi hijo no aprende en la IE?» es
 * otra consulta y no hereda el proceso.
 */
const PROCEDURAL_CONDITIONAL =
  /\by si\b[\s\S]{0,80}\b(?:ugel|dre|(?:no\s+)?me\s+(?:respond|contest|firm|acept|atend|rechaz)\p{L}*|(?:firm|notific|resolv|aprueb)\p{L}*|resolucion|rechaz\p{L}*|vencid\p{L}*|vence|plazo|solicitud|expediente|cronograma)\b/u;

/**
 * El expediente propio o su plazo: lo que la condicional pone en juego. Es el
 * único caso en que una condicional sobre una persona del centro de trabajo
 * («¿y si el director no firma mi solicitud?») sigue siendo el trámite abierto.
 * «¿Y si el director no me acepta en el aula?» es otra consulta.
 */
const OWN_EXPEDIENT =
  /\b(?:mi|mis|nuestra?|nuestros?)\s+(?:solicitud|expediente|pedido|tramite|documentos?|cronograma|resolucion)\b|\b(?:plazo|cronograma|resolucion)\b/u;

/**
 * Causal declarada como motivo del trámite. Se acepta el nombre técnico
 * («causal», «unidad familiar», «salud») y la forma coloquial introducida como
 * motivo («por mi familia», «por razones familiares», «debido a mi esposo»). Una
 * simple descripción de la situación —«mi esposo vive allá»— no ata el turno al
 * proceso: es una afirmación autónoma que puede ser otra consulta.
 */
const DECLARED_CAUSAL =
  /\bcausal(?:es)?\b|\bunidad familiar\b|\binteres personal\b|\bmotivos? personales\b|\bsalud\b|\benfermedad\b|\bdiscapacidad\b|\bemergencia\b|\bviolencia\b|\btratamiento medico\b|\b(?:por|debido a|a causa de)\s+(?:(?:mis?|sus?|la|el|los|las)\s+)?(?:(?:motivos?|razon(?:es)?)\s+(?:personales?|familiar(?:es)?|de salud|de familia)|familia(?:r|res)?|hij[oa]s?|conyuge|espos[oa]|pareja)\b/u;

/** La persona descarta el tema: no hay trámite que completar. */
const REJECTS_TOPIC =
  /\bnada\s+de\s+eso\b|\bolvidalo\b|\bdejemos\s+(?:eso|esto)\b|\bno\s+(?:quiero|me\s+interesa|necesito)\s+(?:nada\s+)?(?:de\s+)?(?:eso|esto|ese|esa|este|esta)\b/u;

/**
 * El turno introduce otro asunto (una persona, un conflicto, el aula). Los
 * verbos del trámite son frecuentes en cualquier pregunta, así que sin este
 * límite «¿qué hago si mi colega me insulta?» heredaría el proceso del hilo y
 * respondería con la norma de otro tema.
 */
const OTHER_SUBJECT_OR_MATTER =
  /\b(?:colegas?|director(?:a)?|subdirector(?:a)?|alumnos?|alumnas?|estudiantes?|apoderados?|padres?|conflictos?|insultos?|agresion(?:es)?|agred(?:e|io|en)|horario|aula|seccion(?:es)?|notas?|matricula|evaluacion del desempeno)\b/u;

/** Módulo cuyo régimen documental es propio y no se comparte con docentes. */
const AUXILIARY_MODULE = 'Auxiliar de educación';

/**
 * Denominación con la que el corpus nombra cada proceso. Se usa solo cuando la
 * consulta actual no lo nombra; si lo nombra, la expansión del módulo
 * correspondiente ya aporta su propio vocabulario y no se duplica.
 */
const PROCESS_CANONICAL_QUERIES: Record<TopicIntentId, string> = {
  reassignment:
    'reasignación docente requisitos etapas proceso norma técnica de reasignación y permuta',
  'temporary-placement':
    'destaque docente requisitos procedimiento solicitud plazo norma técnica',
  'medical-leave':
    'licencia por incapacidad temporal descanso médico CITT certificado médico',
  'career-progression':
    'concurso de ascenso escala magisterial requisitos etapas prueba nacional trayectoria profesional',
  'rural-allocation':
    'asignación por trabajo en ámbito rural padrón de instituciones educativas instrumento habilitante',
  'auxiliary-requirements':
    'contratación auxiliares educación requisitos por nivel modalidad capacitación edad documentos expediente',
  disciplinary:
    'proceso administrativo disciplinario docente derecho de defensa descargos notificación',
  rationalization:
    'racionalización de plazas docentes reducción de plazas por disminución de estudiantes',
};

/**
 * El auxiliar de educación tiene su propio procedimiento en los procesos que
 * comparte con los docentes. Buscar la denominación docente traería la norma
 * equivocada, así que su consulta heredada nombra su régimen.
 */
const AUXILIARY_PROCESS_QUERIES: Partial<Record<TopicIntentId, string>> = {
  reassignment:
    'reasignación de auxiliares de educación requisitos procedimiento solicitud',
  'medical-leave':
    'licencia por incapacidad temporal auxiliares de educación descanso médico CITT certificado',
};

/**
 * El turno necesita el proceso del hilo para tener sentido. Se excluye todo lo
 * que se responde por sí mismo: una cifra, una fecha o un tema nuevo.
 */
export function isProcessDependentTurn(question: string): boolean {
  const text = normalizeSpanishText(question);
  // Una condicional sobre el expediente propio manda sobre la mención de una
  // persona del centro de trabajo: «¿y si el director no firma mi solicitud?»
  // sigue siendo el proceso abierto. La sola presencia de la persona —«¿y si el
  // director no me acepta en el aula?»— no basta: esa es otra consulta.
  const ownExpedientConditional =
    PROCEDURAL_CONDITIONAL.test(text) && OWN_EXPEDIENT.test(text);
  if (!ownExpedientConditional && OTHER_SUBJECT_OR_MATTER.test(text))
    return false;
  // Una causal solo ata el turno al proceso cuando el turno la nombra como
  // causal; describir la situación de un tercero no es preguntar por el trámite.
  const causalDependency =
    causalsInQuestion(question).length > 0 && DECLARED_CAUSAL.test(text);
  const explicitRequest =
    causalDependency ||
    PROCEDURE_VERB.test(text) ||
    NORMATIVE_ASPECT.test(text);
  // Un rechazo solo corta la herencia cuando el turno no pide nada más: «no
  // quiero eso, y el plazo» sigue pidiendo el plazo del proceso abierto.
  if (!explicitRequest && REJECTS_TOPIC.test(text)) return false;
  // «¿Y si la UGEL no me responde?» continúa el proceso abierto sin nombrarlo.
  return (
    explicitRequest || refersBack(question) || PROCEDURAL_CONDITIONAL.test(text)
  );
}

/**
 * Proceso del hilo al que pertenece un turno que no lo nombra. Prioriza el
 * turno más reciente que sí nombraba un proceso; los mensajes sintéticos del
 * propio servicio se ignoran porque no son declaraciones de la persona.
 */
export function inheritedTopicIntent(
  question: string,
  priorUserQuestions: readonly string[],
): TopicIntent | null {
  if (!priorUserQuestions.length) return null;
  if (detectTopicIntent(question)) return null;
  if (hasTopicTerm(normalizeSpanishText(question))) return null;
  if (!isProcessDependentTurn(question)) return null;
  for (let index = priorUserQuestions.length - 1; index >= 0; index -= 1) {
    const prior = priorUserQuestions[index];
    if (!prior || SYNTHETIC_CONTEXT.test(prior)) continue;
    const intent = detectTopicIntent(prior);
    if (!intent) continue;
    // La licencia se reconoce por su propia comprobación clínica, no por el
    // módulo: el régimen de la persona viene del turno que abrió el hilo, y sin
    // él un auxiliar recibiría la norma de profesores (y no la suya).
    if (
      intent.id === 'medical-leave' &&
      reassignmentRole(prior) === 'auxiliar'
    ) {
      return { ...intent, moduleName: AUXILIARY_MODULE };
    }
    return intent;
  }
  return null;
}

/**
 * Consulta canónica del proceso, completada con la causal que la persona
 * declaró cuando corresponde: la norma dedica secciones distintas a salud,
 * emergencia, violencia, unidad familiar e interés personal.
 */
export function processCanonicalQuery(
  intent: TopicIntent,
  question: string,
): string {
  const base =
    (intent.moduleName === AUXILIARY_MODULE
      ? AUXILIARY_PROCESS_QUERIES[intent.id]
      : undefined) ?? PROCESS_CANONICAL_QUERIES[intent.id];
  const causals = causalLabelsInQuestion(question);
  return causals.length ? `${base} ${causals.join(' ')}` : base;
}

/**
 * Consultas que aporta el proceso heredado del hilo. Vacío cuando la consulta
 * nombra su propio tema: en ese caso manda lo que la persona escribió.
 */
export function processQueriesForIntent(
  intent: TopicIntent | null,
  question: string,
): string[] {
  return intent ? [processCanonicalQuery(intent, question)] : [];
}

/**
 * La enfermedad como causal propia. La del familiar —con o sin posesivo— es otra
 * causal y su plazo no responde el descanso médico de la persona.
 */
const OWN_ILLNESS =
  'enfermedad(?!\\s+(?:de|del|de\\s+un|de\\s+mi|de\\s+su|de\\s+mis|de\\s+sus)\\s+(?:familiar|hij[oa]s?|padres?|madres?|conyugues?|parientes?))';

/**
 * Señal textual con la que el corpus nombra cada proceso. La herencia aporta el
 * proceso, no el término: cuando el turno actual es «¿y los requisitos?» la
 * comprobación directa contra la pregunta no puede admitir ningún fragmento, y
 * se evalúa el fragmento. Es la misma exigencia —coincidencia real con el
 * proceso y no una mención ajena— aplicada al lado correcto.
 */
const PROCESS_EVIDENCE: Record<TopicIntentId, RegExp> = {
  reassignment: /\breasignacion(?:es)?\b/u,
  'temporary-placement': /\bdestaques?\b/u,
  'medical-leave': new RegExp(
    `\\b(?:descanso medic[oa]|incapacidad temporal|citt|licencias? por (?:${OWN_ILLNESS}|salud|incapacidad|emergencia|unidad familiar)|permisos? por (?:salud|${OWN_ILLNESS}))\\b`,
    'u',
  ),
  'career-progression':
    /\b(?:ascenso|escala magisterial|concurso de ascenso)\b/u,
  'rural-allocation':
    /\b(?:ambito rural|institucion educativa rural|asignacion por trabajo en ambito rural|asignacion rural)\b/u,
  'auxiliary-requirements': /\bauxiliar(?:es)? de educacion\b/u,
  disciplinary:
    /\b(?:procedimiento administrativo disciplinario|proceso administrativo disciplinario|descargos)\b/u,
  rationalization: /\bracionalizacion\b/u,
};

const AUXILIARY_REGIME = /\bauxiliares?\s+de\s+educacion\b/u;

/** Texto normalizado del fragmento: título, sección y cuerpo. */
function sourceText(
  source: Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'> & {
    sectionTitle?: string | null;
  },
): string {
  return normalizeSpanishText(
    `${source.documentTitle} ${source.sectionTitle ?? ''} ${source.chunkContent}`,
  );
}

/** Texto del desarrollo: sección y cuerpo, sin la identidad de la norma. */
function bodyText(
  source: Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'> & {
    sectionTitle?: string | null;
  },
): string {
  return normalizeSpanishText(
    `${source.sectionTitle ?? ''} ${source.chunkContent}`,
  );
}

/**
 * El fragmento corresponde al régimen de la persona. Se evalúa en los dos
 * sentidos: un auxiliar no recibe la norma de profesores y un docente no recibe
 * un fragmento que solo rige el régimen de auxiliares. El régimen se lee del
 * desarrollo del fragmento; el título solo cuenta cuando el cuerpo no lo repite
 * (un plazo no dice a quién rige), porque hay normas tituladas «para auxiliares
 * de educación» cuyos fragmentos desarrollan el procedimiento de profesores.
 */
function matchesRegime(
  intent: TopicIntent,
  source: Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'> & {
    sectionTitle?: string | null;
  },
): boolean {
  const body = bodyText(source);
  const evidence = namesStaffRegime(body) ? body : sourceText(source);
  if (intent.moduleName === AUXILIARY_MODULE)
    return AUXILIARY_REGIME.test(evidence);
  // Solo reasignación y licencias se comparten entre regímenes; los demás
  // procesos ya se distinguen por su propio nombre.
  if (intent.id !== 'reassignment' && intent.id !== 'medical-leave')
    return true;
  return !onlyAuxiliaryRegime(evidence);
}

/**
 * Señal de otro proceso cuando la del propio proceso no alcanza para
 * distinguirlo. El proceso de contratación comparte población con la
 * reasignación de auxiliares, así que se reconoce por el trámite de
 * contratación y no por el nombre del régimen.
 */
const OTHER_PROCESS_EVIDENCE: Partial<Record<TopicIntentId, RegExp>> = {
  'auxiliary-requirements':
    /\b(?:contratacion|postulacion|contratar)\b[\s\S]{0,50}\bauxiliares?\s+de\s+educacion\b|\bauxiliares?\s+de\s+educacion\b[\s\S]{0,50}\b(?:contratacion|postulacion)\b/u,
};

/** El fragmento trata de forma explícita otro proceso del corpus. */
function mentionsOtherProcess(
  intent: TopicIntent,
  source: Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'> & {
    sectionTitle?: string | null;
  },
): boolean {
  // El encuadre (título y sección) identifica el trámite del fragmento. Una
  // mención incidental en el cuerpo —«la plaza se genera por cese o
  // jubilación»— no convierte en otro trámite el plazo del destaque.
  const framing = normalizeSpanishText(
    `${source.documentTitle} ${source.sectionTitle ?? ''}`,
  );
  const opening = mainClause(openingSentence(bodyText(source)));
  return (Object.keys(PROCESS_EVIDENCE) as TopicIntentId[]).some((id) => {
    if (id === intent.id) return false;
    const pattern = OTHER_PROCESS_EVIDENCE[id] ?? PROCESS_EVIDENCE[id];
    return pattern.test(framing) || pattern.test(opening);
  });
}

/**
 * La oración principal del desarrollo: la subordinada describe una condición
 * («el plazo se suspende si el docente tiene licencia por enfermedad», «mientras
 * se resuelve la permuta») y no cambia el trámite del fragmento. Un «sí»
 * afirmativo seguido de coma no abre subordinada. El enmarque del trámite —«el
 * plazo es de quince días cuando se trata de una permuta»— sí acusa y se
 * reconoce aparte por su marca (`PROCEDURE_FRAMING_CUE`), porque ahí la
 * subordinada no describe una condición: dice de qué trámite habla el fragmento.
 * Si el fragmento abre directamente con la subordinada, la oración completa es la
 * que decide.
 */
function mainClause(text: string): string {
  const [before = ''] = text.split(
    /\b(?:si(?!\s*,)|cuando|mientras|siempre que|en caso de|salvo que)\b/u,
  );
  return before.trim().split(/\s+/u).length >= 3 ? before : text;
}

/**
 * Causales de licencia o permiso que no son la del proceso consultado. Se
 * nombran una por una para el hilo de licencia: la causal propia es solo la
 * clínica. El posesivo cuenta igual que el artículo: «enfermedad de mi hijo» es
 * la misma causal ajena que «enfermedad de un familiar».
 */
const FOREIGN_LEAVE_CAUSAL =
  'licencias? por (?:paternidad|maternidad|duelo|fallecimiento|matrimonio|estudios|comision(?: de servicios)?|enfermedad (?:de|del|de un|de mi|de su|de mis|de sus) (?:familiar(?: directo)?|hij[oa]s?|padres?|madres?|conyugues?|parientes?))|permisos? por (?:paternidad|matrimonio|duelo|fallecimiento|estudios|comision(?: de servicios)?)';

const FOREIGN_LEAVE_CAUSAL_PATTERN = new RegExp(
  `\\b(?:${FOREIGN_LEAVE_CAUSAL})\\b`,
  'u',
);

/**
 * La licencia o el permiso enunciados como trámite en un hilo de otro proceso.
 * Se deja abierta la causal: el corpus nombra tantas como la persona puede
 * invocar. La única excepción es el «por» de duración («licencia por más de
 * treinta días»), que describe un requisito y no otro trámite; cuando el
 * requisito lo enuncia como condición, la exención de `PROCEDURE_AS_CONDITION`
 * lo resuelve.
 */
const LEAVE_AS_PROCEDURE =
  'licencias? por (?!mas de)|permisos? por (?!mas de)|solicitar (?:una )?(?:licencia|permiso)|tramite de (?:licencia|permiso)';

/**
 * Trámites hermanos que el corpus distingue del proceso consultado y que no
 * forman parte de las ocho intenciones: permuta, encargo, cese, jubilación,
 * renuncia, licencia o permiso de otro motivo y contratación docente. Se evalúan
 * sobre el encuadre: el desarrollo del propio proceso suele mencionarlos de
 * pasada.
 *
 * No se incluyen «nombramiento», «designación» ni «contrato de servicio»: en el
 * corpus aparecen como requisitos del trámite («se requiere nombramiento
 * vigente»), no como trámites que compitan con él, y tratarlos como hermanos
 * dejaba sin evidencia los requisitos del propio proceso.
 */
const SIBLING_PROCEDURE =
  'permutas?|permutar(?:se)?|encargos?(?: de (?:funciones|cargo))?|encargaturas?|ceses?|jubilacion(?:es)?|renuncias?|contratacion(?:es)? de docentes?|contratacion docente|postulacion(?:es)? a (?:plazas?|cargos?)|concurso publico de meritos';

const OTHER_PROCEDURE = new RegExp(
  `\\b(?:${SIBLING_PROCEDURE}|${LEAVE_AS_PROCEDURE})\\b`,
  'u',
);

/**
 * La subordinada que enmarca el trámite del fragmento y no una condición del
 * propio: «cuando se trata de una permuta», «si se trata de una permuta», «en el
 * caso de la licencia por paternidad», «cuando la solicitud es por permuta»,
 * «tratándose de un encargo».
 */
const PROCEDURE_FRAMING_CUE =
  /\b(?:(?:cuando|si)\s+se\s+(?:trata|trate|refiere|refiera)\s+de|en\s+(?:el\s+)?(?:caso|supuesto|marco)\s+de|tratandose\s+de|(?:cuando|si)\s+(?:la|el)\s+(?:solicitud|peticion|pedido|tramite|consulta|postulacion|requerimiento)\s+(?:es|sea|fuera|fuese|corresponde|corresponda)\s+(?:a|de|por|para))\s+/u;

/**
 * El trámite enmarcado en la subordinada se evalúa con el patrón del proceso
 * consultado, no con la lista completa de trámites hermanos: en un hilo de
 * licencia, «en el caso de la licencia por enfermedad» nombra la causal propia y
 * no otro trámite, mientras «en el caso de la licencia por paternidad» sí.
 */
function framesOtherProcedure(sentence: string, pattern: RegExp): boolean {
  const cue = PROCEDURE_FRAMING_CUE.exec(sentence);
  return cue ? pattern.test(sentence.slice(cue.index + cue[0].length)) : false;
}

/**
 * En un hilo de licencia, la licencia y el permiso de la causal propia son el
 * propio proceso: se exceptúa la causal, no la familia entera, para que una
 * licencia por paternidad o un permiso por matrimonio sigan siendo otro trámite
 * y para que el plazo del propio trámite siga respondiéndose. «Enfermedad de
 * familiar» no es la incapacidad temporal propia.
 */
const OTHER_PROCEDURE_WITHOUT_OWN_LEAVE = new RegExp(
  `\\b(?:${SIBLING_PROCEDURE}|${FOREIGN_LEAVE_CAUSAL})\\b|\\blicencias? por (?!(?:${OWN_ILLNESS}|salud|incapacidad|emergencia|unidad familiar))\\w|\\bpermisos? por (?!salud|${OWN_ILLNESS})\\w`,
  'u',
);

/**
 * El otro trámite se nombra como requisito o sanción del propio («no encontrarse
 * en uso de licencia», «no haber sido sancionado con cese temporal»): no lo
 * convierte en el trámite del fragmento.
 *
 * La enumeración es cerrada a propósito. Un «gozar de», «acogerse a» o «en uso
 * de» suelto describe el otro trámite y no una condición del propio: «los
 * docentes pueden acogerse a la permuta» y «el directivo puede gozar de un
 * encargo» desarrollan la permuta y el encargo, no el proceso consultado.
 */
const PROCEDURE_AS_CONDITION =
  /\b(?:no\s+(?:haber\s+sido\s+sancionad|haber\s+incurrid|estar\s+(?:sancionad|incurrid|incurso|comprendid|en\s+uso)|encontrarse\s+(?:sancionad|incurrid|incurso|comprendid|en\s+uso)|registrar\s+(?:sancion|cese)|tener\s+(?:sancion|cese))\p{L}*|sancionad\p{L}*\s+con\s+(?:cese|suspension|destitucion|amonestacion)|sin\s+(?:hacer\s+uso|estar\s+en\s+uso|encontrarse\s+en\s+uso))\b/u;

function mentionsOtherProcedure(
  intent: TopicIntent,
  source: Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'> & {
    sectionTitle?: string | null;
  },
): boolean {
  const pattern =
    intent.id === 'medical-leave'
      ? OTHER_PROCEDURE_WITHOUT_OWN_LEAVE
      : OTHER_PROCEDURE;
  const title = normalizeSpanishText(source.documentTitle);
  const section = normalizeSpanishText(source.sectionTitle ?? '');
  const sentence = openingSentence(bodyText(source));
  const development = mainClause(sentence);
  // La sección es el encuadre del fragmento: si ella nombra otro trámite, la
  // condición de la primera oración no lo desmiente («De la licencia por
  // paternidad» + «el docente en uso de licencia por paternidad»).
  if (pattern.test(section)) return true;
  // El título de una norma conjunta —«Norma técnica de reasignación y
  // permuta»— nombra los dos trámites: el hermano que el mismo título enuncia no
  // es indicio de otro trámite, y el fragmento debe decidirse por su sección y su
  // cuerpo.
  const titleNamesOwnProcess = PROCESS_EVIDENCE[intent.id].test(title);
  if (!titleNamesOwnProcess && pattern.test(title)) return true;
  // La subordinada puede enmarcar el trámite («el plazo es de quince días cuando
  // se trata de una permuta») en lugar de describir una condición del propio.
  if (framesOtherProcedure(sentence, pattern)) return true;
  // El requisito o la sanción del propio trámite no lo convierte en otro
  // trámite, salvo que dentro del requisito se enuncie una causal de licencia
  // ajena: «no encontrarse en uso de licencia por paternidad» sigue siendo la
  // licencia por paternidad.
  if (
    PROCEDURE_AS_CONDITION.test(development) &&
    !FOREIGN_LEAVE_CAUSAL_PATTERN.test(development)
  )
    return false;
  return pattern.test(development);
}

/**
 * Primera oración del cuerpo (sección y contenido, sin el título de la norma):
 * el trámite que el fragmento desarrolla se anuncia ahí. Sirve para distinguir
 * «La permuta entre profesores se solicita dentro del plazo» de un plazo del
 * destaque que menciona la permuta al final. El título queda fuera porque la
 * identidad de la norma («RSG N.° 326-2017-MINEDU») trae puntos y códigos que
 * cortarían la oración antes de su verbo.
 */
function openingSentence(text: string): string {
  return text.split(/[.;:]/u)[0] ?? text;
}

/**
 * El fragmento trata el proceso heredado, en el régimen de la persona.
 */
export function treatsProcessIntent(
  intent: TopicIntent,
  source: Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'> & {
    sectionTitle?: string | null;
  },
): boolean {
  return treatsInheritedProcess(intent, source, false);
}

/**
 * El fragmento puede responder un turno que hereda el proceso del hilo. Dos
 * vías, ambas sujetas al régimen de la persona:
 *
 *  1. El fragmento trata el proceso en su desarrollo: lo nombra en la sección o
 *     en el cuerpo. El título de la norma no basta —una norma se titula por su
 *     ámbito y puede desarrollar dentro otro trámite—.
 *  2. El fragmento no lo repite (el corpus desarrolla el plazo o el requisito
 *     sin volver a nombrar el trámite), pero la búsqueda del proceso lo devolvió
 *     con el umbral general y su encuadre no es de otro trámite.
 *
 * La procedencia es condición necesaria, nunca suficiente: que un embedding
 * sintético devuelva un vecino léxico no convierte el plazo de la reasignación
 * en respuesta de un hilo sobre el destaque. Por eso el segundo camino exige,
 * además, que el encuadre del fragmento no trate otro trámite.
 */
export function treatsInheritedProcess(
  intent: TopicIntent,
  source: Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'> & {
    sectionTitle?: string | null;
  },
  fromProcessQuery: boolean,
): boolean {
  if (!matchesRegime(intent, source)) return false;
  if (namesOwnProcess(intent, source)) {
    // La sección dedicada a la permuta desarrolla otra figura aunque el proceso
    // heredado sea la reasignación, cuya norma las regula juntas.
    return !(
      intent.id === 'reassignment' && isExclusiveExchangeSection(source)
    );
  }
  return (
    fromProcessQuery &&
    !mentionsOtherProcess(intent, source) &&
    !mentionsOtherProcedure(intent, source)
  );
}

/**
 * El fragmento comparte la versión admitida sin tratar otro proceso. Se usa al
 * ampliar la respuesta con los demás fragmentos del documento: una tabla o un
 * anexo del propio trámite no repite su nombre ni proviene de su consulta, y aun
 * así completa la respuesta.
 */
export function belongsToAdmittedVersion(
  intent: TopicIntent,
  source: Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'> & {
    sectionTitle?: string | null;
  },
): boolean {
  return (
    matchesRegime(intent, source) &&
    !mentionsOtherProcess(intent, source) &&
    !mentionsOtherProcedure(intent, source)
  );
}

/**
 * El fragmento es del proceso consultado y no desarrolla un trámite hermano. Se
 * aplica también cuando la pregunta nombra el proceso: el título de una norma
 * conjunta —«Norma técnica de reasignación, permuta y destaque»— no convierte en
 * destaque la sección que desarrolla la permuta.
 *
 * La salida por nombre propio es la misma del hilo heredado: si la sección o el
 * cuerpo nombran el proceso consultado, la mención del hermano en el título de la
 * norma conjunta o en un requisito del propio trámite —«se genera por cese,
 * jubilación o renuncia»— no lo descarta. Sin ella, una pregunta explícita de
 * destaque quedaba sin evidencia por la simple mención incidental del hermano.
 */
export function belongsToAdmittedProcedure(
  intent: TopicIntent,
  source: Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'> & {
    sectionTitle?: string | null;
  },
): boolean {
  if (!matchesRegime(intent, source)) return false;
  if (namesOwnProcess(intent, source)) {
    // La sección exclusiva de la permuta desarrolla otra figura aunque la norma
    // de la reasignación las regule juntas.
    return !(
      intent.id === 'reassignment' && isExclusiveExchangeSection(source)
    );
  }
  return !mentionsOtherProcedure(intent, source);
}

/**
 * El fragmento desarrolla el proceso heredado. Se evalúa sobre la sección y el
 * cuerpo: es lo que el chunk trata, no el nombre del documento. El destaque
 * tiene su propia comprobación porque el participio («docentes destacados»)
 * aparece en textos de otros trámites.
 */
function namesOwnProcess(
  intent: TopicIntent,
  source: Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'> & {
    sectionTitle?: string | null;
  },
): boolean {
  if (intent.id === 'temporary-placement') {
    return namesTemporaryPlacementProcess(source);
  }
  return PROCESS_EVIDENCE[intent.id].test(bodyText(source));
}
