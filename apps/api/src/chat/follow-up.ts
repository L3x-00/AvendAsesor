import type { ChatContextMessage } from './chat-history.gateway';
import { normalizeSpanishText } from '../rag/text-normalization';

/**
 * Seguimientos conversacionales que aceptan la propuesta que el asistente
 * acaba de ofrecer. Un «sí» a secas no aporta tema al clasificador y termina
 * en el flujo normal (a menudo como «sin evidencia»); antes de eso se comprueba
 * si la última respuesta propia dejó una pregunta pendiente y, en ese caso, se
 * busca la propuesta aceptada.
 */

const ACCEPTANCE_TOKENS = new Set([
  'acepto',
  'acuerdo',
  'adelante',
  'afirmativo',
  'asi',
  'bien',
  'claro',
  'como',
  'conforme',
  'confirmo',
  'continua',
  'correcto',
  'cuentame',
  'dale',
  'dame',
  'de',
  'desde',
  'detalle',
  'detalles',
  'entendido',
  'entonces',
  'eso',
  'es',
  'esta',
  'exacto',
  'excelente',
  'explicame',
  'favor',
  'funciona',
  'gracias',
  'gustaria',
  'hazlo',
  'informacion',
  'interesa',
  'listo',
  'lo',
  'luego',
  'mas',
  'me',
  'muestramelo',
  'obvio',
  'ok',
  'okay',
  'okey',
  'oki',
  'perfecto',
  'por',
  'pues',
  'que',
  'quiero',
  'saber',
  'sale',
  'si',
  'sigue',
  'supuesto',
  'va',
  'vale',
  'vamos',
  'y',
]);

const ACCEPTANCE_PRIMARY = new Set([
  'acepto',
  'acuerdo',
  'adelante',
  'afirmativo',
  'asi',
  'bien',
  'claro',
  'conforme',
  'confirmo',
  'continua',
  'correcto',
  'dale',
  'eso',
  'exacto',
  'excelente',
  'favor',
  'gustaria',
  'hazlo',
  'interesa',
  'listo',
  'luego',
  'muestramelo',
  'ok',
  'perfecto',
  'quiero',
  'si',
  'sigue',
  'supuesto',
  'vale',
  'vamos',
  'obvio',
]);

function followUpAnswerText(message: string): string {
  return normalizeSpanishText(message)
    .replace(/[^\p{L}\s]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

const STRONG_ACCEPTANCE = new Set([
  'acepto',
  'adelante',
  'claro',
  'confirmo',
  'dale',
  'favor',
  'gustaria',
  'hazlo',
  'interesa',
  'quiero',
  'si',
  'supuesto',
  'va',
  'vamos',
]);

/** «Sí», «sí, por favor», «claro», «dale»… sin contenido adicional. */
export function isAffirmativeFollowUpAnswer(message: string): boolean {
  if (/\d/u.test(message)) return false;
  const tokens = followUpAnswerText(message).split(' ').filter(Boolean);
  if (tokens.length === 0) return false;
  if (tokens.join(' ') === 'de una') return true;
  if (!tokens.some((token) => ACCEPTANCE_PRIMARY.has(token))) return false;
  if (!tokens.every((token) => ACCEPTANCE_TOKENS.has(token))) return false;
  // «perfecto, gracias» cierra el turno; no es una aceptación de la propuesta.
  if (
    tokens.includes('gracias') &&
    !tokens.some((token) => STRONG_ACCEPTANCE.has(token))
  ) {
    return false;
  }
  // «luego» a secas suele significar «después»; «desde luego» sí acepta.
  if (tokens.length === 1 && tokens[0] === 'luego') return false;
  return true;
}

/** Justo después de abrir «Sugerencias:», que puede ser negrita o una viñeta. */
const SUGGESTIONS_HEADER =
  /^(?:[-*•>#\s]*)(?:\*\*)?sugerencias?(?:\*\*)?[ \t]*(?::[ \t]*|\r?\n|$)/imu;

/**
 * Pregunta final del bloque de sugerencias. Es la propuesta explícita del
 * asistente y, por tanto, la que se puede aceptar con un «sí».
 */
function questionInSuggestions(content: string): string | null {
  const header = SUGGESTIONS_HEADER.exec(content);
  if (!header) return null;
  const block = content.slice(header.index + header[0].length);
  return lastQuestion(block);
}

function lastQuestion(content: string): string | null {
  const withoutTables = content.replace(/^\s*\|.*\|\s*$/gmu, ' ');
  const sentences = withoutTables.split(/(?<=[.!?])\s+/u);
  for (let index = sentences.length - 1; index >= 0; index -= 1) {
    const sentence = sentences[index]?.trim() ?? '';
    if (!sentence || !sentence.includes('?')) continue;
    // Una frase puede cerrar con dos preguntas («…? ¿Quieres…?»): se toma la
    // última, que es la propuesta de siguiente paso.
    const start = sentence.lastIndexOf('¿');
    const fromQuestion = start >= 0 ? sentence.slice(start) : sentence;
    // Se corta en el último «?» para descartar adornos finales («**», «[1]»,
    // emojis) que rompían la conversión de la propuesta.
    const end = fromQuestion.lastIndexOf('?');
    const question = (end >= 0 ? fromQuestion.slice(0, end + 1) : fromQuestion)
      .replace(/^[-*•>\s]+/u, '')
      .trim();
    if (question.length >= 8 && question.length <= 300) return question;
  }
  return null;
}

/**
 * Solo una propuesta de acción (no una pregunta informativa como «¿tu vínculo
 * es contratado o nombrado?») puede aceptarse con un «sí». Las preguntas del
 * bloque «Sugerencias:» ya son propuestas por construcción.
 */
const OFFER_QUESTION =
  /^(?:¿\s*)?(?:te gustaria|te interesa|te parece|te animas|te resumo|te hago|puedo ayudarte|necesitas algo|quieres|quisieras|deseas|te explico|te cuento|te detallo|te amplio|te digo|te muestro|te comparto|te preparo|te reviso|te busco|te armo|te redacto|te ayudo|reviso|preparo|busco|armo|redacto)\b/u;

function isOfferQuestion(question: string): boolean {
  return OFFER_QUESTION.test(normalizeSpanishText(question));
}

/**
 * Pregunta que pide un dato de la persona (vínculo, jornada, sector, cargo…).
 * No se acepta con «sí»: el RAG no puede responderla sin ese dato.
 */
const PERSONAL_DATA_TERM =
  /\b(?:vinculo|jornada|horas|carga horaria|sector|publico|privado|cargo|nivel|escala|regimen|contratad[oa]|nombrad[oa]|dni|nombre|apellidos?|edad|distrito|ugel|dre|institucion educativa)\b/u;
const PERSONAL_POSSESSIVE =
  /\b(?:tu|su|tus|sus)\s+(?:vinculo|jornada|horas|carga horaria|sector|cargo|nivel|escala|regimen|dni|nombre|apellidos?|edad|distrito|ugel|dre|institucion educativa)\b/u;
const PERSONAL_DIRECT =
  /^(?:¿\s*)?(?:eres|es usted|trabajas|cuantas horas (?:trabajas|laboras|tienes|dictas|cumples)|cuantos anos (?:tienes|llevas|de servicio))\b/u;
const REQUEST_FOR_PERSONAL_DATA =
  /\b(?:indicarme|decirme|confirmarme|darme|precisar|senalar)\s+(?:tu|su)\b/u;
const PERSONAL_DATA_QUESTION =
  /\b(?:cuantas?\s+(?:horas|anos)\s+(?:trabajas|laboras|tienes|llevas|cumples)|que\s+(?:cargo|nivel|escala|sector|vinculo)\s+(?:tienes|ocupas|desempenas)|a que\s+(?:escala|nivel|regimen)\s+(?:perteneces|estas)|cual\s+es\s+tu)\b/u;
const OFFER_TO_EXPLAIN =
  /\b(?:que te|te)\s+(?:explique|explico|cuente|cuento|detalle|detallo|amplie|amplio|diga|digo)\b/u;

function asksForUserData(question: string): boolean {
  const normalized = normalizeSpanishText(question);
  if (!PERSONAL_DATA_TERM.test(normalized)) return false;
  if (OFFER_TO_EXPLAIN.test(normalized)) return false;
  return (
    PERSONAL_POSSESSIVE.test(normalized) ||
    PERSONAL_DIRECT.test(normalized) ||
    PERSONAL_DATA_QUESTION.test(normalized) ||
    REQUEST_FOR_PERSONAL_DATA.test(normalized)
  );
}

/** Cierres genéricos que no proponen una acción concreta. */
const GENERIC_OFFER =
  /^(?:¿\s*)?(?:(?:te interesa|te animas|te parece|puedo ayudarte|necesitas algo|te ayudo)(?:\s+(?:el tema|esto|eso|algo mas|mas|en que mas|con algo mas|con esto|con eso|con mas))?|(?:quieres|quisieras|deseas|te gustaria|te interesa)\s+(?:saber|conocer|ver)\s+mas)\s*\??$/u;

function isGenericOffer(question: string): boolean {
  const normalized = normalizeSpanishText(question);
  return (
    GENERIC_OFFER.test(normalized) ||
    /^(?:¿\s*)?te ayudo\s*\??$/u.test(normalized)
  );
}

function toFirstPerson(value: string): string {
  return value
    .replace(/\bdebes\b/gu, 'debo')
    .replace(/\btienes\b/gu, 'tengo')
    .replace(/\bnecesitas\b/gu, 'necesito')
    .replace(/\bpuedes\b/gu, 'puedo')
    .replace(/\bquieres\b/gu, 'quiero')
    .replace(/\bprefieres\b/gu, 'prefiero')
    .replace(/\bcumples\b/gu, 'cumplo')
    .replace(/\bcalificas\b/gu, 'califico')
    .replace(/\bpresentas\b/gu, 'presento')
    .replace(/\breunes\b/gu, 'reuno')
    .replace(/\balcanzas\b/gu, 'alcanzo')
    .replace(/\bganas\b/gu, 'gano')
    .replace(/\btrabajas\b/gu, 'trabajo')
    .replace(/\bte\b/gu, 'me')
    .replace(/\btus\b/gu, 'mis')
    .replace(/\btu\b/gu, 'mi')
    .replace(/\bsus\b/gu, 'mis');
}

function withoutQuestionMarks(value: string): string {
  return value
    .replace(/^¿\s*/u, '')
    .replace(/\s*\?$/u, '')
    .trim();
}

function questionFrom(value: string): string {
  const text = toFirstPerson(withoutQuestionMarks(value));
  return `¿${text.charAt(0).toLocaleUpperCase('es')}${text.slice(1)}?`;
}

function imperative(verb: string): string {
  switch (normalizeSpanishText(verb)) {
    case 'explique':
    case 'explico':
      return 'Explícame';
    case 'cuente':
    case 'cuento':
      return 'Cuéntame';
    case 'detalle':
    case 'detallo':
      return 'Detállame';
    case 'amplie':
    case 'amplio':
      return 'Amplíame';
    case 'diga':
    case 'digo':
      return 'Dime';
    case 'muestre':
    case 'muestro':
      return 'Muéstrame';
    case 'preparo':
      return 'Prepárame';
    case 'reviso':
      return 'Revisa';
    case 'busco':
      return 'Busca';
    case 'armo':
      return 'Ármame';
    case 'redacto':
      return 'Redáctame';
    case 'revisamos':
    case 'vemos':
      return 'Revisa';
    case 'analizamos':
      return 'Analiza';
    case 'preparamos':
      return 'Prepara';
    default:
      return 'Explícame';
  }
}

/**
 * Convierte la propuesta aceptada en la consulta que se busca y se responde.
 * «¿Te gustaría saber qué documentos debes presentar?» se convierte en «¿Qué
 * documentos debo presentar?»; así el modelo responde la pregunta en vez de
 * volver a ofrecerla.
 */
export function acceptedFollowUpQuestion(pendingQuestion: string): string {
  const question = pendingQuestion.trim().replace(/\s+/gu, ' ');

  let match = /^¿?\s*te gustar[ií]a saber\s+(.+)\?$/iu.exec(question);
  if (match?.[1]) {
    const rest = withoutQuestionMarks(match[1]);
    if (/^m[aá]s\s+sobre\b/u.test(rest)) {
      return `Dame más información sobre ${toFirstPerson(
        rest.replace(/^m[aá]s\s+sobre\s+/u, ''),
      )}.`;
    }
    if (/^m[aá]s$/u.test(rest)) return 'Dame más información.';
    if (/^si\b/u.test(rest)) return questionFrom(rest.replace(/^si\s+/u, ''));
    return questionFrom(rest);
  }

  match = /^¿?\s*(?:quieres|quisieras|deseas)\s+saber\s+(.+)\?$/iu.exec(
    question,
  );
  if (match?.[1]) {
    const rest = withoutQuestionMarks(match[1]);
    if (/^m[aá]s\s+sobre\b/u.test(rest)) {
      return `Dame más información sobre ${toFirstPerson(
        rest.replace(/^m[aá]s\s+sobre\s+/u, ''),
      )}.`;
    }
    if (/^m[aá]s$/u.test(rest)) return 'Dame más información.';
    if (/^si\b/u.test(rest)) return questionFrom(rest.replace(/^si\s+/u, ''));
    return questionFrom(rest);
  }

  match =
    /^¿?\s*(?:te gustar[ií]a|quieres|quisieras|deseas)\s+que\s+te\s+(explique|cuente|detalle|ampl[ií]e|diga)\s+(.+)\?$/iu.exec(
      question,
    );
  if (match?.[1] && match[2]) {
    return `${imperative(match[1])} ${toFirstPerson(
      withoutQuestionMarks(match[2]),
    )}.`;
  }

  match =
    /^¿?\s*te\s+(explico|cuento|detallo|ampl[ií]o|digo|muestro)\s+(.+)\?$/iu.exec(
      question,
    );
  if (match?.[1] && match[2]) {
    return `${imperative(match[1])} ${toFirstPerson(
      withoutQuestionMarks(match[2]),
    )}.`;
  }

  match = /^¿?\s*te\s+(preparo|reviso|busco|armo|redacto)\s+(.+)\?$/iu.exec(
    question,
  );
  if (match?.[1] && match[2]) {
    return `${imperative(match[1])} ${toFirstPerson(
      withoutQuestionMarks(match[2]),
    )}.`;
  }

  match = /^¿?\s*te\s+resumo\s+(.+)\?$/iu.exec(question);
  if (match?.[1]) {
    return `Resume ${toFirstPerson(withoutQuestionMarks(match[1]))}.`;
  }

  match = /^¿?\s*te\s+hago\s+(?:un\s+)?resumen(?:\s+de\s+(.+))?\?$/iu.exec(
    question,
  );
  if (match) {
    const rest = match[1]
      ? ` de ${toFirstPerson(withoutQuestionMarks(match[1]))}`
      : '';
    return `Hazme un resumen${rest}.`;
  }

  match = /^¿?\s*(reviso|preparo|busco|armo|redacto)\s+(.+)\?$/iu.exec(
    question,
  );
  if (match?.[1] && match[2]) {
    return `${imperative(match[1])} ${toFirstPerson(
      withoutQuestionMarks(match[2]),
    )}.`;
  }

  match =
    /^¿?\s*(?:quieres|quisieras|deseas|te gustar[ií]a)\s+(conocer|ver|revisar)\s+(.+)\?$/iu.exec(
      question,
    );
  if (match?.[1] && match[2]) {
    return `Quiero ${match[1]} ${toFirstPerson(
      withoutQuestionMarks(match[2]),
    )}.`;
  }

  match =
    /^¿?\s*(?:quieres|quisieras|deseas)\s+m[aá]s\s+(?:informaci[oó]n|detalles?)\s+(?:sobre|de)\s+(.+)\?$/iu.exec(
      question,
    );
  if (match?.[1]) {
    return `Dame más información sobre ${toFirstPerson(
      withoutQuestionMarks(match[1]),
    )}.`;
  }

  match = /^¿?\s*te\s+ayudo\s+(a|con)\s+(.+)\?$/iu.exec(question);
  if (match?.[1] && match[2]) {
    return `Ayúdame ${match[1]} ${toFirstPerson(
      withoutQuestionMarks(match[2]),
    )}.`;
  }

  match =
    /^¿?\s*te interesa\s+(?:saber|conocer|ver|revisar)\s+m[aá]s\s+sobre\s+(.+)\?$/iu.exec(
      question,
    );
  if (match?.[1]) {
    return `Dame más información sobre ${toFirstPerson(
      withoutQuestionMarks(match[1]),
    )}.`;
  }

  match = /^¿?\s*te interesa\s+(.+)\?$/iu.exec(question);
  if (match?.[1]) {
    return `Cuéntame sobre ${toFirstPerson(withoutQuestionMarks(match[1]))}.`;
  }

  match = /^¿?\s*puedo ayudarte\s+con\s+(.+)\?$/iu.exec(question);
  if (match?.[1]) {
    return `Ayúdame con ${toFirstPerson(withoutQuestionMarks(match[1]))}.`;
  }

  match =
    /^¿?\s*te parece si\s+(revisamos|vemos|analizamos|preparamos)\s+(.+)\?$/iu.exec(
      question,
    );
  if (match?.[1] && match[2]) {
    return `${imperative(match[1])} ${toFirstPerson(
      withoutQuestionMarks(match[2]),
    )}.`;
  }

  match = /^¿?\s*necesitas algo m[aá]s sobre\s+(.+)\?$/iu.exec(question);
  if (match?.[1]) {
    return `Dime más sobre ${toFirstPerson(withoutQuestionMarks(match[1]))}.`;
  }

  match = /^¿?\s*te animas a\s+(.+)\?$/iu.exec(question);
  if (match?.[1]) {
    return `Quiero ${toFirstPerson(withoutQuestionMarks(match[1]))}.`;
  }

  // Oferta genérica («¿Te gustaría revisar tu caso?»): se conserva el verbo.
  match = /^¿?\s*(?:te gustar[ií]a|quieres|quisieras|deseas)\s+(.+)\?$/iu.exec(
    question,
  );
  if (match?.[1]) {
    return `Quiero ${toFirstPerson(withoutQuestionMarks(match[1]))}.`;
  }

  return questionFrom(withoutQuestionMarks(question));
}

export interface PendingFollowUp {
  /** Pregunta ya convertida en consulta que el RAG puede buscar. */
  question: string;
  /** La propuesta venía del bloque «Sugerencias:» de la respuesta. */
  fromSuggestions: boolean;
}

/** Cierre genérico pendiente: un «sí» debe tender un puente, no buscar en el RAG. */
export function hasGenericPendingOffer(
  messages: ChatContextMessage[],
): boolean {
  let index = messages.length - 1;
  while (index >= 0 && messages[index]?.role === 'user') {
    if (!isAffirmativeFollowUpAnswer(messages[index]?.content ?? '')) {
      return false;
    }
    index -= 1;
  }
  const last = messages[index];
  if (!last || (last.role !== 'assistant' && last.role !== 'clarification')) {
    return false;
  }
  const question =
    questionInSuggestions(last.content) ?? lastQuestion(last.content);
  return Boolean(question && isGenericOffer(question));
}

/**
 * Devuelve la propuesta pendiente cuando el último mensaje guardado es una
 * respuesta propia con una pregunta de siguiente paso. Un mensaje de
 * aclaración que pide un dato (por ejemplo, el vínculo laboral) no es una
 * propuesta y no se acepta con «sí».
 */
export function extractPendingFollowUp(
  messages: ChatContextMessage[],
): PendingFollowUp | null {
  let index = messages.length - 1;
  while (index >= 0 && messages[index]?.role === 'user') {
    if (!isAffirmativeFollowUpAnswer(messages[index]?.content ?? '')) {
      return null;
    }
    index -= 1;
  }
  const last = messages[index];
  if (!last || (last.role !== 'assistant' && last.role !== 'clarification')) {
    return null;
  }

  const suggested = questionInSuggestions(last.content);
  const question = suggested ?? lastQuestion(last.content);
  if (!question) return null;
  if (isGenericOffer(question) || asksForUserData(question)) return null;
  if (!suggested && !isOfferQuestion(question)) return null;

  const converted = acceptedFollowUpQuestion(question);
  if (isGenericOffer(converted) || asksForUserData(converted)) return null;

  return {
    fromSuggestions: Boolean(suggested),
    question: converted,
  };
}
