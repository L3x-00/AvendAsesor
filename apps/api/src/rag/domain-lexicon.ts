/**
 * Léxico del ámbito educativo de AVEND ASESOR (docentes, auxiliares de
 * educación y directivos), compartido por el clasificador de intención del chat
 * y por la detección de seguimientos del retrieval. Todos los patrones se
 * evalúan sobre texto normalizado (`normalizeSpanishText`: minúsculas, sin
 * tildes), por eso no llevan tildes.
 *
 * Se distinguen tres fuerzas de señal:
 *  - TOPIC: procesos y situaciones que IDENTIFICAN un tema (destaque, licencia,
 *    CTS, cese…). Una consulta que nombra uno es autocontenida.
 *  - ASPECT: aspectos normativos o de trámite comunes a todos los temas (plazo,
 *    requisito, resolución, derecho…). Son señal de dominio, pero no de tema.
 *  - WEAK: roles del sector y contexto escolar/institucional (docente, colegio,
 *    alumnos, UGEL…). Indican el ámbito, pero solos no bastan para distinguir una
 *    consulta de una presentación ("hola, soy docente").
 */

const TOPIC_PATTERNS: readonly RegExp[] = [
  // Desplazamientos y acceso a cargos
  /\b(destaques?|destacar(?:me|se|lo|la)?|destacad[oa]|reasignacion(?:es)?|reasignar(?:me|se)?|encargatura|encargos?|encargar(?:me|se|le)?|encargan|permutas?|permutar|rotacion(?:es)?|nombramiento|nombrar(?:me)?|contratacion|contratos?|ascensos?|ascender|reincorporacion|reingreso|permanencia|escalafon|escala magisterial|designacion(?:es)?|adjudicacion(?:es)?|cuadro de meritos|comision de servicios?|concursos?|plazas?|vacantes?|cas)\b/u,
  // Licencias, permisos, asistencia y jornada
  /\b(licencias?|permisos?|inasistencias?|tardanzas?|faltas?|faltar|falte|faltado|ausencias?|justificar|justificacion|vacaciones|descansos?|subsidios?|luto|maternidad|paternidad|lactancia|fallecimiento|receta medica|certificado medico|papeletas?|horas? extras?|salir (?:temprano|antes)|carga horaria|jornadas?|horarios?|turnos?|huelgas?)\b/u,
  // Remuneraciones y beneficios
  /\b(remuneracion(?:es)?|sueldos?|salarios?|haberes|pagos?|pagar(?:me|nos)?|pagan|paguen|cobrar|cobro|cuanto (?:gana|ganan|gano|ganaria)|bonificacion(?:es)?|bonos?|cts|pension(?:es)?|jubilacion|jubilar(?:me|se)?|jubilo|cesantia|descuentos?|descontar(?:on|me)?|descuentan|aguinaldo|gratificacion(?:es)?|escolaridad|asignacion(?:es)?|sepelio)\b/u,
  // Régimen disciplinario, conflictos y término del vínculo
  /\b(cese|renuncia(?:r)?|sancion(?:es)?|sancionar(?:me)?|amonestacion|suspension|destitucion|destituir|disciplinari[oa]s?|proceso administrativo|pad|descargos?|apelacion|apelar|recursos? de|reclamos?|quejas?|denuncia(?:r|ron|do)?|hostigamiento|acoso|maltrato|abandono de (?:cargo|puesto)|evaluacion(?:es)?|desempeno)\b/u,
];

const ASPECT_PATTERNS: readonly RegExp[] = [
  /\b(norma|normas|normativa|ley|leyes|decreto|decretos|reglamento|reglamentos|directiva|directivas|resolucion|resoluciones|articulo|articulos|numeral|inciso)\b/u,
  /\b(tramite|tramites|solicitud|solicitudes|expediente|procedimiento|procedimientos|requisito|requisitos|plazo|plazos|constancia|certificad[oa]s?|mesa de partes|informe escalafonario)\b/u,
  /\b(derecho|derechos|obligacion|obligaciones|deber|deberes|funcion|funciones|cargo)\b/u,
  /\b(reemplaz[ao]|reemplazar|sustituy[eo]|sustituir)\b/u,
  // Referencia a una norma por su número («DS 004-2013-ED», «RVM N.° 045»).
  /\b(?:d\.?\s?s|r\.?\s?v\.?\s?m|r\.?\s?m|r\.?\s?s\.?\s?g|r\.?\s?d|d\.?\s?l|d\.?\s?u)\.?\s*(?:n\.?\s*[°o]?\.?\s*)?\d/u,
];

const WEAK_PATTERNS: readonly RegExp[] = [
  // Roles y condición laboral del sector
  /\b(docentes?|profesor(?:a|es|as)?|profes?|maestr[oa]s?|auxiliar(?:es)?|directiv[oa]s?|director(?:a|es|as)?|dire|subdirector(?:a|es|as)?|jerarquic[oa]s?|coordinador(?:a|es|as)?|especialistas?|nombrad[oa]s?|contratad[oa]s?|cesantes?|pensionistas?|interin[oa]s?|provisional(?:es)?)\b/u,
  // Instituciones y contexto escolar
  /\b(ugel|minedu|dre|gerencia regional de educacion|institucion(?:es)? educativas?|ie|colegios?|cole|escuelas?|aulas?|clases?|alumn[oa]s?|estudiantes?|escolar(?:es)?|institucional|pedagogic[oa]s?|padres de familia|apoderad[oa]s?|matricula|siagie|siseve|cneb|curriculo|pei|mbdd|conei|magisterial|magisterio|carrera publica|sesion(?:es)? de aprendizaje|unidad(?:es)? didacticas?|programacion anual|prueba unica nacional|actuacion(?:es)?|actividad(?:es)? (?:escolar(?:es)?|del colegio|de la ie|institucional(?:es)?)|dia de la madre|dia del padre|dia del logro|dia del maestro|sutep|cafae|pronoei|cetpro|ceba|cebe|jec|tutoria|fut|pun|periodo de prueba|ingreso a la carrera)\b/u,
  // Condición laboral: una consulta sobre el propio trabajo es del ámbito
  // («Tengo covid, ¿debo ir a trabajar?», «¿me pueden obligar a…?»).
  /\b(trabaj(?:ar|o|os|ando)|labor(?:ar|al|ales)|centro de trabajo|empleador|obliga(?:r|rme|rnos|n|do|da)?|me corresponden?)\b/u,
];

function matchesAny(patterns: readonly RegExp[], normalized: string): boolean {
  return patterns.some((pattern) => pattern.test(normalized));
}

/** Nombra un proceso o situación concreta (la consulta tiene tema propio). */
export function hasTopicTerm(normalized: string): boolean {
  return matchesAny(TOPIC_PATTERNS, normalized);
}

/** Señal fuerte de dominio: un tema o un aspecto normativo/de trámite. */
export function hasStrongDomainSignal(normalized: string): boolean {
  return hasTopicTerm(normalized) || matchesAny(ASPECT_PATTERNS, normalized);
}

/** Señal débil: rol del sector o contexto escolar/institucional. */
export function hasWeakDomainSignal(normalized: string): boolean {
  return matchesAny(WEAK_PATTERNS, normalized);
}

/** Cualquier señal del ámbito educativo (fuerte o débil). */
export function hasDomainSignal(normalized: string): boolean {
  return hasStrongDomainSignal(normalized) || hasWeakDomainSignal(normalized);
}
