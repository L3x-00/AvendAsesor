import { normalizeSpanishText } from '../../rag/text-normalization';

/**
 * Temas y documentos por nombre, tolerando errores de escritura. El público
 * (docentes 30+) escribe rápido y sin tildes: «renumeración» o
 * «renumreaciones» deben llevar a «Remuneraciones», no a «sin sustento».
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

/** Distancia de edición con transposición de letras vecinas (OSA). */
export function editDistance(left: string, right: string): number {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const table: number[][] = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) =>
      row === 0 ? col : col === 0 ? row : 0,
    ),
  );
  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      let best = Math.min(
        table[row - 1][col] + 1,
        table[row][col - 1] + 1,
        table[row - 1][col - 1] + cost,
      );
      if (
        row > 1 &&
        col > 1 &&
        left[row - 1] === right[col - 2] &&
        left[row - 2] === right[col - 1]
      ) {
        best = Math.min(best, table[row - 2][col - 2] + 1);
      }
      table[row][col] = best;
    }
  }
  return table[rows - 1][cols - 1];
}

/** Errores tolerados según el largo: más letras, más margen. */
function typoBudget(length: number): number {
  if (length >= 12) return 3;
  if (length >= 8) return 2;
  return length >= 5 ? 1 : 0;
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

/** Vocabulario del dominio: palabras de los módulos y títulos de documentos. */
export function buildVocabulary(texts: string[]): Map<string, string> {
  const vocabulary = new Map<string, string>();
  for (const text of texts) {
    for (const match of text.matchAll(/[\p{L}]+/gu)) {
      const normalized = normalizeSpanishText(match[0]);
      if (normalized.length < 5 || STOPWORDS.has(normalized)) continue;
      if (!vocabulary.has(normalized)) {
        vocabulary.set(normalized, match[0].toLocaleLowerCase('es'));
      }
    }
  }
  return vocabulary;
}

/** Solo se corrigen palabras largas: las cortas («plazo», «carga») suelen ser
 * palabras correctas del español cercanas a términos del dominio («plazas»,
 * «cargos») y cambiarlas desviaría la búsqueda. */
const MIN_CORRECTABLE_LENGTH = 8;

/**
 * Corrige palabras mal escritas contra el vocabulario del dominio. Solo cambia
 * una palabra larga que no existe en él (ni como singular o plural), cuando hay
 * un único candidato cercano que empieza con la misma letra; el resto del
 * texto queda igual.
 */
export function correctDomainTypos(
  question: string,
  vocabulary: Map<string, string>,
): string {
  if (!vocabulary.size) return question;
  return question.replace(/[\p{L}]+/gu, (word) => {
    const normalized = normalizeSpanishText(word);
    if (normalized.length < MIN_CORRECTABLE_LENGTH) return word;
    if (vocabulary.has(normalized)) return word;
    const budget = typoBudget(normalized.length);
    let best: string | null = null;
    let bestDistance = Infinity;
    let tied = false;
    for (const [candidate, display] of vocabulary) {
      if (candidate[0] !== normalized[0]) continue;
      if (Math.abs(candidate.length - normalized.length) > budget + 2) continue;
      // Singular y plural cuentan igual: «renumeracion» ≈ «remuneraciones».
      const distance = Math.min(
        editDistance(normalized, candidate),
        editDistance(stem(normalized), stem(candidate)),
      );
      if (distance > budget) continue;
      // Misma palabra en otro número («remuneracion»/«remuneraciones»): está
      // bien escrita, no se toca.
      if (stem(normalized) === stem(candidate)) return word;
      if (distance < bestDistance) {
        best = display;
        bestDistance = distance;
        tied = false;
      } else if (distance === bestDistance && display !== best) {
        tied = true;
      }
    }
    return best && !tied ? best : word;
  });
}

function wordsMatch(left: string, right: string): boolean {
  const a = stem(left);
  const b = stem(right);
  if (a === b) return true;
  if (a[0] !== b[0]) return false;
  const budget = Math.min(2, typoBudget(Math.min(a.length, b.length)));
  return editDistance(a, b) <= budget;
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
