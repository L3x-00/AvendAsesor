/**
 * Clasificador de intención del turno de chat de AVEND ASESOR (Hito 3, Fase 1).
 *
 * Decide, de forma DETERMINISTA (sin IA ni embeddings), si un mensaje es:
 *  - `social`      → saludo / agradecimiento / acuse / despedida / anuncio de
 *                    consulta / pregunta de capacidad.
 *  - `out_of_scope`→ claramente ajeno al ámbito educativo de AVEND.
 *  - `domain`      → consulta que debe pasar por el RAG.
 *
 * Principio inviolable (evidence-only fail-closed): ante una señal fuerte de
 * dominio, mezcla saludo+consulta o duda razonable, el resultado es `domain`.
 * El carril social solo se activa cuando, al quitar la cortesía, no queda
 * sustancia; el ajeno solo con categorías inequívocas y sin contexto escolar.
 * Este módulo NO responde contenido normativo: solo enruta.
 */

import {
  hasDomainSignal,
  hasStrongDomainSignal,
  hasTopicTerm,
  hasWeakDomainSignal,
} from '../../rag/domain-lexicon';
import { refersBack } from '../../rag/anaphora';
import { normalizeSpanishText } from '../../rag/text-normalization';

export type TurnIntentLane = 'social' | 'domain' | 'out_of_scope';

export type SocialSubtype =
  | 'greeting'
  | 'thanks'
  | 'acknowledgment'
  | 'farewell'
  | 'ask_announcement'
  | 'capabilities'
  | 'catalog';

/**
 * Unión discriminada por `lane`: si `lane` es `social`, `subtype` es un
 * `SocialSubtype` (permite despachar la respuesta amable sin castear).
 */
export type TurnIntent =
  | { lane: 'social'; subtype: SocialSubtype }
  | { lane: 'domain'; subtype: 'domain_query' }
  | { lane: 'out_of_scope'; subtype: 'out_of_domain' };

export interface TurnIntentContext {
  /** El turno continúa una conversación existente del usuario. */
  inConversation?: boolean;
}

const DOMAIN: TurnIntent = { lane: 'domain', subtype: 'domain_query' };

/** Saludos (alternativas largas primero para no cortar "buenas tardes"). */
const GREETING =
  /\b(buenos dias|buenas tardes|buenas noches|buen dia|buenas|hola+|holi|ola|que tal|saludos|hey)\b/gu;
const THANKS =
  /\b(muchas gracias|muchisimas gracias|mil gracias|gracias|te lo agradezco|se lo agradezco|le agradezco|te agradezco|agradecid[oa]|muy amable|dios le pague|dios te pague|bendiciones)\b/gu;
const FAREWELL =
  /\b(adios|hasta luego|hasta pronto|hasta manana|hasta la proxima|nos vemos|chau|chao|bye|me despido|que tengas? (?:un )?buen dia|que le vaya bien|que te vaya bien|feliz dia|cuidese|cuidate)\b/gu;

/** Cortesía sin contenido que acompaña al saludo o al agradecimiento. */
const COURTESY =
  /\b(por favor|porfa|porfavor|estimad[oa]s?|disculpe(?:n)?(?: la molestia)?|disculpa(?: la molestia)?|oye|como (?:esta|estas|estan|le va|te va|les va|se encuentra|te encuentras|ha estado|has estado|va)|todo bien|estas ahi|esta ahi|hay alguien|un gusto|mucho gusto|amig[oa]s?|por todo|por la (?:informacion|info|respuesta|ayuda|orientacion|atencion)|por (?:tu|su) (?:ayuda|respuesta|orientacion|atencion|tiempo|paciencia)|por la ayuda|me (?:sirvio|ayudo)(?: mucho| bastante)?|fue (?:muy )?util|muy (?:clara|claro|util)(?: la respuesta)?|eso (?:es|era) todo|nada mas)\b/gu;

/** Vocativo: el nombre del asistente en la charla ("hola, AVEND"). */
const VOCATIVE = /\b(?:avend(?: asesor)?|asesor)\b/gu;

/** Presentación del usuario ("soy docente", "soy director de una IE"). */
const INTRODUCTION =
  /\b(?:yo )?soy (?:un |una |el |la )?(?:docente|profesora?|profe|maestr[oa]|auxiliar(?: de educacion)?|directora?|subdirectora?|directiv[oa]|coordinadora?|especialista)(?: de (?:educacion|inicial|primaria|secundaria|una? (?:ie|institucion educativa|colegio|escuela)|la ugel))?(?: nombrad[oa]| contratad[oa])?\b/gu;

/** Palabras que pueden quedar tras quitar la cortesía sin aportar consulta. */
const SOCIAL_RESIDUE_WORDS = new Set([
  'a',
  'de',
  'el',
  'la',
  'lo',
  'los',
  'las',
  'y',
  'e',
  'que',
  'tal',
  'su',
  'tu',
  'ti',
  'usted',
  'ustedes',
  'muchas',
  'muchisimas',
  'mil',
  'muy',
  'bien',
  'todo',
  'todos',
  'dia',
  'dias',
  'tardes',
  'noches',
  'colega',
  'colegas',
  'profe',
  'profesor',
  'profesora',
  'senor',
  'senora',
  'senorita',
  'nuevo',
  'nuevamente',
  'igualmente',
  'otra',
  'vez',
  'hola',
  'bueno',
  'buena',
  'ok',
  'okey',
  'si',
  'pues',
  'ya',
  'ah',
  'oh',
  'jaja',
  'jeje',
  // Acuses que suelen acompañar al agradecimiento o la despedida.
  'perfecto',
  'listo',
  'entendido',
  'excelente',
  'genial',
  'claro',
  'vale',
  'conforme',
  'super',
]);

/** Acuse de recibo que cierra un turno (se responde como agradecimiento breve). */
const ACKNOWLEDGMENT =
  /^(?:(?:ok|okey|okay|oki|ya|bien|vale|listo|perfecto|entendido|entiendo|comprendido|de acuerdo|conforme|excelente|genial|muy bien|claro|dale|ya veo|super|chevere|bacan|jaja+|jeje+)\s*)+(?:(?:muchas|muchisimas|mil) )?(?:gracias)?$/u;

/** "Tengo una consulta", "¿me puedes ayudar?": anuncia una consulta sin decirla. */
const ASK_ANNOUNCEMENT =
  /^(?:(?:tengo|tenia|quisiera|quiero|queria|deseo|necesito|me gustaria)(?: hacer(?:te|le)?| realizar)? (?:una |un |unas |algunas |otra )?(?:consulta|consultita|pregunta|duda)s?|(?:necesito|quisiera|busco) (?:ayuda|orientacion|asesoria)|(?:me |nos )?(?:puedes|podrias|puede|podria) (?:ayudar|orientar|asesorar)(?:me|nos)?|(?:una|otra) (?:consulta|pregunta)|(?:(?:tengo|quisiera hacer|quiero hacer) )?(?:una |otra )?(?:nueva|otra) (?:consulta|pregunta)|otro tema|(?:cambiando|cambio) de tema|(?:ahora )?(?:quiero|quisiera) (?:preguntar|consultar) otra cosa)$/u;

/** Preguntas sobre la identidad o el alcance de AVEND. */
const CAPABILITIES =
  /\b(que puedes hacer|que sabes hacer|que haces$|que sabes$|quien eres|que eres|eres (?:un|una) (?:robot|persona|humano|humana|bot|ia|inteligencia artificial|maquina|asistente)|eres (?:chatgpt|gpt|real)|con quien (?:hablo|estoy hablando)|para que sirves|para que sirve (?:esto|esta pagina|este chat|avend|la aplicacion|esta aplicacion|esta app|este sistema|la plataforma$|esta plataforma$)|en que (?:me )?(?:puedes ayudar(?:me)?|ayudas|me ayudas)|en que temas (?:me )?(?:ayudas|puedes ayudar)|con que (?:me )?puedes ayudar|como (?:me )?(?:puedes ayudar|ayudas)$|como funcionas|como te uso|como se usa$|que es avend|cual es tu funcion|de que puedes hablar|que temas (?:manejas|conoces|sabes|abarcas|tratas|atiendes|cubres)|de que temas sabes|que (?:tipo|clase) de (?:preguntas|consultas) (?:respondes|atiendes|puedo hacer(?:te)?)|sobre que (?:te )?puedo (?:preguntar(?:te)?|consultar(?:te)?)|que (?:modulos|temas) (?:hay|tienes)|^ayuda(?:me)?(?: por favor)?$|^(?:menu|opciones)$)\b/u;

/**
 * El rol dicho como contexto de una pregunta de capacidad («¿en qué me ayudas
 * como auxiliar de educación?», «¿qué haces por los docentes?»).
 */
const ROLE_AS_CONTEXT =
  /\b(?:como|a|por|para)(?: (?:los|las|un|una|el|la))? (?:docentes?|profesor(?:a|es|as)?|maestr[oa]s?|auxiliar(?:es)?(?: de educacion)?|directiv[oa]s?|director(?:a|es|as)?|subdirector(?:a|es|as)?)\b/gu;

/** Lo único que puede acompañar a una pregunta de capacidad sin volverla consulta. */
const CAPABILITY_RESIDUE_WORDS = new Set([
  ...SOCIAL_RESIDUE_WORDS,
  'me',
  'hoy',
  'aqui',
  'y',
  'tu',
  'usted',
  'puedes',
  'ayudar',
  'ayudarme',
  'yo',
  'por',
  'mi',
  'para',
  'exactamente',
  'hacer',
  'puede',
]);

/**
 * Pregunta por el catálogo: qué documentos o información hay y qué conviene
 * preguntar («¿de qué tienes información?», «¿qué documentos hay?»,
 * «preguntas frecuentes»). No es una consulta normativa: se responde con la
 * lista real de documentos disponibles, sin pasar por el RAG.
 */
const CATALOG =
  /\b((?:de|sobre) (?:que|cuales) (?:temas |documentos |normas )?(?:tienes|tiene|hay|manejas|cuentas con|dispones de) (?:informacion|documentos|datos|fuentes|normas)|(?:de|sobre) que (?:tienes|tiene|hay) informacion|que (?:informacion|documentos|normas|normativas?|fuentes|leyes|resoluciones|archivos|materiales) (?:tienes|tiene|hay|manejas|conoces|cargaron|estan (?:disponibles|cargad[oa]s)|puedo consultar)|con que (?:documentos|informacion|fuentes|normas) (?:cuentas|trabajas|respondes)|(?:lista|listado|catalogo|relacion) de (?:los |las )?(?:documentos|normas|fuentes)|(?:muestrame|dame|dime|ensename|indicame|mostrar) (?:la lista de |el listado de |los |las )?(?:documentos|normas|fuentes)|que (?:puedo|se puede) (?:consultar(?:te)?|preguntar(?:te)?)|(?:preguntas|consultas) (?:frecuentes|recomendadas|sugeridas|de ejemplo)|que (?:preguntas|consultas) (?:puedo hacer(?:te)?|me recomiendas|me sugieres)|que me (?:recomiendas|sugieres) (?:preguntar|consultar)|(?:dame|dime) (?:algunos |unos )?ejemplos de (?:preguntas|consultas))\b/u;

/**
 * Lo único que puede acompañar a una pregunta de catálogo sin volverla
 * consulta. Lista propia y corta (sin roles, "hacer", "para" ni conectores):
 * «¿qué documentos tiene que hacer el profesor?» o «¿qué resoluciones hay para
 * los docentes?» son consultas y siguen al RAG.
 */
const CATALOG_RESIDUE_WORDS = new Set([
  'a',
  'de',
  'el',
  'los',
  'las',
  'que',
  'me',
  'mi',
  'tu',
  'usted',
  'puedes',
  'puede',
  'por',
  'hoy',
  'aqui',
  'actualmente',
  'ahora',
  'cargados',
  'cargadas',
  'disponibles',
  'disponible',
  'en',
  'esta',
  'este',
  'hay',
  'la',
  'plataforma',
  'sistema',
  'todos',
  'todas',
  'tienes',
  'tus',
  'base',
  'datos',
  'podrias',
  'favor',
]);

/** Cláusula condicional/causal: convierte una pregunta en consulta ("…si no me pagan"). */
const CONDITIONAL_CLAUSE = /\b(si|cuando|en caso|porque|aunque)\b/u;

/**
 * Temas inequívocamente ajenos. Solo se aplican si el mensaje NO trae ninguna
 * señal del ámbito educativo (rol, contexto escolar, proceso o aspecto
 * normativo): "el clima institucional", "receta médica" o "el partido del
 * colegio" siguen siendo consultas del ámbito.
 */
const OUT_OF_SCOPE_PATTERNS: readonly RegExp[] = [
  // Clima
  /\b(que tiempo hace|el clima|va a llover|pronostico del tiempo|la temperatura (?:de|en|hoy|manana))\b/u,
  // Deportes
  /\b(futbol|la champions|mundial de|quien gano|resultado del partido|el clasico|eliminatorias|la seleccion peruana|nba)\b/u,
  // Cocina
  /\b(receta (?:de|para) (?:cocina|preparar|cocinar|hacer)|receta de (?:un|una|el|la|lomo|arroz|pollo|torta|pastel|ceviche|pan)|como (?:cocinar|preparar|preparo|cocino|hago) (?:un|una|el|la) (?:ceviche|torta|pastel|arroz|lomo|pollo|pan|postre|comida)|ingredientes para)\b/u,
  // Entretenimiento y redacción creativa
  /\b(peliculas?|serie de netflix|series de netflix|netflix|una cancion|letra de una cancion|un chiste|cuentame un chiste|horoscopo|signo zodiacal|tarot|videojuegos?|tiktok)\b/u,
  /\b(escribe(?:me)?|hazme|redacta(?:me)?|creame|inventa(?:me)?) (?:un|una) (?:poema|cuento|cancion|carta de amor|historia|rap|chiste|novela)\b/u,
  /\b(genera(?:me)?|dibuja(?:me)?|crea(?:me)?) (?:una )?(?:imagen|foto|dibujo|logo)\b/u,
  // Tareas escolares ajenas, cálculo y traducción
  /\b(resuelve (?:esta|la|el|este) (?:ecuacion|ejercicio de|integral|derivada|problema de matematica)|cuanto es \d+ ?(?:por|mas|menos|entre|x|\*|\+|-|\/) ?\d+|haz(?:me)? la tarea|traduce(?:me)?|como se dice .+ en (?:ingles|frances|quechua|portugues))\b/u,
  // Tecnología y programación
  /\b(codigo en|en python|javascript|programa en|instalo whatsapp|instalar whatsapp|mi celular|mi laptop|mi computadora|mi pc|formatear)\b/u,
  // Política
  /\b(por quien voto|por quien votar|que opinas del presidente|candidatos? presidencial(?:es)?|el presidente de la republica|partido politico|congresistas?)\b/u,
  // Salud personal y vida privada
  /\b(me duele|que pastilla|que medicamento|tengo (?:gripe|fiebre|tos|covid|dolor)|sintomas de|bajar de peso|bajo de peso|conseguir novia|consigo novia|mi esposo me engana|mi esposa me engana)\b/u,
  // Trámites civiles y finanzas personales ajenos al sector
  /\b((?:saco|sacar|tramito|tramitar|renuevo|renovar) (?:mi |el )?(?:dni|pasaporte|brevete)|bitcoin|criptomonedas?|precio del dolar|tipo de cambio|bolsa de valores|impuesto a la renta|prestamo en el banco)\b/u,
  // Cultura general
  /\b(capital de (?:francia|espana|italia|alemania|japon|china|un pais)|quien es messi|quien es shakira|cuantos planetas|sistema solar)\b/u,
  /^[¿¡\s]*(?:disculpa,? |oye,? )?que hora es\s*[?!.]*$/u,
];

const EMOJI = /\p{Extended_Pictographic}|[:;]-?[)(dDpP]/u;
const WAVE = /👋|🙋/u;

function isOutOfScope(normalized: string): boolean {
  const substance = withoutCourtesy(normalized);
  return OUT_OF_SCOPE_PATTERNS.some(
    (pattern) => pattern.test(normalized) || pattern.test(substance),
  );
}

function stripped(value: string, ...patterns: RegExp[]): string {
  return patterns
    .reduce((text, pattern) => text.replace(pattern, ' '), value)
    .replace(/[^a-z0-9 ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Un mensaje es "puramente social" cuando trae un saludo/agradecimiento/
 * despedida y, al quitar la cortesía y la presentación, solo quedan palabras de
 * relleno social. Lista blanca cerrada (fail-closed): "hola, falté ayer" o
 * "buenas, jubilación" conservan sustancia y no son charla.
 */
function detectPureSocial(normalized: string): SocialSubtype | null {
  const greeting = new RegExp(GREETING.source, 'u').test(normalized);
  const thanks = new RegExp(THANKS.source, 'u').test(normalized);
  const farewell = new RegExp(FAREWELL.source, 'u').test(normalized);
  if (!greeting && !thanks && !farewell) {
    // Cortesía sola ("¿cómo estás?", "¿todo bien?") equivale a un saludo.
    return new RegExp(COURTESY.source, 'u').test(normalized) &&
      !stripped(normalized, COURTESY, VOCATIVE)
      ? 'greeting'
      : null;
  }

  const residue = stripped(
    normalized,
    FAREWELL,
    THANKS,
    GREETING,
    COURTESY,
    VOCATIVE,
    INTRODUCTION,
  );
  const residueWords = residue ? residue.split(' ') : [];
  if (residueWords.some((word) => !SOCIAL_RESIDUE_WORDS.has(word))) {
    return null;
  }

  if (thanks) return 'thanks';
  if (farewell) return 'farewell';
  return 'greeting';
}

/** «hay que…», «tiene que…»: una obligación, no una pregunta por el catálogo. */
const OBLIGATION = /\b(?:hay|tiene|tienen|tienes|tengo) que\b/u;

/** Verbos que preguntan por el propio asistente, no por un tema en curso. */
const SELF_REFERENCE =
  /\b(?:tienes|manejas|conoces|cuentas|dispones|trabajas|respondes|cargaron|disponibles?|cargad[oa]s|lista|listado|catalogo|frecuentes|recomendadas|sugeridas|recomiendas|sugieres|ejemplos?|consultarte|preguntarte|hacerte)\b/u;

function isCatalogRequest(
  normalized: string,
  context: TurnIntentContext,
): boolean {
  const plain = normalized
    .replace(/[^a-z0-9 ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (
    !CATALOG.test(plain) ||
    CONDITIONAL_CLAUSE.test(normalized) ||
    OBLIGATION.test(plain) ||
    // «¿Y qué normas hay?» continúa el tema anterior.
    /^(?:y|e|pero|entonces|o sea)\b/u.test(plain) ||
    // Dentro de una conversación, «¿qué normas hay?» se lee con el tema en
    // curso: solo cuenta como catálogo si pregunta por el propio asistente.
    (context.inConversation && !SELF_REFERENCE.test(plain))
  ) {
    return false;
  }
  return stripped(
    plain,
    new RegExp(CATALOG.source, 'gu'),
    GREETING,
    COURTESY,
    VOCATIVE,
    THANKS,
    INTRODUCTION,
  )
    .split(' ')
    .every((word) => !word || CATALOG_RESIDUE_WORDS.has(word));
}

/** Resto del mensaje sin saludo ni cortesía, para reglas de frase completa. */
function withoutCourtesy(normalized: string): string {
  return stripped(normalized, GREETING, COURTESY, VOCATIVE, THANKS);
}

function isFollowUpShaped(normalized: string): boolean {
  const words = normalized
    .replace(/[^a-z0-9 ]+/gu, ' ')
    .trim()
    .split(/\s+/u);
  return (
    /^(?:y|e|pero|entonces|o sea)\b/u.test(words.join(' ')) || words.length <= 8
  );
}

/**
 * Clasifica el turno. Orden fail-closed: señal fuerte de dominio primero (nunca
 * dejar pasar una consulta como charla), luego charla pura, acuse, anuncio de
 * consulta, capacidad, contexto educativo, ajeno explícito y, ante cualquier
 * duda, dominio (para que el RAG resuelva con sustento).
 */
export function classifyTurnIntent(
  message: string,
  context: TurnIntentContext = {},
): TurnIntent {
  const normalized = normalizeSpanishText(message)
    // "licencia de conducir" no es una licencia laboral.
    .replace(/\blicencia de conducir\b/gu, 'brevete');

  if (!/[\p{L}\p{N}]/u.test(normalized)) {
    // Solo emojis o signos: un emoji es un acuse ("👍") o un saludo ("👋");
    // signos sueltos ("¿?") siguen al RAG por seguridad.
    if (WAVE.test(message)) return { lane: 'social', subtype: 'greeting' };
    if (EMOJI.test(message)) {
      return { lane: 'social', subtype: 'acknowledgment' };
    }
    return DOMAIN;
  }

  // Antes de la señal fuerte de dominio: «¿qué normas tienes?» nombra "normas"
  // pero no es una consulta normativa. Con cualquier tema añadido («¿qué
  // normas tienes sobre licencias?») el resto no pasa la lista blanca y sigue
  // al RAG (fail-closed).
  if (isCatalogRequest(normalized, context)) {
    return { lane: 'social', subtype: 'catalog' };
  }

  if (hasStrongDomainSignal(normalized)) return DOMAIN;

  const pureSocial = detectPureSocial(normalized);
  if (pureSocial) return { lane: 'social', subtype: pureSocial };

  const plain = normalized
    .replace(/[^a-z0-9 ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (ACKNOWLEDGMENT.test(plain)) {
    return {
      lane: 'social',
      subtype: /\bgracias$/u.test(plain) ? 'thanks' : 'acknowledgment',
    };
  }

  const substance = withoutCourtesy(normalized);
  if (ASK_ANNOUNCEMENT.test(substance)) {
    return { lane: 'social', subtype: 'ask_announcement' };
  }

  // Una pregunta de capacidad que además nombra algo del ámbito («¿qué sabes
  // de la carrera pública magisterial?») es una consulta: va al RAG. La
  // presentación del usuario («soy directora, ¿en qué me ayudas?») no cuenta.
  if (
    CAPABILITIES.test(plain) &&
    !CONDITIONAL_CLAUSE.test(normalized) &&
    !/^(?:y|e|pero)\b/u.test(plain) &&
    !hasWeakDomainSignal(
      stripped(
        normalized,
        GREETING,
        COURTESY,
        VOCATIVE,
        INTRODUCTION,
        ROLE_AS_CONTEXT,
      ),
    ) &&
    stripped(
      plain,
      new RegExp(CAPABILITIES.source, 'gu'),
      GREETING,
      COURTESY,
      VOCATIVE,
      THANKS,
      INTRODUCTION,
      ROLE_AS_CONTEXT,
    )
      .split(' ')
      .every((word) => !word || CAPABILITY_RESIDUE_WORDS.has(word))
  ) {
    return { lane: 'social', subtype: 'capabilities' };
  }

  if (hasDomainSignal(normalized)) return DOMAIN;

  if (isOutOfScope(normalized)) {
    // Dentro de una conversación, un seguimiento breve ("¿y si es por el
    // clima?") se interpreta con el contexto previo, no como tema ajeno.
    if (context.inConversation && isFollowUpShaped(normalized)) return DOMAIN;
    return { lane: 'out_of_scope', subtype: 'out_of_domain' };
  }

  return DOMAIN;
}

/**
 * Indica si el mensaje trae alguna señal del ámbito educativo. El chat la usa
 * para distinguir, cuando el RAG no encuentra sustento, una consulta del ámbito
 * sin documentos (se registra) de un pedido sin relación aparente (se orienta
 * sobre el alcance sin crear conversación).
 */
export function hasEducationalSignal(message: string): boolean {
  return hasDomainSignal(normalizeSpanishText(message));
}

/** Aspecto de trámite sin tema: requisitos, plazo, documentos, dónde presentar… */
const TOPICLESS_ASPECT =
  /\b(requisitos?|plazos?|tramites?|procedimientos?|pasos|documentos?|formatos?|costos?|solicitud(?:es)?|como (?:lo |la )?(?:solicito|pido|tramito|presento|hago)|donde (?:lo |la )?(?:presento|solicito|pido|tramito)|a quien (?:le )?(?:presento|solicito|pido)|cuanto (?:tiempo )?(?:demora|tarda|dura))\b/u;
const MAX_TOPICLESS_WORDS = 9;
/**
 * Palabras que no dicen de qué trámite se trata: interrogativos, artículos,
 * preposiciones, verbos genéricos y los propios aspectos del trámite. Si al
 * quitarlas queda algo («para ser director», «la PUN», «periodo de prueba»),
 * la consulta tiene tema y va al RAG.
 */
const TOPICLESS_FILLER = new Set(
  (
    'cual cuales que como donde cuando cuanto cuanta cuantos cuantas quien quienes ' +
    'a al de del el la los las lo le les un una unos unas para por en con sobre ante ' +
    'y o u es son ser sera esta estan este ese esa eso hay se me mi mis tu su sus mas ' +
    'requisito requisitos plazo plazos tramite tramites procedimiento procedimientos ' +
    'paso pasos documento documentos formato formatos costo costos solicitud solicitudes ' +
    'presentar presento presenta pedir pido piden solicitar solicito tramitar tramito ' +
    'hacer hago necesito necesita necesitan necesarios necesarias exige exigen debo debe ' +
    'deben puedo puede tengo tiene tienen tiempo demora tarda dura entregar entrego llevar ' +
    'llevo adjuntar cumplir cumplo minimo maximo exactamente dias habiles hay'
  ).split(' '),
);

/**
 * Primera consulta que pregunta por un aspecto de trámite sin decir de qué
 * trámite se trata ("¿Cuáles son los requisitos?", "¿Cuál es el plazo para
 * presentar la solicitud?"). Hay tantas interpretaciones como procesos, así que
 * se pide precisar el tema antes de buscar (Hito 3, puntos 5 y 12). Una norma
 * con número o una consulta larga siguen al RAG.
 */
export function isTopiclessQuestion(message: string): boolean {
  const normalized = normalizeSpanishText(message);
  if (/\d/u.test(normalized) || hasTopicTerm(normalized)) return false;
  if (!TOPICLESS_ASPECT.test(normalized)) return false;
  // La cortesía y la presentación no aportan tema.
  const words = stripped(
    stripped(
      normalized,
      GREETING,
      COURTESY,
      THANKS,
      INTRODUCTION,
      /\b(?:una|otra) (?:consulta|pregunta)\b/gu,
      /\bavend(?: asesor)?\b/gu,
    ),
    /^asesor\b/u,
  )
    .split(' ')
    .filter(Boolean);
  return (
    words.length <= MAX_TOPICLESS_WORDS &&
    words.every((word) => TOPICLESS_FILLER.has(word))
  );
}

const EXPLICIT_TOPIC_CHANGE =
  /\b(otra consulta|otra pregunta|nueva consulta|nueva pregunta|otro tema|cambiando de tema|cambio de tema|aparte de eso|dejando eso de lado|ahora (?:quiero|quisiera|necesito|deseo) (?:saber|consultar|preguntar))\b/u;

/**
 * El usuario anuncia que cambia de tema ("otra consulta: …", "cambiando de
 * tema…"). La consulta se busca y responde sin arrastrar el tema anterior.
 */
export function announcesNewTopic(message: string): boolean {
  return EXPLICIT_TOPIC_CHANGE.test(normalizeSpanishText(message));
}

/**
 * El anuncio de tema nuevo trae su propio tema ("otra consulta: ¿cuántos días
 * de vacaciones tengo?"). Si lo que sigue es elíptico ("otra pregunta: ¿y si
 * soy contratado?"), sigue dependiendo de la conversación y no se corta.
 */
export function announcesNewTopicWithSubject(message: string): boolean {
  const normalized = normalizeSpanishText(message);
  if (!EXPLICIT_TOPIC_CHANGE.test(normalized)) return false;
  const rest = stripped(
    normalized,
    new RegExp(EXPLICIT_TOPIC_CHANGE.source, 'gu'),
  );
  if (!rest || /^(?:y|e|pero|entonces)\b/u.test(rest)) return false;
  if (refersBack(rest)) return false;
  // Solo palabras genéricas ("ahora quiero saber cuál es el plazo"): depende
  // de la conversación. Cualquier otra sustancia ("el perfil del cargo de jefe
  // de taller") es un tema propio, esté o no en el léxico.
  return !rest.split(' ').every((word) => TOPICLESS_FILLER.has(word));
}
