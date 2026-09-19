import { classifyTurnIntent } from './intent-classifier';

describe('classifyTurnIntent', () => {
  describe('carril social (sin activar el RAG)', () => {
    it.each([
      ['Hola', 'greeting'],
      ['hola!!', 'greeting'],
      ['Holaa', 'greeting'],
      ['Buenos días', 'greeting'],
      ['buenas tardes', 'greeting'],
      ['Buenas', 'greeting'],
      ['qué tal', 'greeting'],
    ])('clasifica "%s" como saludo', (message, subtype) => {
      expect(classifyTurnIntent(message)).toEqual({
        lane: 'social',
        subtype,
      });
    });

    it.each([
      ['Gracias', 'thanks'],
      ['muchas gracias', 'thanks'],
      ['Mil gracias 🙏', 'thanks'],
      ['te lo agradezco', 'thanks'],
      ['muy amable', 'thanks'],
    ])('clasifica "%s" como agradecimiento', (message, subtype) => {
      expect(classifyTurnIntent(message)).toEqual({
        lane: 'social',
        subtype,
      });
    });

    it.each([
      ['Adiós', 'farewell'],
      ['hasta luego', 'farewell'],
      ['chau', 'farewell'],
      ['nos vemos', 'farewell'],
    ])('clasifica "%s" como despedida', (message, subtype) => {
      expect(classifyTurnIntent(message)).toEqual({
        lane: 'social',
        subtype,
      });
    });

    it.each([
      '¿Qué puedes hacer?',
      '¿Quién eres?',
      '¿en qué me puedes ayudar?',
      '¿para qué sirves?',
      'necesito ayuda',
      'ayuda',
    ])('clasifica "%s" como pregunta de capacidad', (message) => {
      expect(classifyTurnIntent(message)).toEqual({
        lane: 'social',
        subtype: 'capabilities',
      });
    });
  });

  describe('carril de dominio educativo (activa el RAG)', () => {
    it.each([
      // Ejemplos textuales del lineamiento del cliente (punto 3), sin nombrar módulo
      '¿Puedo solicitar destaque si estoy nombrado?',
      '¿Cuáles son los requisitos para una reasignación?',
      '¿Qué sucede si un auxiliar tiene una inasistencia?',
      '¿Quién reemplaza al director cuando se encuentra de licencia?',
      // Otros del dominio
      '¿Cuánto dura una licencia por enfermedad?',
      'Quiero apelar una sanción disciplinaria',
      '¿Qué dice la resolución sobre el plazo de respuesta?',
      'requisitos para una encargatura de dirección',
    ])('enruta "%s" al RAG', (message) => {
      expect(classifyTurnIntent(message)).toEqual({
        lane: 'domain',
        subtype: 'domain_query',
      });
    });

    it('prevalece la consulta cuando el saludo la acompaña (punto 11)', () => {
      expect(
        classifyTurnIntent(
          'Buenos días, quisiera saber cuánto tiempo tiene un director para responder esta solicitud.',
        ),
      ).toEqual({ lane: 'domain', subtype: 'domain_query' });
    });

    it('detecta la consulta aunque venga disfrazada de charla', () => {
      expect(
        classifyTurnIntent('entre nosotros, ¿cuántos días de permiso tengo?'),
      ).toEqual({ lane: 'domain', subtype: 'domain_query' });
    });

    it('un saludo seguido de consulta sin término compartido va a dominio', () => {
      expect(
        classifyTurnIntent(
          'hola, ¿cuáles son los requisitos para una reasignación?',
        ),
      ).toEqual({ lane: 'domain', subtype: 'domain_query' });
    });

    it('es robusto a la ausencia de tildes', () => {
      expect(classifyTurnIntent('cual es el plazo de la reasignacion')).toEqual(
        {
          lane: 'domain',
          subtype: 'domain_query',
        },
      );
    });
  });

  describe('carril fuera de ámbito', () => {
    it.each([
      '¿Qué tiempo hace hoy?',
      '¿quién ganó el partido de fútbol?',
      'dame una receta para cocinar arroz',
      'cuéntame un chiste',
    ])('clasifica "%s" como fuera de ámbito', (message) => {
      expect(classifyTurnIntent(message)).toEqual({
        lane: 'out_of_scope',
        subtype: 'out_of_domain',
      });
    });
  });

  describe('fail-closed', () => {
    it('ante duda razonable (sin señal social ni ajena clara) enruta al RAG', () => {
      expect(
        classifyTurnIntent('necesito una orientación sobre mi caso'),
      ).toEqual({ lane: 'domain', subtype: 'domain_query' });
    });

    it('un mensaje vacío o solo signos cae en dominio por seguridad', () => {
      expect(classifyTurnIntent('   ')).toEqual({
        lane: 'domain',
        subtype: 'domain_query',
      });
      expect(classifyTurnIntent('¿?')).toEqual({
        lane: 'domain',
        subtype: 'domain_query',
      });
    });
  });
});
