import type { ChatContextMessage } from './chat-history.gateway';
import { isAffirmativeFollowUpAnswer } from './follow-up';
import { MAX_RAG_SUMMARY_CHARS } from '../rag/rag.constants';
import { withoutCitations } from '../rag/citations';
import { normalizeSpanishText } from '../rag/text-normalization';

/**
 * Metapeticiones sobre la propia conversación («resume lo que hablamos»).
 * No son consultas al corpus: se responden con la memoria de la sesión, sin
 * activar recuperación ni inventar contenido normativo.
 */
const SUMMARY_WORD = /\b(?:resum\w*|recapitu\w*|sintetiza\w*|sintesis)\b/u;

const CONVERSATION_REFERENCE =
  /\b(?:lo que (?:hemos |habiamos )?(?:hablamos|conversamos|tratamos)|lo hablado|lo que (?:hemos |habiamos )?(?:conversado|tratado)|lo que me (?:dijiste|contaste|respondiste|explicaste)|tus respuestas|nuestra conversacion|(?:esta|la) conversacion|(?:este|nuestro|el|del) chat|(?:esta|nuestra) sesion|los temas (?:que )?(?:hemos )?(?:hablado|tratado)|que (?:hemos |habiamos )?hablado)\b/u;

const TOPICS_SUMMARY =
  /\b(?:que|los) temas (?:hemos |habiamos )?(?:hablado|tratado)\b/u;

const SESSION_SUMMARY =
  /\b(?:resume|resumeme|recapitula|sintetiza)\s+(?:la|esta|nuestra)\s+sesion\b/u;

const NOMINAL_THIRD_PARTY =
  /\b(?:conversacion|chat|sesion|dialogo|charla)\s+(?:del|de la|de los|de las|de|con)\s+(?!el asistente|la asistente|avend|asesor|migo|usted|tu|su|mi)\b[\p{L}]/u;

const THIRD_PARTY_ACTOR =
  /\b(?:conversacion|chat|sesion|dialogo|charla)\b[^.!?]{0,80}\bcon\s+(?!el asistente|la asistente|avend|asesor|migo|usted|tu|su|mi)\b[\p{L}]/u;

const DISCOURSE_RESUMEN = /\ben resumen\b/u;

const CONTENT_USE =
  /\b(?:cuando (?:decimos|hablamos|se dice|nos referimos)|en (?:la|el) (?:ley|norma|reglamento|articulo|decreto|resolucion))\b/u;

const DEICTIC_SUMMARY =
  /(?:^|\b)(?:de que|sobre que) (?:hemos |habiamos |se )?(?:hablamos|hablado|trata (?:esta|la) conversacion)\b/u;

const ASKED_TO_REMEMBER =
  /\b(?:dime|cuentame|recuerdame|indica(?:me)?|menciona(?:me)?) (?:de )?(?:que|lo que) (?:hemos |habiamos )?(?:hablamos|hablado|conversado)\b/u;

const PAST_CONVERSATION =
  /(?:^|\b)(?:que|lo que) (?:hemos |habiamos )?(?:hablado|conversado|tratado)\b/u;

/** «lo que hablamos con el director» es una consulta, no un resumen del chat. */
const THIRD_PARTY_CONVERSATION =
  /\b(?:hablamos|hablado|conversamos|conversado|converse|tratamos|tratado|comentamos|comentado|tuvimos|mantuvimos|sostuvimos)\s+con\s+(?!el asistente|la asistente|avend|asesor|migo|usted|tu|su|mi)\b[\p{L}]/u;

const STANDALONE_SUMMARY =
  /^(?:recapitula|recapitular|resume(?: por favor| ya| ahora)?|resumen(?: por favor)?|resumeme|hazme un resumen|dame un resumen|dame un resumen de (?:esta|la) conversacion|(?:de )?que (?:hemos |habiamos )?hablamos)$/u;

const DOCUMENT_SUMMARY_OBJECT =
  /\b(?:resumen|resume)\b[^.!?]{0,40}\b(?:de|del|sobre)\s+(?:la|el|los|las)\s+(?:ley|norma|documento|reglamento|resolucion|decreto|instructivo|pdf)\b/u;

const REQUESTED_SUMMARY =
  /\b(?:quiero|necesito|dame|hazme|haces|me haces|preparame|prepara|resumeme|resume)\b[^.!?]{0,40}\b(?:un\s+)?resumen\b/u;

/** Detecta una petición de resumen de la conversación, no de un documento. */
export function isConversationSummaryRequest(message: string): boolean {
  const normalized = normalizeSpanishText(message);
  if (!normalized) return false;
  const plain = normalized
    .replace(/[¿?¡!.,;:]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  if (THIRD_PARTY_CONVERSATION.test(normalized)) return false;
  if (NOMINAL_THIRD_PARTY.test(normalized)) return false;
  if (THIRD_PARTY_ACTOR.test(normalized)) return false;
  if (CONTENT_USE.test(normalized)) return false;
  if (STANDALONE_SUMMARY.test(plain)) return true;
  if (
    REQUESTED_SUMMARY.test(normalized) &&
    !DOCUMENT_SUMMARY_OBJECT.test(normalized)
  ) {
    return true;
  }
  if (
    SESSION_SUMMARY.test(normalized) &&
    !/\bsesion\s+(?:del|de la|con)\b/u.test(normalized)
  ) {
    return true;
  }
  if (
    SUMMARY_WORD.test(normalized) &&
    /\b(?:la|esta|nuestra) sesion\b/u.test(normalized) &&
    !/\bsesion\s+(?:del|de la|con)\b/u.test(normalized)
  ) {
    return true;
  }
  if (DEICTIC_SUMMARY.test(normalized)) return true;
  if (ASKED_TO_REMEMBER.test(normalized)) return true;
  if (PAST_CONVERSATION.test(normalized)) return true;
  if (TOPICS_SUMMARY.test(normalized)) return true;
  if (
    DISCOURSE_RESUMEN.test(normalized) &&
    !ASKED_TO_REMEMBER.test(normalized) &&
    !/\b(?:hazme|dame|resume|resumeme|recapitula|sintetiza)\b/u.test(normalized)
  ) {
    return false;
  }
  return (
    SUMMARY_WORD.test(normalized) && CONVERSATION_REFERENCE.test(normalized)
  );
}

const NON_SUBSTANTIVE =
  /^(?:(?:si|no|ok(?:ey|ay)?|gracias|muchas gracias|hola|buenas|buenos dias|buenas tardes|buenas noches|perfecto|listo|entendido|de acuerdo|conforme|claro|dale|adelante|sigue|continua|otra consulta|otra pregunta|no por ahora|nada mas|dejalo|dejemoslo|asi esta bien|esta bien asi|no hace falta|no es necesario)(?:\s+(?:gracias|por favor|entonces|pues))*)$/u;

function truncateAtBoundary(value: string, limit: number): string {
  if (value.length <= limit) return value;
  const cut = value.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function cleanMessage(value: string, limit: number): string {
  const cleaned = withoutCitations(
    value
      .replace(
        /(?:^|\n)\s*(?:[-*•>#\s]*)\*{0,2}sugerencias?\*{0,2}\s*:[\s\S]*$/imu,
        ' ',
      )
      .replace(/(?:^|\n)\s*fuente\s*:[\s\S]*$/imu, ' ')
      .replace(/(?:^|\n)\s*relacionado con\s*:[\s\S]*$/imu, ' ')
      .replace(/\s+/gu, ' '),
  ).trim();
  return truncateAtBoundary(cleaned, limit);
}

function isSubstantiveQuestion(value: string): boolean {
  if (isAffirmativeFollowUpAnswer(value)) return false;
  const normalized = normalizeSpanishText(value)
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return normalized.length >= 3 && !NON_SUBSTANTIVE.test(normalized);
}

const NO_EVIDENCE_ANSWER =
  /(?:no encontr[eé] informaci[oó]n suficiente|no encontr[eé] evidencia|no hay informaci[oó]n suficiente|sin evidencia suficiente)/iu;

function summaryExcerpt(value: string, limit: number): string {
  // Dos oraciones bastan para conservar el tema y su respuesta sin volver al
  // volcado completo; una aceptación puede añadir la pregunta siguiente.
  const excerpt = value.split(SENTENCE_SPLIT).slice(0, 2).join(' ').trim();
  return truncateAtBoundary(excerpt, limit);
}

/**
 * Resumen determinista de respaldo: solo repite los temas y lo ya guardado,
 * sin añadir normas, cifras ni recomendaciones nuevas. Se presenta como una
 * lista de puntos, no como un volcado de «pregunta / Respuesta:», para que una
 * caída del proveedor no degrade el tono del asistente.
 */
export function buildDeterministicConversationSummary(
  messages: readonly ChatContextMessage[],
): string {
  const turns: Array<{
    answer: string | null;
    question: string;
    role: ChatContextMessage['role'] | null;
  }> = [];
  let awaitingContinuation = false;

  for (const message of messages) {
    if (message.role === 'user') {
      const question = cleanMessage(message.content, 220);
      if (question && isSubstantiveQuestion(question)) {
        turns.push({ answer: null, question, role: null });
        awaitingContinuation = false;
      } else if (turns.length) {
        // «Sí» después de una propuesta: la respuesta siguiente pertenece al
        // mismo tema y no debe perderse en el resumen de respaldo.
        awaitingContinuation = true;
      }
      continue;
    }
    const current = turns.at(-1);
    if (!current) continue;
    const answer = cleanMessage(message.content, 400);
    if (!answer) continue;
    current.role ??= message.role;
    if (awaitingContinuation && current.answer) {
      current.answer = truncateAtBoundary(`${current.answer} ${answer}`, 800);
      awaitingContinuation = false;
    } else if (!current.answer) {
      current.answer = answer;
      awaitingContinuation = false;
    }
  }

  if (!turns.length) {
    return 'Todavía no hay consultas que resumir en esta conversación. Cuando me hagas una pregunta, podré resumirte lo que hemos hablado.';
  }

  const header = 'Estos son los puntos que tratamos en esta conversación:';
  const lines: string[] = [];
  // Se reserva espacio para el aviso de temas omitidos.
  let remaining = MAX_RAG_SUMMARY_CHARS - header.length - 2 - 32;
  let omitted = 0;

  for (const [index, turn] of turns.entries()) {
    const topic = turn.question
      .replace(/^[¿¡\s]+/u, '')
      .replace(/[?¿!¡.;:]+$/u, '')
      .trim();
    // Una respuesta puede abrir con «no encontré…» y continuar con lo que sí
    // respondió. Se elimina solo esa primera oración, no el resto.
    const answerWithoutOpeningRefusal = turn.answer
      ? turn.answer
          .replace(
            /^(?:por ahora\s+)?(?:no encontr[eé][^.!?]*[.!?]\s*|no hay[^.!?]*[.!?]\s*|sin evidencia[^.!?]*[.!?]\s*)/iu,
            '',
          )
          .trim()
      : '';
    let detail: string;
    if (!turn.answer) {
      detail = 'quedó pendiente de ampliar.';
    } else if (
      turn.role === 'no_evidence' ||
      (!answerWithoutOpeningRefusal &&
        turn.answer.length < 400 &&
        NO_EVIDENCE_ANSWER.test(turn.answer))
    ) {
      detail =
        'no había evidencia suficiente en los documentos, así que quedó pendiente.';
    } else if (turn.role === 'clarification') {
      detail = 'te pedí precisar un dato para orientarte.';
    } else {
      detail = summaryExcerpt(answerWithoutOpeningRefusal || turn.answer, 300);
    }
    const line = `• ${topic}: ${detail}`;
    if (line.length + 1 > remaining) {
      omitted = turns.length - index;
      break;
    }
    lines.push(line);
    remaining -= line.length + 1;
  }

  if (omitted) {
    lines.push(`• … y ${omitted} tema${omitted === 1 ? '' : 's'} más.`);
  }

  return [header, '', ...lines].join('\n');
}

const NUMBER_WORD_VALUES: Record<string, string> = {
  cero: '0',
  uno: '1',
  dos: '2',
  tres: '3',
  cuatro: '4',
  cinco: '5',
  seis: '6',
  siete: '7',
  ocho: '8',
  nueve: '9',
  diez: '10',
  once: '11',
  doce: '12',
  trece: '13',
  catorce: '14',
  quince: '15',
  dieciseis: '16',
  diecisiete: '17',
  dieciocho: '18',
  diecinueve: '19',
  veinte: '20',
  veintiuno: '21',
  veintiun: '21',
  veintiuna: '21',
  veintidos: '22',
  veintitres: '23',
  veinticuatro: '24',
  veinticinco: '25',
  veintiseis: '26',
  veintisiete: '27',
  veintiocho: '28',
  veintinueve: '29',
  treinta: '30',
  cuarenta: '40',
  cincuenta: '50',
  sesenta: '60',
  setenta: '70',
  ochenta: '80',
  noventa: '90',
  cien: '100',
  ciento: '100',
  doscientos: '200',
  trescientos: '300',
  cuatrocientos: '400',
  quinientos: '500',
  seiscientos: '600',
  setecientos: '700',
  ochocientos: '800',
  novecientos: '900',
  mil: '1000',
  millon: '1000000',
  millones: '1000000',
  billon: '1000000000',
  billones: '1000000000',
};

/** Unidades cuyo cambio altera materialmente el sentido (plazos, jornadas). */
const STRICT_MEASURE =
  /^(?:dias?|anos?|meses?|horas?|minutos?|semanas?|%|porciento)$/u;
/** «días hábiles» no es lo mismo que «días»: el cualificador debe existir. */
const QUALIFIED_MEASURE = /\b(?:dias|horas|semanas|meses|anos)\s+habiles\b/u;
/** Una moneda explícita no puede validarse contra una unidad de tiempo. */
const CURRENCY = /(?:\bsoles?\b|\bsol\b|s\/)/u;

const NUMBER_CLAIM =
  /(?<![\p{L}\p{N}])(\d+(?:[.,]\d+)*|un|una|medio|media|cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciseis|diecisiete|dieciocho|diecinueve|veinte|veintiuno|veintiun|veintiuna|veintidos|veintitres|veinticuatro|veinticinco|veintiseis|veintisiete|veintiocho|veintinueve|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien|ciento|doscientos|trescientos|cuatrocientos|quinientos|seiscientos|setecientos|ochocientos|novecientos|mil|millon|millones|billon|billones)(?![\p{L}\p{N}])\s*([\p{L}%]+)?/gu;

interface NumericClaim {
  unit: string | null;
  value: string;
}

function normalizedClaimText(text: string): string {
  return normalizeSpanishText(withoutCitations(text))
    .replace(/por ciento/gu, '%')
    .replace(/^\s*\d+[.)]\s+/gmu, ' ')
    .replace(/[^\p{L}\p{N}%.,/ ]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

const MULTIPLIER = new Set(['mil', 'millon', 'millones', 'billon', 'billones']);

function numericClaims(text: string): NumericClaim[] {
  const claims: NumericClaim[] = [];
  for (const match of normalizedClaimText(text).matchAll(NUMBER_CLAIM)) {
    const raw = match[1] ?? '';
    const unit = match[2]?.toLocaleLowerCase('es') ?? null;
    const articleNumber =
      raw === 'un' || raw === 'una' || raw === 'medio' || raw === 'media';
    if (articleNumber && (!unit || !STRICT_MEASURE.test(unit))) continue;
    const numericValue =
      raw === 'un' || raw === 'una'
        ? '1'
        : raw === 'medio' || raw === 'media'
          ? '0.5'
          : (NUMBER_WORD_VALUES[raw] ?? raw);
    // «5 mil» no es «5»: si el historial dice «5.000», no se puede validar la
    // equivalencia y se prefiere el respaldo determinista.
    const value =
      unit && MULTIPLIER.has(unit) ? `${numericValue} ${unit}` : numericValue;
    claims.push({ unit, value });
  }
  return claims;
}

const SUMMARY_STOP_WORDS = new Set([
  'abordo',
  'abordan',
  'abordaron',
  'acerca',
  'aclaro',
  'aclararon',
  'aclaracion',
  'aclaraciones',
  'anual',
  'anuales',
  'ano',
  'anos',
  'antes',
  'asistente',
  'aspecto',
  'aspectos',
  'aunque',
  'cada',
  'como',
  'comentado',
  'comentamos',
  'con',
  'consulta',
  'consultaste',
  'consulto',
  'continuacion',
  'conversacion',
  'conversamos',
  'conversado',
  'cuando',
  'cuanta',
  'cuantas',
  'cuanto',
  'cuantos',
  'cual',
  'cuales',
  'debe',
  'deben',
  'del',
  'desde',
  'despues',
  'dia',
  'diario',
  'diarios',
  'diarias',
  'dias',
  'donde',
  'durante',
  'entonces',
  'esta',
  'estan',
  'estas',
  'este',
  'estos',
  'evidencia',
  'fue',
  'hablamos',
  'hablado',
  'hace',
  'hacen',
  'hasta',
  'hora',
  'horas',
  'las',
  'los',
  'mas',
  'mencionaste',
  'menciono',
  'menos',
  'mensual',
  'mensuales',
  'mes',
  'meses',
  'minuto',
  'minutos',
  'mis',
  'muy',
  'ningun',
  'ninguna',
  'ninguno',
  'nunca',
  'norma',
  'normas',
  'nuestro',
  'nuestra',
  'otra',
  'otras',
  'otro',
  'otros',
  'para',
  'pero',
  'por',
  'porque',
  'pregunta',
  'preguntaste',
  'pregunto',
  'principal',
  'principales',
  'puede',
  'pueden',
  'punto',
  'puntos',
  'que',
  'quien',
  'quienes',
  'resumen',
  'resumido',
  'respuesta',
  'respondio',
  'semanal',
  'semanales',
  'semana',
  'semanas',
  'segun',
  'ser',
  'siguiente',
  'sin',
  'sobre',
  'sol',
  'soles',
  'solo',
  'son',
  'sus',
  'tambien',
  'tampoco',
  'tema',
  'temas',
  'tiene',
  'tienen',
  'todo',
  'toda',
  'todos',
  'todas',
  'tratado',
  'tratamos',
  'tus',
  'una',
  'uno',
  'unos',
  'unas',
  'usuario',
  'vigente',
  'vigentes',
  // Verbos y etiquetas de recapitulación: describen la conversación, no un
  // hecho que deba estar literalmente en el historial.
  'comento',
  'comentaron',
  'consulto',
  'consultaron',
  'detallo',
  'detallaron',
  'dialogo',
  'encontre',
  'encontro',
  'encontrar',
  'establece',
  'establecen',
  'exige',
  'exigen',
  'explico',
  'explicaron',
  'giro',
  'indico',
  'indicaron',
  'menciono',
  'mencionaron',
  'necesaria',
  'necesario',
  'necesita',
  'necesito',
  'preciso',
  'precisaron',
  'pregunto',
  'preguntaron',
  'quedo',
  'quedaron',
  'respondio',
  'respondieron',
  'reviso',
  'revisaron',
  'senalo',
  'senalaron',
  'ser',
  'torno',
  'trato',
  'trataron',
  'charla',
  'converso',
  'conversaron',
  'informacion',
  'datos',
  'disponible',
  'disponibles',
  'pendiente',
  'pendientes',
]);

const NUMBER_WORD_TOKENS = new Set([
  'billon',
  'billones',
  'catorce',
  'cero',
  'cien',
  'ciento',
  'cinco',
  'cincuenta',
  'cuarenta',
  'cuatro',
  'cuatrocientos',
  'diecinueve',
  'dieciocho',
  'dieciseis',
  'diecisiete',
  'diez',
  'doce',
  'dos',
  'doscientos',
  'media',
  'medio',
  'mil',
  'millon',
  'millones',
  'novecientos',
  'noventa',
  'ocho',
  'ochocientos',
  'once',
  'quinientos',
  'seis',
  'seiscientos',
  'setenta',
  'setecientos',
  'siete',
  'trece',
  'treinta',
  'tres',
  'trescientos',
  'un',
  'una',
  'uno',
  'veinte',
  'veinticinco',
  'veinticuatro',
  'veintidos',
  'veintinueve',
  'veintiocho',
  'veintiseis',
  'veintisiete',
  'veintitres',
  'veintiun',
  'veintiuna',
  'veintiuno',
]);

function summaryContentWords(text: string): string[] {
  return [
    ...new Set(
      normalizeSpanishText(text)
        .replace(/[^\p{L}\s]+/gu, ' ')
        .split(/\s+/u)
        .filter(
          (word) =>
            word.length >= 3 &&
            !SUMMARY_STOP_WORDS.has(word) &&
            !NUMBER_WORD_TOKENS.has(word),
        ),
    ),
  ];
}

/**
 * Sinónimos usuales de una recapitulación. No añaden hechos: solo permiten
 * que el resumen use «sueldo» al recapitular una respuesta que dijo
 * «remuneración», en vez de castigar una paráfrasis legítima.
 */
const SUMMARY_SYNONYMS: Readonly<Record<string, string>> = {
  contratacion: 'contratado',
  haber: 'remuneracion',
  haberes: 'remuneracion',
  nombramiento: 'nombrado',
  nombramientos: 'nombrado',
  paga: 'remuneracion',
  pagos: 'remuneracion',
  salario: 'remuneracion',
  salarios: 'remuneracion',
  sueldo: 'remuneracion',
  sueldos: 'remuneracion',
};

function canonicalSummaryWord(word: string): string {
  return SUMMARY_SYNONYMS[word] ?? word;
}

function transcriptSupportsWord(
  word: string,
  transcriptWords: readonly string[],
): boolean {
  const canonical = canonicalSummaryWord(word);
  return transcriptWords.some((candidate) => {
    const other = canonicalSummaryWord(candidate);
    return other.startsWith(canonical) || canonical.startsWith(other);
  });
}

const NEGATION = /\b(?:no|nunca|jamas|tampoco|ningun|ninguna|ninguno|sin)\b/u;
const SENTENCE_SPLIT = /(?<=[.!?])\s+/u;
const CLAUSE_SPLIT = /,(?!\d)|\s+(?:y|e|pero|mientras|aunque)\s+|[;]/u;

function assistantSentenceList(
  messages: readonly ChatContextMessage[],
): string[] {
  return messages
    .filter((message) => message.role !== 'user')
    .flatMap((message) =>
      message.content
        .split(SENTENCE_SPLIT)
        .flatMap((sentence) => sentence.split(/\n+/u)),
    )
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function hasNegation(text: string): boolean {
  return NEGATION.test(normalizeSpanishText(text));
}

/**
 * Cada palabra de contenido del resumen debe existir en el historial. Los
 * verbos y conectores de recapitulación están en la lista de palabras vacías y
 * algunos sinónimos usuales se normalizan; fuera de eso, un sustantivo o un
 * adjetivo nuevo sería un hecho inventado. Las cifras, unidades y entidades
 * con nombre propio se validan además por separado.
 */
function summaryContentIsGrounded(
  summary: string,
  messages: readonly ChatContextMessage[],
): boolean {
  const assistantWords = summaryContentWords(
    messages
      .filter((message) => message.role !== 'user')
      .map((message) => message.content)
      .join(' '),
  );
  const topicWords = summaryContentWords(
    messages
      .filter((message) => message.role === 'user')
      .map((message) => message.content)
      .join(' '),
  );
  const assistantSentences = assistantSentenceList(messages);

  for (const sentence of summary
    .split(SENTENCE_SPLIT)
    .map((item) => item.trim())
    .filter(Boolean)) {
    // Una frase de estado puede nombrar el tema que puso la persona; una
    // afirmación factual solo puede usar lo que dijo el asistente.
    const pendingStatement =
      /\b(?:qued[oó] pendiente|no se encontr[oó]|sin evidencia|no hubo|no hab[ií]a)\b/iu.test(
        sentence,
      );
    for (const clause of sentence.split(CLAUSE_SPLIT)) {
      const words = summaryContentWords(clause);
      if (!words.length) continue;
      if (
        !words.every(
          (word) =>
            transcriptSupportsWord(word, assistantWords) ||
            (pendingStatement && transcriptSupportsWord(word, topicWords)),
        )
      ) {
        return false;
      }
      const matchingSentences = assistantSentences.filter((candidate) => {
        const candidateWords = summaryContentWords(candidate);
        return words.every((word) =>
          transcriptSupportsWord(word, candidateWords),
        );
      });
      if (!pendingStatement) {
        // Un hecho debe estar contenido en una sola oración del asistente: no
        // se puede tomar «licencia» de una oración y «UGEL» de otra.
        if (!matchingSentences.length) return false;
        const negation = hasNegation(clause);
        if (
          !matchingSentences.some(
            (candidate) => hasNegation(candidate) === negation,
          )
        ) {
          return false;
        }
        continue;
      }
      const scoredCandidates = assistantSentences
        .map((candidate) => {
          const candidateWords = summaryContentWords(candidate);
          const score = words.filter((word) =>
            transcriptSupportsWord(word, candidateWords),
          ).length;
          return { candidate, score };
        })
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score);
      if (!scoredCandidates.length) {
        // El tema de una frase de estado puede venir solo de la pregunta.
        if (words.every((word) => transcriptSupportsWord(word, topicWords))) {
          continue;
        }
        return false;
      }
      const bestScore = scoredCandidates[0]?.score ?? 0;
      const bestCandidates = scoredCandidates.filter(
        (entry) => entry.score === bestScore,
      );
      const negation = hasNegation(clause);
      if (
        !bestCandidates.every(
          (entry) => hasNegation(entry.candidate) === negation,
        )
      ) {
        return false;
      }
    }
  }
  return true;
}

const SUMMARY_NAMED_ENTITY_IGNORED = new Set(['asesor', 'avend', 'pdf']);

function existsInTranscript(value: string, transcript: string): boolean {
  const normalized = normalizeSpanishText(value).replace(/\s+/gu, ' ').trim();
  if (!normalized) return true;
  return new RegExp(
    `(^|[^\\p{L}\\p{N}])${escapeRegExp(normalized)}([^\\p{L}\\p{N}]|$)`,
    'u',
  ).test(transcript);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/**
 * Una sigla, un título entre comillas o una frase de dos o más palabras
 * capitalizadas que no exista en el historial sería un hecho nuevo, aunque la
 * paráfrasis sea natural. Las palabras sueltas capitalizadas («Además»,
 * «Finalmente») no se tratan como entidades para no castigar el tono normal
 * de un resumen.
 */
function summaryNamedContentIsGrounded(
  summary: string,
  messages: readonly ChatContextMessage[],
): boolean {
  const transcript = normalizeSpanishText(
    messages
      .filter((message) => message.role !== 'user')
      .map((message) => message.content)
      .join(' \n '),
  );
  const cleaned = summary.replace(/```[\s\S]*?```/gu, ' ');

  for (const match of cleaned.matchAll(/«([^»]{3,120})»|"([^"]{3,120})"/gu)) {
    const quoted = match[1] ?? match[2] ?? '';
    if (!existsInTranscript(quoted, transcript)) return false;
  }

  for (const match of cleaned.matchAll(/\b[A-ZÁÉÍÓÚÑ]{2,10}\b/gu)) {
    const acronym = match[0];
    const normalized = normalizeSpanishText(acronym);
    if (SUMMARY_NAMED_ENTITY_IGNORED.has(normalized)) continue;
    if (!existsInTranscript(acronym, transcript)) return false;
  }

  for (const match of cleaned.matchAll(
    /\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}(?:\s+(?:de|del|la|las|los|el)\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}|\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,})+/gu,
  )) {
    if (!existsInTranscript(match[0], transcript)) return false;
  }

  return true;
}

/**
 * Cada cláusula con una cifra debe compartir al menos un término de tema con
 * la oración del historial que contiene esa misma cifra y unidad. Evita
 * intercambiar dos datos correctos entre temas («5 días» de plazo y «30 horas»
 * de jornada) y presentarlos como si fueran del tema contrario.
 */
function numericClaimsAreAssociated(
  summary: string,
  messages: readonly ChatContextMessage[],
): boolean {
  const sentenceClauses = assistantSentenceList(messages)
    .flatMap((sentence) => sentence.split(CLAUSE_SPLIT))
    .map((clause) => clause.trim())
    .filter(Boolean);
  const clauses = summary
    .replace(/^\s*\d+[.)]\s+/gmu, ' ')
    .split(SENTENCE_SPLIT)
    .flatMap((sentence) => sentence.split(CLAUSE_SPLIT))
    .map((clause) => clause.trim())
    .filter(Boolean);
  const sentences = assistantSentenceList(messages);

  for (const clause of clauses) {
    const claims = numericClaims(clause);
    if (!claims.length) continue;
    const words = summaryContentWords(clause);
    if (!words.length) continue;
    const clauseText = normalizedClaimText(clause);
    const requiresQualified = QUALIFIED_MEASURE.test(clauseText);
    const requiresCurrency = CURRENCY.test(clauseText);
    const supported = claims.every((claim) =>
      sentenceClauses.some((sentence) => {
        const sentenceClaims = numericClaims(sentence);
        const sameClaim = sentenceClaims.some(
          (candidate) =>
            candidate.value === claim.value &&
            (!claim.unit ||
              !STRICT_MEASURE.test(claim.unit) ||
              candidate.unit === claim.unit),
        );
        if (!sameClaim) return false;
        const sentenceText = normalizedClaimText(sentence);
        if (!requiresQualified && QUALIFIED_MEASURE.test(sentenceText)) {
          return false;
        }
        if (requiresQualified && !QUALIFIED_MEASURE.test(sentenceText)) {
          return false;
        }
        if (requiresCurrency && !CURRENCY.test(sentenceText)) return false;
        // Los conceptos de la cláusula del asistente deben estar todos en la
        // cláusula del resumen; el resumen puede añadir el tema que preguntó la
        // persona, pero no sustituir «bonificación» por «remuneración» ni
        // «solicitud» por «licencia».
        const sentenceWords = summaryContentWords(sentence);
        return sentenceWords.every((sentenceWord) =>
          words.some((word) => transcriptSupportsWord(word, [sentenceWord])),
        );
      }),
    );
    if (!supported) return false;
    // Además de la cláusula, todos los conceptos del resumen deben aparecer en
    // una misma oración del asistente que contenga la cifra. Evita mezclar el
    // plazo de una sección con la enfermedad de otra.
    const inSameSentence = sentences.some((sentence) => {
      const sentenceClaims = numericClaims(sentence);
      const sameClaim = claims.every((claim) =>
        sentenceClaims.some(
          (candidate) =>
            candidate.value === claim.value &&
            (!claim.unit ||
              !STRICT_MEASURE.test(claim.unit) ||
              candidate.unit === claim.unit),
        ),
      );
      if (!sameClaim) return false;
      const sentenceWords = summaryContentWords(sentence);
      return words.every((word) => transcriptSupportsWord(word, sentenceWords));
    });
    if (!inSameSentence) return false;
  }
  return true;
}

/**
 * El resumen generado solo puede repetir cifras que ya existen en el historial.
 * Se comparan números completos, sin citas, y la unidad de plazos y jornadas.
 * Si el modelo introduce un importe, un plazo o un número de norma que no está
 * en la conversación, se descarta y se usa el resumen determinista.
 */
export function groundedConversationSummary(
  text: string,
  messages: readonly ChatContextMessage[],
): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (
    withoutCitations(trimmed) !== trimmed ||
    /\[\[\s*(?:SIN_SUSTENTO|FUERA_DE_AMB[IÍ]TO)\s*\]\]/iu.test(trimmed)
  ) {
    return null;
  }
  if (trimmed.replace(/[^\p{L}\p{N}]+/gu, '').length < 12) return null;
  if (/^(?:¿|\?)/u.test(trimmed) || /\?\s*$/u.test(trimmed)) return null;
  if (
    /(?:^|\n)\s*(?:pregunta|respuesta|usuario|asistente|user|assistant)\s*:/iu.test(
      trimmed,
    )
  ) {
    return null;
  }
  const startsWithRefusal =
    /^(?:no (?:encontr[eé]|hay|puedo resumir|tengo acceso|tengo informacion|dispongo)|no se (?:encontr[oó]|hall[oó]|obtuv[oó]|menciona|indica)|sin informacion)(?=$|[^\p{L}\p{N}])/iu.test(
      trimmed,
    );
  // Un resumen puede decir con naturalidad que un tema quedó pendiente; lo que
  // no puede es empezar y quedarse en una negativa o excusa del modelo.
  if (startsWithRefusal && summaryContentWords(trimmed).length <= 3)
    return null;
  if (!summaryNamedContentIsGrounded(trimmed, messages)) return null;

  const assistantTranscript = messages
    .filter((message) => message.role !== 'user')
    .map((message) => message.content)
    .join('\n');
  const normalizedTranscript = normalizedClaimText(assistantTranscript);
  const normalizedSummary = normalizedClaimText(trimmed);
  if (
    QUALIFIED_MEASURE.test(normalizedSummary) &&
    !QUALIFIED_MEASURE.test(normalizedTranscript)
  ) {
    return null;
  }
  if (
    CURRENCY.test(normalizedSummary) &&
    !CURRENCY.test(normalizedTranscript)
  ) {
    return null;
  }
  if (!summaryContentIsGrounded(trimmed, messages)) return null;

  const transcriptClaims = numericClaims(assistantTranscript);
  const unsupported = numericClaims(trimmed).some(
    (claim) =>
      !transcriptClaims.some(
        (candidate) =>
          candidate.value === claim.value &&
          (!claim.unit ||
            !STRICT_MEASURE.test(claim.unit) ||
            candidate.unit === claim.unit),
      ),
  );
  if (unsupported) return null;
  if (!numericClaimsAreAssociated(trimmed, messages)) return null;

  if (trimmed.length <= MAX_RAG_SUMMARY_CHARS) return trimmed;
  const cut = trimmed.slice(0, MAX_RAG_SUMMARY_CHARS);
  const lastSentence = Math.max(
    cut.lastIndexOf('.'),
    cut.lastIndexOf('!'),
    cut.lastIndexOf('?'),
    cut.lastIndexOf('\n'),
  );
  return (lastSentence > 0 ? cut.slice(0, lastSentence + 1) : cut).trim();
}
