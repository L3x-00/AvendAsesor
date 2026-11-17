import { normalizeSpanishText } from './text-normalization';

/** Pronombres y giros que siempre remiten a lo ya hablado. */
const ALWAYS_REFERS_BACK =
  /\b(?:ese|esa|eso|esos|esas|esto|ello|aquel|aquella|aquello|aquellos|aquellas|lo mismo)\b/u;

/** «dicho trámite» remite a lo anterior; «¿qué ha dicho el MINEDU?» no. */
const SAID =
  /(?<!\b(?:ha|han|he|has|hemos|haber|habia|habian|hubiera|hubiese)\s)\bdich[oa]s?\b/u;

/**
 * «el mismo trámite» remite a lo anterior; «dentro de la misma UGEL», «en el
 * mismo colegio» o «a la misma vez» no.
 */
const SAME =
  /(?<!\b(?:en|de|a|con|desde|hasta|dentro de)\s)\b(?:el|la|los|las)\s+mism[oa]s?\s+(?!(?:tiempo|vez|forma|manera|modo|hora|dia|fecha)\b)[a-z]/u;

/** Conectores con que empieza un seguimiento («¿y estos descuentos…?»). */
const LEADING_CONNECTOR = '(?:(?:y|e|o|pero|entonces|ademas|tambien)\\s+)?';
const PREPOSITION =
  'por|para|durante|en|con|sobre|de|del|desde|hasta|segun|tras|a|al|ante|bajo|contra|mediante|sin';

/**
 * Demostrativo que abre la frase o sigue a una preposición («¿esta licencia
 * es con goce?», «durante este destaque»). Dentro de la frase, «esta» sin
 * tilde es casi siempre el verbo («la UGEL me esta descontando»).
 */
const OPENING_DEMONSTRATIVE = new RegExp(
  `^${LEADING_CONNECTOR}(este|esta|estos|estas)\\s+([a-z]+)`,
  'u',
);
const DEMONSTRATIVE_AFTER_PREPOSITION = new RegExp(
  `\\b(?:${PREPOSITION})\\s+(?:este|esta|estos|estas)\\s+([a-z]+)`,
  'u',
);

/** «este año», «esta mañana»: tiempo presente, no remiten a lo anterior. */
const TEMPORAL =
  /^(?:ano|anos|mes|meses|semana|semanas|dia|dias|manana|tarde|noche|vez|momento|periodo|ciclo|bimestre|trimestre|semestre|verano|invierno|lunes|martes|miercoles|jueves|viernes|sabado|domingo|fin)$/u;

/** Sustantivos en -ada/-ida que no son participios («esta medida»). */
const NOUNS_LIKE_PARTICIPLES =
  /^(?:medida|medidas|jornada|jornadas|partida|partidas|salida|salidas|entrada|entradas|llegada|temporada|vida|comida|unidad|unidades)$/u;

/**
 * Lectura verbal de «esta/estas» al abrir la frase («¿esta permitido…?»,
 * «¿esta vigente…?», «¿esta bien que…?»): participio, gerundio, adjetivo de
 * estado, artículo, pronombre o preposición detrás.
 */
const VERB_COMPLEMENT =
  /^(?:[a-z]+(?:ad|id)[oa]s?|[a-z]+(?:ando|iendo|yendo)|(?:sujet|exent|afect|previst|dispuest|inscrit|abiert|cubiert|escrit|hech|impres|incurs|enferm|apt|list|segur)[oa]s?|vigentes?|pendientes?|vacantes?|libres?|el|la|los|las|lo|le|les|me|te|se|nos|un|una|mi|su|sus|tu|en|de|a|al|con|por|para|sin|bien|mal|como|muy|ya|todavia|aun|siempre|ahi|aqui)$/u;

/** «está/están/estás» con tilde: siempre el verbo estar. */
const ACCENTED_VERB = /(?<!\p{L})est(?:á|án|ás)(?!\p{L})/giu;

function openingDemonstrativeRefersBack(
  demonstrative: string,
  next: string,
): boolean {
  if (TEMPORAL.test(next)) return false;
  if (
    demonstrative.startsWith('esta') &&
    !NOUNS_LIKE_PARTICIPLES.test(next) &&
    VERB_COMPLEMENT.test(next)
  ) {
    return false;
  }
  return true;
}

/**
 * El turno remite al hilo sin pronombre: «lo que estábamos hablando», «de lo
 * que hablábamos», «lo comentado». Son elipsis de tema: el sustantivo que las
 * acompaña («situación», «caso») no identifica ningún trámite por sí solo.
 */
const THREAD_REFERENCE =
  /\blo\s+que\s+(?:estabamos|estuvimos|estabais|venimos|hemos estado)\s+(?:hablando|comentando|conversando|tratando)\b|\blo\s+que\s+(?:hablabamos|comentabamos|conversabamos|tratabamos)\b|\blo\s+(?:hablado|comentado|conversado|tratado)\b|\bde\s+lo\s+que\s+(?:hablabamos|comentabamos|conversabamos|tratabamos|hablamos|comentamos|conversamos|tratamos)\b/u;

/**
 * El turno entero es el sustantivo genérico con su artículo («y los casos?»).
 * Sin verbo ni complemento no nombra tema alguno: solo puede referirse a lo que
 * ya se estaba tratando.
 */
const ELLIPTICAL_TOPIC_ONLY =
  /^(?:(?:y|e|o|pero|entonces|ademas|tambien)\s+)?(?:los|las|esos|esas|estos|estas)\s+(?:casos|situaciones|supuestos|ejemplos|escenarios)\s*[?¿!.]*$/u;

/**
 * Petición de ampliar lo ya tratado con un sustantivo genérico: «háblame más
 * sobre las situaciones», «cuéntame los casos», «más sobre el caso», «dame más
 * detalles». Tres límites la separan de una consulta con tema propio: el verbo
 * de la petición está enumerado (no cualquier palabra que empiece igual), el
 * genérico admite solo artículos y la cláusula no continúa con un complemento
 * (`de`, `del`, `en`…). Así «muéstrame los casos de violencia escolar» o «dame
 * los detalles del anexo 2» no heredan el proceso anterior: nombran su asunto.
 * Los adjetivos no temáticos («situaciones actuales», «casos nuevos») sí
 * siguen siendo elipsis.
 */
const GENERIC_TOPIC =
  '(?:(?:el|la|los|las|estas?|esos?|esas?|unas?)\\s+)?' +
  '(?:situaciones?|casos?|supuestos?|ejemplos?|escenarios?|detalles?)\\b' +
  '(?:\\s+(?:actuales?|nuev[oa]s?|recientes?|diferentes?|mism[oa]s?|dich[oa]s?|demas|otros?|otras?)){0,3}' +
  // Cualquier preposición posterior abre un complemento con tema propio, aunque
  // haya adjetivos de por medio («casos nuevos de violencia escolar»). El scan
  // se detiene en la puntuación para no confundir la cláusula siguiente.
  '(?![^.!?;:,]*\\b(?:de|del|sobre|acerca|en|con|por|para|según|segun|hacia|sin|ante|bajo|contra|desde|hasta|entre|mediante|durante|tras|a|al)\\b)';
const EXPAND_REQUEST = new RegExp(
  `\\b(?:hablame|hablar|habla|cuentame|cuentanos|cuenta|dime|damelos|dame|di|` +
    `explicame|explica|detallame|detalla|ampliame|amplia|profundiza|desarrolla|` +
    `muestrame|muestra)\\b\\s+(?:un\\s+poco\\s+)?(?:mas\\s+)?` +
    `(?:sobre\\s+|acerca\\s+de\\s+|de\\s+)?${GENERIC_TOPIC}` +
    `|\\bmas\\s+(?:sobre|acerca\\s+de)\\s+${GENERIC_TOPIC}`,
  'u',
);

/**
 * Remite al tema del hilo, con pronombre o con una elipsis de tema. Se usa para
 * heredar el proceso abierto; no para decidir si la consulta nombra un tema
 * propio, que sigue dependiendo de `hasTopicTerm`.
 */
export function refersToThreadTopic(message: string): boolean {
  const text = normalizeSpanishText(message.replace(ACCENTED_VERB, ' '));
  return (
    refersBack(message) ||
    THREAD_REFERENCE.test(text) ||
    ELLIPTICAL_TOPIC_ONLY.test(text) ||
    EXPAND_REQUEST.test(text)
  );
}

/**
 * Remite a lo ya hablado: «durante ese tiempo», «¿y esto afecta…?», «¿esta
 * licencia es con goce?», «¿el mismo trámite sirve…?». No cuentan el verbo
 * estar («la permuta está permitida», «¿dónde esta el formato?»), el tiempo
 * presente («este año») ni «la misma UGEL»: esas consultas se buscan por sí
 * mismas.
 */
export function refersBack(message: string): boolean {
  const text = normalizeSpanishText(message.replace(ACCENTED_VERB, ' '));
  if (ALWAYS_REFERS_BACK.test(text) || SAID.test(text) || SAME.test(text)) {
    return true;
  }
  for (const clause of text.split(/[¿?¡!.,;:()"«»]+/u)) {
    const words = clause.replace(/[^a-z0-9ñ ]+/gu, ' ').replace(/\s+/gu, ' ');
    const opening = OPENING_DEMONSTRATIVE.exec(words.trim());
    if (opening && openingDemonstrativeRefersBack(opening[1], opening[2])) {
      return true;
    }
    const afterPreposition = DEMONSTRATIVE_AFTER_PREPOSITION.exec(words);
    if (afterPreposition && !TEMPORAL.test(afterPreposition[1])) return true;
  }
  return false;
}
