import type { SocialSubtype } from './intent-classifier';

/**
 * Respuestas amables DETERMINISTAS para los carriles no-RAG (Hito 3, Fases 2 y 10):
 * social (saludo/agradecimiento/despedida/capacidad) y fuera de ámbito.
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

export function buildConversationalReply(
  subtype: SocialSubtype | 'out_of_domain',
): string {
  switch (subtype) {
    case 'greeting':
      return `¡Hola! Soy AVEND ASESOR. ${SCOPE_SENTENCE} ¿En qué puedo ayudarte hoy?`;
    case 'thanks':
      return 'Con mucho gusto. Si necesitas otra orientación del ámbito educativo, aquí estoy para ayudarte.';
    case 'farewell':
      return 'Hasta pronto. Cuando necesites orientación sobre un trámite o una norma del ámbito educativo, vuelve a escribirme.';
    case 'capabilities':
      return `Soy AVEND ASESOR. ${SCOPE_SENTENCE} Por ejemplo, puedes preguntarme por los requisitos de una reasignación, el plazo de una licencia o qué corresponde ante una inasistencia. ¿Qué necesitas consultar?`;
    case 'out_of_domain':
      return `Gracias por escribir. Estoy especializado en el ámbito educativo, así que no puedo ayudarte con temas fuera de él. ${SCOPE_SENTENCE} ¿Hay algo de eso en lo que pueda orientarte?`;
  }
}
