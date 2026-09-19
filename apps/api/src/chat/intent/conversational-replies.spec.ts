import { buildConversationalReply } from './conversational-replies';

describe('buildConversationalReply', () => {
  it.each([
    'greeting',
    'thanks',
    'farewell',
    'capabilities',
    'out_of_domain',
  ] as const)(
    'devuelve una respuesta no vacía y SIN citas de fuentes para "%s"',
    (subtype) => {
      const reply = buildConversationalReply(subtype);

      expect(reply.length).toBeGreaterThan(0);
      // El carril amable nunca cita fuentes ni finge sustento normativo.
      expect(reply).not.toMatch(/\[\d+\]/u);
    },
  );

  it('el saludo y la capacidad declaran el alcance educativo', () => {
    expect(buildConversationalReply('greeting')).toContain('educativo');
    expect(buildConversationalReply('capabilities')).toContain('docentes');
  });

  it('fuera de ámbito declina con cortesía y reorienta al ámbito educativo', () => {
    const reply = buildConversationalReply('out_of_domain');

    expect(reply).toContain('educativo');
    expect(reply.toLowerCase()).toContain('no puedo ayudarte');
  });
});
