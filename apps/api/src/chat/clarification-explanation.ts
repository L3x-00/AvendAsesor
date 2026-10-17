import { normalizeSpanishText } from '../rag/text-normalization';
import type { ChatContextMessage } from './chat-history.gateway';

const JORNADA_EXPLANATION =
  'Este dato es importante porque necesito distinguir entre montos asociados a jornadas diferentes y evitar darte una cifra que no corresponda a tu caso. Te pedí las horas semanales para precisar una consulta de remuneración. Si preguntabas por requisitos u otro tema, puedes aclararlo para retomar tu consulta.';

// «Horanda» se acepta solo en esta réplica al dato solicitado, no como
// normalización del corpus ni como una declaración de horas de la persona.
const HOURS = '\\d{1,2}(?: (?:o|y) (?:de )?\\d{1,2})?(?: horas)?';
const REFERENCE = `(?:(?:la |mi |tu )?(?:jornada|horanda)(?: (?:de )?${HOURS})?|las horas|ese dato|eso|${HOURS})`;
const EXPLANATION_REQUEST = new RegExp(
  `^(?:que tiene que ver ${REFERENCE}|por que (?:me )?(?:preguntas|pides|solicitas)(?: por)? ${REFERENCE}|para que (?:necesitas|me pides|quieres saber|sirve) ${REFERENCE}|por que ${REFERENCE})$`,
  'u',
);

/** Explica una aclaración propia aún pendiente; no contesta una norma. */
export function jornadaClarificationExplanation(
  question: string,
  previousReply: ChatContextMessage | undefined,
): string | null {
  if (previousReply?.role !== 'clarification') return null;
  const pendingJornada =
    previousReply.content === JORNADA_EXPLANATION ||
    /^Para darte la cifra correcta necesito un solo dato: ¿(?:tu jornada es de|cuántas horas de jornada laboras)/u.test(
      previousReply.content,
    );
  if (!pendingJornada) return null;

  const text = normalizeSpanishText(question)
    .replace(/[¿?¡!.,;:]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(
      /^(?:(?:pero|y|entonces|disculpa|disculpe|perdon|no entiendo) )+/u,
      '',
    );
  const request = text.replace(/ no entiendo$/u, '');
  return request === 'no entiendo' || EXPLANATION_REQUEST.test(request)
    ? JORNADA_EXPLANATION
    : null;
}
