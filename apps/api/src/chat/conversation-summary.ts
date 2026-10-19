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

/**
 * Resumen determinista de respaldo: solo repite las preguntas y respuestas ya
 * guardadas, sin añadir normas, cifras ni recomendaciones nuevas. También es
 * la salida cuando el proveedor no responde o devuelve una cifra que no está
 * en la conversación.
 */
export function buildDeterministicConversationSummary(
  messages: readonly ChatContextMessage[],
): string {
  const turns: Array<{ answer: string | null; question: string }> = [];
  let awaitingContinuation = false;

  for (const message of messages) {
    if (message.role === 'user') {
      const question = cleanMessage(message.content, 220);
      if (question && isSubstantiveQuestion(question)) {
        turns.push({ answer: null, question });
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

  const header = 'En esta conversación hemos hablado de lo siguiente:';
  const lines: string[] = [];
  // Se reserva espacio para el aviso de temas omitidos.
  let remaining = MAX_RAG_SUMMARY_CHARS - header.length - 2 - 32;
  let omitted = 0;

  for (const [index, turn] of turns.entries()) {
    const answer = turn.answer ? ` Respuesta: ${turn.answer}` : '';
    const line = `${index + 1}. ${turn.question}${answer}`;
    if (line.length + 1 > remaining) {
      omitted = turns.length - index;
      break;
    }
    lines.push(line);
    remaining -= line.length + 1;
  }

  if (omitted) {
    lines.push(`… y ${omitted} tema${omitted === 1 ? '' : 's'} más.`);
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
  'acerca',
  'aclaracion',
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

function transcriptSupportsWord(
  word: string,
  transcriptWords: readonly string[],
): boolean {
  return transcriptWords.some(
    (candidate) => candidate.startsWith(word) || word.startsWith(candidate),
  );
}

const NEGATION = /\b(?:no|nunca|jamas|tampoco|ningun|ninguna|ninguno|sin)\b/u;
const SENTENCE_SPLIT = /(?<=[.!?])\s+/u;
const CLAUSE_SPLIT = /,(?!\d)|\s+(?:y|e|pero|mientras|aunque)\s+|[;]/u;

function assistantSentenceList(
  messages: readonly ChatContextMessage[],
): string[] {
  return messages
    .filter((message) => message.role !== 'user')
    .flatMap((message) => message.content.split(SENTENCE_SPLIT))
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function hasNegation(text: string): boolean {
  return NEGATION.test(normalizeSpanishText(text));
}

/**
 * Cada oración del resumen debe usar solo términos que existan en el historial
 * y mantener la polaridad de la respuesta del asistente. Las preguntas del
 * usuario pueden aportar el tema, pero no sustituyen una afirmación del
 * asistente.
 */
function summaryContentIsGrounded(
  summary: string,
  messages: readonly ChatContextMessage[],
): boolean {
  const allWords = summaryContentWords(
    messages.map((message) => message.content).join(' '),
  );
  const assistantSentences = assistantSentenceList(messages);

  for (const sentence of summary
    .split(SENTENCE_SPLIT)
    .map((item) => item.trim())
    .filter(Boolean)) {
    const words = summaryContentWords(sentence);
    if (!words.length) continue;
    if (!words.every((word) => transcriptSupportsWord(word, allWords))) {
      return false;
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
    if (!scoredCandidates.length) return false;
    const bestScore = scoredCandidates[0]?.score ?? 0;
    const bestCandidates = scoredCandidates.filter(
      (entry) => entry.score === bestScore,
    );
    const negation = hasNegation(sentence);
    // La mejor oración del asistente debe coincidir en polaridad: una oración
    // no negada no puede tapar otra que niega el mismo hecho.
    if (
      !bestCandidates.every(
        (entry) => hasNegation(entry.candidate) === negation,
      )
    ) {
      return false;
    }
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
    /\b(?:no (?:encontr[eé]|hay|se menciona|aparece|puedo resumir|tengo acceso|tengo informacion|dispongo)|no se (?:encontr[oó]|hall[oó]|obtuv[oó]|menciona|indica)|sin informacion)(?=$|[^\p{L}\p{N}])/iu.test(
      trimmed,
    )
  ) {
    return null;
  }

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
