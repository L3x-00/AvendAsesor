import { normalizeSpanishText } from '../../rag/text-normalization';

/**
 * Temas y documentos por nombre. La consulta ya llega con la normalización
 * explícita de errores demostrados («renumeración» → «remuneración»); aquí no
 * se infieren sustituciones por distancia de edición.
 */

const STOPWORDS = new Set([
  'acerca',
  'cuando',
  'desde',
  'donde',
  'entre',
  'hasta',
  'otros',
  'para',
  'sobre',
  'todos',
  'todas',
]);

export interface TopicModule {
  id: string;
  name: string;
  parentModuleId: string | null;
}

function significantWords(text: string): string[] {
  return normalizeSpanishText(text)
    .split(/[^a-z0-9]+/u)
    .filter((word) => word.length >= 5 && !STOPWORDS.has(word));
}

/** Singular aproximado: «remuneraciones» y «remuneracion» son la misma palabra. */
function stem(word: string): string {
  if (word.endsWith('ciones')) return word.slice(0, -2);
  if (word.endsWith('es') && word.length > 6) return word.slice(0, -2);
  if (word.endsWith('s') && word.length > 5) return word.slice(0, -1);
  return word;
}

function wordsMatch(left: string, right: string): boolean {
  return stem(left) === stem(right);
}

/**
 * Módulo al que se refiere un tema escrito por la persona («remuneraciones»,
 * «licencias», «la escala remunerativa»). Devuelve null si no hay uno claro.
 */
export function matchTopicModule<T extends TopicModule>(
  topic: string,
  modules: T[],
  options: { requireTopicCoverage?: boolean } = {},
): T | null {
  const topicWords = significantWords(topic);
  if (!topicWords.length) return null;
  let best: { module: T; score: number } | null = null;
  for (const module of modules) {
    const nameWords = significantWords(module.name);
    if (!nameWords.length) continue;
    const matched = nameWords.filter((nameWord) =>
      topicWords.some((topicWord) => wordsMatch(nameWord, topicWord)),
    ).length;
    if (!matched) continue;
    // El tema debe hablar sobre todo del módulo: «el artículo 12 del
    // reglamento» nombra «reglamento», pero pide algo puntual.
    const topicMatched = topicWords.filter((topicWord) =>
      nameWords.some((nameWord) => wordsMatch(nameWord, topicWord)),
    ).length;
    if (
      options.requireTopicCoverage !== false &&
      topicMatched / topicWords.length < 0.5
    ) {
      continue;
    }
    const score = matched / nameWords.length;
    if (score < 0.5) continue;
    // A igual puntaje gana el módulo principal: es el tema más amplio.
    if (
      !best ||
      score > best.score ||
      (score === best.score &&
        !module.parentModuleId &&
        best.module.parentModuleId)
    ) {
      best = { module, score };
    }
  }
  return best?.module ?? null;
}

const VAGUE_TOPICS = new Set([
  '',
  'ello',
  'eso',
  'esto',
  'aqui',
  'tema',
  'este tema',
  'el tema',
  'modulo',
  'este modulo',
  'el modulo',
  'documento',
  'el documento',
  'este documento',
  'los documentos',
  'estos documentos',
  'esta seccion',
  'la seccion',
]);

function cleanTopic(raw: string): string | null {
  const topic = raw
    .replace(/[^a-z0-9 ]+/gu, ' ')
    .replace(
      /\b(?:respecto (?:a|de) (?:ello|eso|esto)|por favor|porfa|gracias)\b/gu,
      ' ',
    )
    .trim()
    .replace(/^(?:(?:el|la|los|las|lo|del|de|al|a|un|una|sobre|en)\s+)+/u, '')
    .replace(/\s+/g, ' ')
    .trim();
  return VAGUE_TOPICS.has(topic) ? null : topic;
}

const SPECIFIC_REQUEST =
  /\d|\b(?:articulos?|incisos?|numerales?|literal(?:es)?|anexos?|disposicion|requisitos?|plazos?|montos?|pagos?|pasos?|procedimientos?|tramites?|como|cuanto|cuantos|cuantas|quienes?|cuando|donde|necesito|debo|puedo)\b/u;

const OVERVIEW_PATTERNS: readonly RegExp[] = [
  // «en base a "remuneraciones", ¿de qué tienes información?»
  /\b(?:en base a|con respecto a|respecto a|acerca de|sobre) (.+?) (?:de|sobre) que (?:tienes|tiene|hay|manejas) informacion\b/u,
  // «¿de qué trata la remuneración?», «¿de qué se trata este tema?»
  /\b(?:de|sobre) que (?:trata|tratan|se trata|va)\b(.*)$/u,
  // «resumen de las licencias», «resúmeme el tema»
  /\b(?:resumen|resumeme|resume|explicame brevemente) (?:de |del |sobre )?(.*)$/u,
  // «¿de qué tienes información sobre licencias?»
  /\b(?:de|sobre) que (?:tienes|tiene|hay|manejas) informacion (?:sobre|de|del|respecto (?:a|de)|acerca de|en|para) (.+)$/u,
  // «¿qué documentos tienes sobre licencias?», «¿qué información hay de X?»
  /\b(?:que|cual(?:es)?) (?:informacion|documentos?|documentacion|normas?|normativas?) (?:tienes|tiene|hay|manejas|cuentas|conoces) (?:sobre|de|del|respecto (?:a|de)|acerca de|en|para) (.+)$/u,
];

/**
 * Pregunta de panorama: qué hay sobre un tema o de qué trata. Devuelve el
 * tema escrito (o null si se refiere al tema abierto: «¿de qué trata?»).
 * Devuelve undefined si no es una pregunta de panorama.
 */
export function detectOverviewRequest(
  question: string,
): { topic: string | null } | undefined {
  const plain = normalizeSpanishText(question)
    .replace(/[^a-z0-9 ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Una condición («si me descuentan…») o una obligación la vuelven consulta.
  if (/\b(?:si|cuando|porque|aunque|hay que|tengo que)\b/u.test(plain)) {
    return undefined;
  }
  for (const pattern of OVERVIEW_PATTERNS) {
    const match = pattern.exec(plain);
    if (!match) continue;
    const topic = cleanTopic(match[1] ?? '');
    // Un artículo, una cifra o un pedido concreto (requisitos, plazos, montos,
    // pasos) es una consulta normativa: la responde el RAG con su cita.
    if (topic && SPECIFIC_REQUEST.test(topic)) return undefined;
    return { topic };
  }
  return undefined;
}
