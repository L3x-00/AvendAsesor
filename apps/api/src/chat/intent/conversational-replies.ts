import type { SocialSubtype } from './intent-classifier';

/**
 * Respuestas amables DETERMINISTAS para los carriles no-RAG (Hito 3, Fases 2 y 10):
 * social (saludo/agradecimiento/acuse/despedida/anuncio/capacidad), fuera de
 * ámbito y orientación cuando un pedido sin relación aparente no tiene sustento.
 *
 * No invocan el proveedor de IA ni el RAG: son plantillas fijas, por lo que
 * funcionan aun con el RAG apagado y son verificables sin proveedor. NUNCA
 * afirman contenido normativo (nada de normas, artículos ni plazos): solo
 * saludan, agradecen, se despiden, explican el alcance o declinan con cortesía
 * un tema ajeno reorientando al ámbito educativo. Toda consulta del ámbito la
 * resuelve el flujo RAG evidence-only, no este carril.
 */
const SCOPE_SENTENCE =
  'Puedo orientarte en consultas del ámbito educativo —principalmente de docentes, auxiliares de educación y directivos— sobre procesos, requisitos, plazos, derechos, obligaciones y trámites, con el sustento de los documentos disponibles.';

const EXAMPLES_SENTENCE =
  'Por ejemplo, puedes preguntarme por los requisitos de una reasignación, el plazo de una licencia o qué corresponde ante una inasistencia.';

export type ConversationalReplyKind =
  SocialSubtype | 'out_of_domain' | 'unrelated_no_evidence';

export interface ConversationalReplyOptions {
  /** Temas (módulos raíz activos) que hoy se pueden consultar. */
  topics?: readonly string[];
}

function topicsSentence(topics: readonly string[] | undefined): string {
  const names = (topics ?? [])
    .map((topic) => topic.trim())
    .filter(Boolean)
    .slice(0, 8);
  if (!names.length) return '';
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} y ${names.at(-1)}`;
  return ` Hoy puedes consultarme sobre: ${list}.`;
}

export function buildConversationalReply(
  kind: ConversationalReplyKind,
  options: ConversationalReplyOptions = {},
): string {
  switch (kind) {
    case 'greeting':
      return `¡Hola! Qué gusto saludarte. Soy AVEND ASESOR, tu asistente de consulta. ${SCOPE_SENTENCE} ¿En qué te ayudo hoy?`;
    case 'thanks':
      return 'Con mucho gusto. Si necesitas otra orientación del ámbito educativo, aquí estoy para ayudarte.';
    case 'acknowledgment':
      return 'Perfecto. Si tienes otra consulta del ámbito educativo, escríbela cuando quieras.';
    case 'farewell':
      return 'Hasta pronto. Cuando necesites orientación sobre un trámite o una norma del ámbito educativo, vuelve a escribirme.';
    case 'ask_announcement':
      return `¡Claro, con gusto! Cuéntame tu consulta con el mayor detalle posible: por ejemplo, si eres docente, auxiliar o directivo, y de qué trámite o situación se trata.${topicsSentence(options.topics)}`;
    case 'catalog':
      // Respaldo si no se pudo leer la lista de documentos.
      return `Respondo con base en los documentos oficiales cargados en la plataforma.${topicsSentence(options.topics)} ${EXAMPLES_SENTENCE} Cuéntame tu consulta con el mayor detalle posible y la busco.`;
    case 'capabilities':
      return `Soy AVEND ASESOR. ${SCOPE_SENTENCE}${topicsSentence(options.topics)} ${EXAMPLES_SENTENCE} ¿Qué necesitas consultar?`;
    case 'out_of_domain':
      return `Gracias por escribirme. Me especializo en el ámbito educativo, así que con ese tema no puedo ayudarte, pero sí en esto: ${SCOPE_SENTENCE.charAt(0).toLowerCase()}${SCOPE_SENTENCE.slice(1)} ¿Hay algo de eso en lo que pueda orientarte?`;
    case 'unrelated_no_evidence':
      return `No encontré información sobre esto en los documentos disponibles, y prefiero decírtelo antes que adivinar. Me especializo en el ámbito educativo: ${SCOPE_SENTENCE.charAt(0).toLowerCase()}${SCOPE_SENTENCE.slice(1)} Si tu consulta va por ahí, cuéntame un poco más —por ejemplo, el trámite o tu situación laboral— y la busco con gusto.`;
  }
}
