/**
 * Clasificador de intención del turno de chat de AVEND ASESOR (Hito 3, Fase 1).
 *
 * Decide, de forma DETERMINISTA (sin IA ni embeddings), si un mensaje es:
 *  - `social`      → saludo / agradecimiento / despedida / pregunta de capacidad.
 *  - `out_of_scope`→ claramente ajeno al ámbito educativo de AVEND.
 *  - `domain`      → consulta del ámbito educativo que debe pasar por el RAG.
 *
 * Principio inviolable (evidence-only fail-closed): ante CUALQUIER señal de
 * dominio, mezcla saludo+consulta o duda razonable, el resultado es `domain`.
 * El carril social/out_of_scope solo se activa cuando el mensaje es
 * inequívocamente social o ajeno. Este módulo NO responde contenido normativo:
 * solo enruta. La respuesta amable y el cableado al stream son de la Fase 2.
 */

export type TurnIntentLane = 'social' | 'domain' | 'out_of_scope';

export type SocialSubtype = 'greeting' | 'thanks' | 'farewell' | 'capabilities';

/**
 * Unión discriminada por `lane`: si `lane` es `social`, `subtype` es un
 * `SocialSubtype` (permite despachar la respuesta amable sin castear).
 */
export type TurnIntent =
  | { lane: 'social'; subtype: SocialSubtype }
  | { lane: 'domain'; subtype: 'domain_query' }
  | { lane: 'out_of_scope'; subtype: 'out_of_domain' };

/** Minúsculas, sin tildes y espacios colapsados (público 30+ suele omitir tildes). */
function normalizeIntentText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Léxico del ámbito educativo (docentes, auxiliares de educación, directivos).
 * Términos ya sin tildes porque se evalúan sobre el texto normalizado. Su función
 * es SOBREPONERSE a lo social/ajeno cuando aparece una señal de dominio real
 * (cubre el punto 11: saludo + consulta ⇒ prevalece la consulta).
 */
const DOMAIN_PATTERNS: readonly RegExp[] = [
  // Roles y condición laboral del sector educativo
  /\b(docente|docentes|profesor|profesora|profesores|maestr[oa]s?|auxiliar|auxiliares|directiv[oa]s?|director|directora|subdirector|subdirectora|jerarquic[oa]s?|nombrad[oa]s?|contratad[oa]s?|cesantes?|pensionistas?)\b/u,
  // Procesos de personal
  /\b(destaque|reasignacion|reasignaciones|encargatura|encargo|permuta|rotacion|nombramiento|contratacion|ascenso|reincorporacion|reingreso|permanencia|escalafon)\b/u,
  // Licencias, permisos e inasistencias
  /\b(licencia|licencias|permiso|permisos|inasistencia|inasistencias|tardanza|tardanzas|falta|faltas|vacaciones|descanso|subsidio|luto|maternidad|paternidad)\b/u,
  // Remuneración y beneficios
  /\b(remuneracion|remuneraciones|sueldo|haberes|bonificacion|bonificaciones|cts|pension|pensiones|descuento|descuentos|aguinaldo)\b/u,
  // Régimen disciplinario y recursos
  /\b(cese|renuncia|sancion|sanciones|amonestacion|suspension|destitucion|disciplinari[oa]|apelacion|apelar|recurso|reclamo|queja|denuncia)\b/u,
  // Marco normativo
  /\b(norma|normas|normativa|ley|leyes|decreto|decretos|reglamento|reglamentos|directiva|directivas|resolucion|resoluciones|articulo|articulos|numeral|inciso)\b/u,
  // Trámite y requisitos
  /\b(tramite|tramites|solicitud|solicitudes|expediente|procedimiento|procedimientos|requisito|requisitos|plazo|plazos|constancia|certificad[oa]s?)\b/u,
  // Derechos, deberes y funciones
  /\b(derecho|derechos|obligacion|obligaciones|deber|deberes|funcion|funciones|cargo|jornada|concurso|evaluacion|plaza|plazas|vacante|vacantes)\b/u,
  // Entidades e instituciones del sector
  /\b(ugel|minedu|dre|gerencia regional de educacion|institucion educativa|matricula)\b/u,
  // Acción administrativa típica sobre un cargo
  /\b(reemplaz[ao]|reemplazar|sustituy[eo]|sustituir|encarga(?:r|do|tura)?)\b/u,
  // Procesos y beneficios adicionales del régimen educativo
  /\b(designacion|designaciones|adjudicacion|adjudicaciones|cuadro de meritos|comision de servicios?|abandono de (?:cargo|puesto)|gratificacion|gratificaciones|escolaridad|asignacion|sepelio|papeleta)\b/u,
  // Situaciones, condiciones laborales y sistemas del sector
  /\b(hostigamiento|acoso|maltrato|interin[oa]s?|provisional(?:es)?|cas|mesa de partes|siagie)\b/u,
];

/** Saludos, agradecimientos, despedidas y preguntas de capacidad (puramente sociales). */
const GREETING =
  /\b(hola+|buenas|buenos dias|buenas tardes|buenas noches|buen dia|que tal|saludos|hey|holi|ola)\b/u;
const THANKS =
  /\b(gracias|te lo agradezco|te agradezco|agradecid[oa]|muy amable)\b/u;
const FAREWELL =
  /\b(adios|hasta luego|hasta pronto|nos vemos|chau|chao|bye|me despido|hasta la proxima)\b/u;
const CAPABILITIES =
  /\b(que puedes hacer|que sabes hacer|que haces|quien eres|que eres|para que sirves|en que (?:me )?puedes ayudar|como funcionas|que es avend|cual es tu funcion|de que puedes hablar|como me puedes ayudar|necesito ayuda|^ayuda$)\b/u;

/** Temas inequívocamente ajenos al ámbito de AVEND. Conservador a propósito. */
const OUT_OF_SCOPE_PATTERNS: readonly RegExp[] = [
  /\b(que tiempo hace|el clima|va a llover|pronostico del tiempo|la temperatura de)\b/u,
  /\b(futbol|la champions|mundial de|quien gano el partido|resultado del partido|nba|tenis)\b/u,
  /\b(receta|como cocinar|como preparar|ingredientes para)\b/u,
  /\b(pelicula|serie de netflix|una cancion|un chiste|cuentame un chiste|horoscopo|signo zodiacal)\b/u,
  /\b(bitcoin|criptomoneda|precio del dolar|bolsa de valores)\b/u,
];

/** Ruido social a descartar para medir cuánta sustancia queda en el mensaje. */
const SOCIAL_STRIP = new RegExp(
  [GREETING, THANKS, FAREWELL].map((pattern) => pattern.source).join('|'),
  'gu',
);
const FILLER_STRIP =
  /\b(por favor|porfa|porfavor|avend|asesor|estimad[oa]s?|disculpa|disculpe|oye|como estas|como va|todo bien|un gusto|amig[oa])\b/gu;

function hasDomainSignal(normalized: string): boolean {
  return DOMAIN_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isOutOfScope(normalized: string): boolean {
  return OUT_OF_SCOPE_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * Un mensaje es "puramente social" cuando contiene un saludo/agradecimiento/
 * despedida y, al quitar ese ruido social, apenas queda sustancia (≤ 2 palabras).
 * Así "hola" o "muchas gracias" son sociales, pero "hola, ¿cuál es el plazo?"
 * no lo es (queda sustancia) y cae al carril de dominio.
 */
function detectPureSocial(normalized: string): SocialSubtype | null {
  const greeting = GREETING.test(normalized);
  const thanks = THANKS.test(normalized);
  const farewell = FAREWELL.test(normalized);
  if (!greeting && !thanks && !farewell) return null;

  const residue = normalized
    .replace(SOCIAL_STRIP, ' ')
    .replace(FILLER_STRIP, ' ')
    .replace(/[^a-z0-9 ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const residueWords = residue ? residue.split(' ').filter(Boolean) : [];
  if (residueWords.length > 2) return null;

  if (thanks) return 'thanks';
  if (farewell) return 'farewell';
  return 'greeting';
}

/**
 * Clasifica el turno. Orden fail-closed: dominio primero (nunca dejar pasar una
 * consulta como charla), luego social puro, capacidad, ajeno explícito y, ante
 * cualquier duda, dominio (para que el RAG resuelva con sustento).
 */
export function classifyTurnIntent(message: string): TurnIntent {
  const normalized = normalizeIntentText(message);
  if (!normalized) {
    return { lane: 'domain', subtype: 'domain_query' };
  }

  if (hasDomainSignal(normalized)) {
    return { lane: 'domain', subtype: 'domain_query' };
  }

  const pureSocial = detectPureSocial(normalized);
  if (pureSocial) {
    return { lane: 'social', subtype: pureSocial };
  }

  if (CAPABILITIES.test(normalized)) {
    return { lane: 'social', subtype: 'capabilities' };
  }

  if (isOutOfScope(normalized)) {
    return { lane: 'out_of_scope', subtype: 'out_of_domain' };
  }

  return { lane: 'domain', subtype: 'domain_query' };
}
