import type { ChatContextMessage } from './chat-history.gateway';
import {
  buildDeterministicConversationSummary,
  groundedConversationSummary,
  isConversationSummaryRequest,
} from './conversation-summary';

const messages: ChatContextMessage[] = [
  {
    content: '¿Cuánto gana un docente contratado?',
    role: 'user',
  },
  {
    content:
      'La remuneración mensual es S/ 3,500.70 para las modalidades indicadas. [1]',
    role: 'assistant',
  },
  {
    content: 'sí',
    role: 'user',
  },
  {
    content:
      '¿Qué documentos debo presentar? [1] Los requisitos están en la norma.',
    role: 'assistant',
  },
];

describe('resumen de la conversación', () => {
  it.each([
    'resume lo que hablamos',
    'en forma resumida dime lo que hablamos',
    'resume todo lo hablado en este chat',
    'hazme un resumen de esta conversación',
    'resume la conversación',
    'hazme un resumen de la conversación',
    'resúmeme lo que hablamos',
    'resuma lo que hablamos',
    'resume la sesión',
    'resumen del chat',
    'resume lo que conversamos',
    '¿qué hablamos?',
    'Prepárame un resumen.',
    'Hazme un resumen de lo que hablamos.',
    'Quiero que me prepare un resumen.',
    'Quiero un resumen.',
    'resumen de la sesión',
    'hazme un resumen de la sesión',
    '¿qué temas hemos hablado?',
    '¿me haces un resumen?',
    'resume por favor',
    'resumen, por favor',
    'resume lo que me dijiste',
    'resume tus respuestas',
    '¿de qué hemos hablado?',
    'dime lo que hablamos',
    '¿qué hemos hablado?',
    'recapitula',
  ])('detecta «%s»', (message) => {
    expect(isConversationSummaryRequest(message)).toBe(true);
  });

  it.each([
    'dame un resumen de la Ley N.° 30328',
    'resume el documento de remuneraciones',
    '¿qué documentos hablan de la ley?',
    '¿cuánto gana un docente contratado?',
    '¿qué hablamos con el director?',
    'dime lo que hablamos con el director',
    'resume brevemente los requisitos hasta ahora',
    'en resumen, ¿qué plazo rige hasta ahora?',
    'resumen de la sesión del consejo',
    'resume lo que hemos tratado con el director',
    '¿de qué hablamos cuando decimos remuneración?',
    'explícame brevemente el plazo en esta conversación',
    'en resumen, ¿qué plazo rige en esta conversación?',
    'resume el chat con la UGEL',
    'resume la sesión del consejo',
    'resume la conversación del director',
    'resume el chat de la UGEL',
    'resume la conversación que tuvimos con la UGEL',
    'resume la conversación con Juan',
    'resume lo que hablamos con Juan',
    'resume lo que hablamos en la sesión del consejo',
  ])('no confunde «%s» con un resumen de la conversación', (message) => {
    expect(isConversationSummaryRequest(message)).toBe(false);
  });

  it('genera un resumen determinista solo con lo guardado', () => {
    const summary = buildDeterministicConversationSummary(messages);

    expect(summary).toContain('En esta conversación hemos hablado');
    expect(summary).toContain('¿Cuánto gana un docente contratado?');
    expect(summary).toContain('S/ 3,500.70');
    expect(summary).toContain('¿Qué documentos debo presentar?');
    expect(summary).not.toContain('sí');
    expect(summary).not.toContain('[1]');
  });

  it('no inventa un resumen cuando todavía no hay preguntas', () => {
    expect(
      buildDeterministicConversationSummary([
        { content: 'Hola', role: 'user' },
        { content: 'Hola, ¿en qué te ayudo?', role: 'assistant' },
      ]),
    ).toContain('Todavía no hay consultas');
  });

  it('no trata una aceptación con puntuación como un tema nuevo', () => {
    const summary = buildDeterministicConversationSummary([
      { content: '¿Cuánto gana un docente contratado?', role: 'user' },
      { content: 'La remuneración es S/ 3,500.70. [1]', role: 'assistant' },
      { content: 'sí, por favor', role: 'user' },
      { content: '¿Qué documentos debo presentar? [1]', role: 'assistant' },
      { content: 'dale!', role: 'user' },
      { content: 'El plazo es de 5 días. [1]', role: 'assistant' },
      { content: 'sí, quiero', role: 'user' },
      { content: 'El requisito es el título. [1]', role: 'assistant' },
    ]);

    expect(summary).not.toContain('sí, por favor');
    expect(summary).not.toContain('dale!');
    expect(summary).not.toContain('sí, quiero');
    expect(summary).toContain('¿Cuánto gana un docente contratado?');
    expect(summary).toContain('¿Qué documentos debo presentar?');
  });

  it('no trata una negativa con puntuación como un tema nuevo', () => {
    const summary = buildDeterministicConversationSummary([
      { content: '¿Cuánto gana un docente contratado?', role: 'user' },
      { content: 'La remuneración es S/ 3,500.70. [1]', role: 'assistant' },
      { content: 'no por ahora', role: 'user' },
      { content: 'El plazo es de 5 días. [1]', role: 'assistant' },
    ]);

    expect(summary).not.toContain('no por ahora');
    expect(summary).toContain('¿Cuánto gana un docente contratado?');
  });

  it('incluye respuestas también cuando hay más de doce turnos', () => {
    const conversation: ChatContextMessage[] = [];
    for (let index = 0; index < 13; index += 1) {
      conversation.push({
        content: `¿Consulta ${index + 1} sobre remuneraciones?`,
        role: 'user',
      });
      conversation.push({
        content: `Respuesta ${index + 1} con detalle.`,
        role: 'assistant',
      });
    }

    expect(buildDeterministicConversationSummary(conversation)).toContain(
      'Respuesta: Respuesta 13 con detalle.',
    );
  });

  it('no deja el bloque de sugerencias en negrita dentro del resumen', () => {
    const summary = buildDeterministicConversationSummary([
      { content: '¿Cuánto gana un docente?', role: 'user' },
      {
        content:
          'La remuneración es S/ 3,500.70. [1]\n\n**Sugerencias:** ¿Quieres que te explique los requisitos?',
        role: 'assistant',
      },
    ]);

    expect(summary).not.toContain('Sugerencias');
    expect(summary).not.toContain('**');
    expect(summary).toContain('La remuneración es S/ 3,500.70.');
  });

  it('respeta el tope de longitud del resumen determinista', () => {
    const longConversation: ChatContextMessage[] = [];
    for (let index = 0; index < 12; index += 1) {
      longConversation.push({
        content: `¿Consulta ${index + 1} sobre remuneraciones y requisitos?`,
        role: 'user',
      });
      longConversation.push({
        content: `Respuesta ${index + 1}. ${'detalle '.repeat(80)}`,
        role: 'assistant',
      });
    }
    expect(
      buildDeterministicConversationSummary(longConversation).length,
    ).toBeLessThanOrEqual(8_000);

    const manyMessages = Array.from({ length: 100 }, (_, index) => ({
      content: `¿Consulta ${index + 1}?`,
      role: 'user' as const,
    }));
    expect(
      buildDeterministicConversationSummary(manyMessages).length,
    ).toBeLessThanOrEqual(8_000);
  });

  it('acepta un resumen generado que solo repite cifras y contenido del historial', () => {
    expect(
      groundedConversationSummary(
        'Hablamos de la remuneración mensual de S/ 3,500.70 para las modalidades indicadas.',
        messages,
      ),
    ).toBe(
      'Hablamos de la remuneración mensual de S/ 3,500.70 para las modalidades indicadas.',
    );
  });

  it('descarta un resumen con contenido que no está en el historial', () => {
    expect(
      groundedConversationSummary(
        'Hablamos de la remuneración y de los documentos para postular.',
        [
          { content: '¿Cuánto gana un docente contratado?', role: 'user' },
          {
            content: 'La remuneración mensual es S/ 3,500.70. [1]',
            role: 'assistant',
          },
        ],
      ),
    ).toBeNull();
  });

  it('descarta un eco de la pregunta y una negativa del modelo', () => {
    expect(
      groundedConversationSummary(
        '¿Cuánto gana un docente contratado?',
        messages,
      ),
    ).toBeNull();
    expect(
      groundedConversationSummary(
        'No encontré información en la conversación.',
        messages,
      ),
    ).toBeNull();
  });

  it('descarta un resumen con una cifra que no está en el historial', () => {
    expect(
      groundedConversationSummary(
        'Hablamos de una remuneración de S/ 4,400.80.',
        messages,
      ),
    ).toBeNull();
  });

  it('no confunde una cita numérica con una cifra hablada', () => {
    expect(
      groundedConversationSummary('Hablamos de un plazo de 2 días.', [
        {
          content: 'La norma dice [2] y el monto S/ 3,500.70.',
          role: 'assistant',
        },
      ]),
    ).toBeNull();
  });

  it('no acepta un cambio de unidad en un plazo', () => {
    expect(
      groundedConversationSummary('El plazo es de 5 años.', [
        { content: 'El plazo es de 5 días. [1]', role: 'assistant' },
      ]),
    ).toBeNull();
    expect(
      groundedConversationSummary('El plazo es de 5 días.', [
        { content: 'El plazo es de 5 días. [1]', role: 'assistant' },
      ]),
    ).toBe('El plazo es de 5 días.');
  });

  it('no acepta una subcadena de otra cifra', () => {
    expect(
      groundedConversationSummary('El monto es 3.', [
        { content: 'El monto es S/ 3,500.70. [1]', role: 'assistant' },
      ]),
    ).toBeNull();
  });

  it('no acepta cifras correctas intercambiadas entre temas', () => {
    expect(
      groundedConversationSummary(
        'La jornada es de 5 días y el plazo es de 30 horas.',
        [
          { content: 'El plazo es de 5 días.', role: 'assistant' },
          { content: 'La jornada es de 30 horas.', role: 'assistant' },
        ],
      ),
    ).toBeNull();
    expect(
      groundedConversationSummary(
        'La bonificación es de S/ 3,500.70, la remuneración mensual es de S/ 500.',
        [
          {
            content:
              'La bonificación es de S/ 500, la remuneración mensual es de S/ 3,500.70. [1]',
            role: 'assistant',
          },
        ],
      ),
    ).toBeNull();
    expect(
      groundedConversationSummary(
        'El plazo es de 5 días y la jornada es de 30 horas.',
        [
          { content: 'El plazo es de 5 días.', role: 'assistant' },
          { content: 'La jornada es de 30 horas.', role: 'assistant' },
        ],
      ),
    ).toBe('El plazo es de 5 días y la jornada es de 30 horas.');
  });

  it('acepta un resumen que omite palabras incidentales del asistente', () => {
    const conversation: ChatContextMessage[] = [
      {
        content: '¿Cuál es la remuneración mensual del docente contratado?',
        role: 'user',
      },
      {
        content:
          'La remuneración mensual del docente contratado es de S/ 3,500.70 según la norma vigente.',
        role: 'assistant',
      },
      { content: '¿Cuál es el plazo y la jornada?', role: 'user' },
      {
        content: 'El plazo es de 5 días y la jornada es de 30 horas semanales.',
        role: 'assistant',
      },
    ];

    expect(
      groundedConversationSummary(
        'Hablamos de la remuneración mensual de S/ 3,500.70 para el docente contratado.',
        conversation,
      ),
    ).toBe(
      'Hablamos de la remuneración mensual de S/ 3,500.70 para el docente contratado.',
    );
    expect(
      groundedConversationSummary(
        'El plazo es de 5 días y la jornada es de 30 horas.',
        conversation,
      ),
    ).toBe('El plazo es de 5 días y la jornada es de 30 horas.');
  });

  it('no acepta numerales en palabras ni cualificadores no sustentados', () => {
    expect(
      groundedConversationSummary('El plazo es de doscientos días.', [
        { content: 'El plazo es de 5 días. [1]', role: 'assistant' },
      ]),
    ).toBeNull();
    expect(
      groundedConversationSummary('El plazo es de 5 días hábiles.', [
        { content: 'El plazo es de 5 días. [1]', role: 'assistant' },
      ]),
    ).toBeNull();
    expect(
      groundedConversationSummary('El monto es de 5 soles.', [
        { content: 'El monto es de 5 días. [1]', role: 'assistant' },
      ]),
    ).toBeNull();
  });

  it('no acepta «un día», «una semana» o «medio día» frente a otra cifra', () => {
    expect(
      groundedConversationSummary('El plazo es de un día.', [
        { content: 'El plazo es de 5 días. [1]', role: 'assistant' },
      ]),
    ).toBeNull();
    expect(
      groundedConversationSummary('El plazo es de una semana.', [
        { content: 'El plazo es de 5 días. [1]', role: 'assistant' },
      ]),
    ).toBeNull();
    expect(
      groundedConversationSummary('El plazo es de medio día.', [
        { content: 'El plazo es de 5 días. [1]', role: 'assistant' },
      ]),
    ).toBeNull();
  });

  it('acepta cifras escritas con palabras si el valor coincide', () => {
    expect(
      groundedConversationSummary('El plazo es de cinco días.', [
        { content: 'El plazo es de 5 días. [1]', role: 'assistant' },
      ]),
    ).toBe('El plazo es de cinco días.');
  });

  it('descarta un resumen vacío o una negativa del modelo', () => {
    expect(groundedConversationSummary('Resumen.', messages)).toBeNull();
    expect(
      groundedConversationSummary(
        'No tengo acceso al historial de esta conversación.',
        messages,
      ),
    ).toBeNull();
  });

  it('descarta un resumen con citas o marcas internas', () => {
    expect(
      groundedConversationSummary('La respuesta fue [1].', messages),
    ).toBeNull();
    expect(
      groundedConversationSummary('La respuesta fue [1, 2].', messages),
    ).toBeNull();
    expect(
      groundedConversationSummary('[[SIN_SUSTENTO]]', messages),
    ).toBeNull();
  });
});
