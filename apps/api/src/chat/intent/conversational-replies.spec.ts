import { buildConversationalReply } from './conversational-replies';

describe('buildConversationalReply', () => {
  it.each([
    'greeting',
    'thanks',
    'acknowledgment',
    'farewell',
    'ask_announcement',
    'capabilities',
    'out_of_domain',
    'unrelated_no_evidence',
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

  it('la capacidad y el anuncio de consulta listan los temas disponibles', () => {
    const topics = [
      'Situaciones administrativas',
      'Remuneraciones',
      'Auxiliar de educación',
    ];

    expect(buildConversationalReply('capabilities', { topics })).toContain(
      'Hoy puedes consultarme sobre: Situaciones administrativas, Remuneraciones y Auxiliar de educación.',
    );
    expect(buildConversationalReply('ask_announcement', { topics })).toContain(
      'Remuneraciones',
    );
    // Sin temas (p. ej. si la lista falla) la respuesta sigue siendo válida.
    expect(buildConversationalReply('capabilities')).not.toContain(
      'Hoy puedes consultarme',
    );
  });

  it('sin evidencia y sin relación aparente, orienta sin afirmar que es ajeno', () => {
    const reply = buildConversationalReply('unrelated_no_evidence');

    expect(reply).toContain('No encontré información');
    expect(reply).toContain('docentes, auxiliares de educación y directivos');
    expect(reply.toLowerCase()).not.toContain('no puedo ayudarte');
  });

  it('fuera de ámbito declina con cortesía y reorienta al ámbito educativo', () => {
    const reply = buildConversationalReply('out_of_domain');

    expect(reply).toContain('educativo');
    expect(reply.toLowerCase()).toContain('no puedo ayudarte');
  });
});
