import type { ChatContextMessage } from './chat-history.gateway';
import {
  acceptedFollowUpQuestion,
  extractPendingFollowUp,
  hasGenericPendingOffer,
  isAffirmativeFollowUpAnswer,
} from './follow-up';

const assistantWithSuggestion: ChatContextMessage = {
  content:
    'La remuneración mensual de un docente contratado varía según la modalidad. [1]\n\n' +
    'Sugerencias: ¿Te gustaría saber qué documentos debes presentar para acceder a estos cargos?',
  role: 'assistant',
};

describe('seguimientos conversacionales', () => {
  it.each([
    'sí',
    'Si',
    'sí, por favor',
    'sí, dale',
    'sí, ok',
    'sí, quiero',
    'sí, de acuerdo',
    'sí, correcto',
    'sí, quiero saber más',
    'sí, gracias',
    'sí 👍',
    'pues sí',
    'claro que sí',
    'desde luego',
    'vale',
    'sí, vale',
    'sí, explícame',
    'sí, cuéntame',
    'sí, más información',
    'sí, dame más detalles',
    'de una',
    'obvio',
    'me gustaría',
    'quiero saber',
    'por favor',
  ])('reconoce «%s» como aceptación', (message) => {
    expect(isAffirmativeFollowUpAnswer(message)).toBe(true);
  });

  it.each([
    'sí, pero ¿y si soy contratado?',
    'sí quiero la ley',
    'sí, más información sobre la ley',
    'no',
    'no gracias',
    'no por ahora',
    'gracias',
    'perfecto, gracias',
    'listo, gracias',
    'ok, gracias',
    'luego',
    'sí, desde 2020',
    'sí, 2',
  ])('no trata «%s» como una aceptación limpia', (message) => {
    expect(isAffirmativeFollowUpAnswer(message)).toBe(false);
  });

  it('extrae la propuesta del bloque «Sugerencias:» y la convierte en consulta', () => {
    const pending = extractPendingFollowUp([assistantWithSuggestion]);

    expect(pending).toEqual({
      fromSuggestions: true,
      question: '¿Qué documentos debo presentar para acceder a estos cargos?',
    });
  });

  it('acepta una pregunta sugerida aunque no empiece con una oferta', () => {
    const pending = extractPendingFollowUp([
      {
        content:
          'La norma regula el procedimiento. [1]\n\nSugerencias: ¿Cuáles son los requisitos para postular?',
        role: 'assistant',
      },
    ]);

    expect(pending).toEqual({
      fromSuggestions: true,
      question: '¿Cuáles son los requisitos para postular?',
    });
  });

  it('reconoce el encabezado de sugerencias con markdown', () => {
    const pending = extractPendingFollowUp([
      {
        content:
          'La norma regula el procedimiento. [1]\n\n### Sugerencias\n¿Quieres que te explique los requisitos?',
        role: 'assistant',
      },
    ]);

    expect(pending?.question).toBe('Explícame los requisitos.');
  });

  it('convierte una oferta de explicación en una petición directa', () => {
    expect(
      acceptedFollowUpQuestion(
        '¿Quieres que te explique cómo se evalúa el expediente?',
      ),
    ).toBe('Explícame cómo se evalúa el expediente.');
    expect(acceptedFollowUpQuestion('¿Te cuento los pasos?')).toBe(
      'Cuéntame los pasos.',
    );
    expect(
      acceptedFollowUpQuestion(
        '¿Quieres más información sobre la reasignación?',
      ),
    ).toBe('Dame más información sobre la reasignación.');
  });

  it('convierte las variantes naturales de una oferta', () => {
    expect(
      acceptedFollowUpQuestion('¿Te gustaría saber más sobre el proceso?'),
    ).toBe('Dame más información sobre el proceso.');
    expect(
      acceptedFollowUpQuestion('¿Quieres saber más sobre los requisitos?'),
    ).toBe('Dame más información sobre los requisitos.');
    expect(
      acceptedFollowUpQuestion('¿Quieres saber si cumples los requisitos?'),
    ).toBe('¿Cumplo los requisitos?');
    expect(acceptedFollowUpQuestion('¿Quieres saber cuánto ganas?')).toBe(
      '¿Cuánto gano?',
    );
    expect(acceptedFollowUpQuestion('¿Quieres conocer tus derechos?')).toBe(
      'Quiero conocer mis derechos.',
    );
    expect(acceptedFollowUpQuestion('¿Te ayudo con la solicitud?')).toBe(
      'Ayúdame con la solicitud.',
    );
    expect(acceptedFollowUpQuestion('¿Te gustaría revisar el documento?')).toBe(
      'Quiero revisar el documento.',
    );
    expect(
      acceptedFollowUpQuestion('¿Quieres que te prepare un resumen?'),
    ).toBe('Quiero que me prepare un resumen.');
  });

  it('convierte las ofertas con «te preparo/reviso/busco»', () => {
    expect(acceptedFollowUpQuestion('¿Te preparo un resumen?')).toBe(
      'Prepárame un resumen.',
    );
    expect(acceptedFollowUpQuestion('¿Te reviso el expediente?')).toBe(
      'Revisa el expediente.',
    );
    expect(acceptedFollowUpQuestion('¿Te busco los requisitos?')).toBe(
      'Busca los requisitos.',
    );
    expect(acceptedFollowUpQuestion('¿Reviso tu caso?')).toBe(
      'Revisa mi caso.',
    );
  });

  it('rechaza cierres genéricos y preguntas de datos personales', () => {
    for (const content of [
      'La norma regula el procedimiento. [1]\n\n¿Te interesa el tema?',
      'La norma regula el procedimiento. [1]\n\n¿Puedo ayudarte con algo más?',
      'La norma regula el procedimiento. [1]\n\n¿Te ayudo?',
      'La norma regula el procedimiento. [1]\n\n¿Te ayudo con algo más?',
      'La norma regula el procedimiento. [1]\n\n¿Necesitas algo más?',
      'La norma regula el procedimiento. [1]\n\n¿Quieres saber más?',
      'La norma regula el procedimiento. [1]\n\n¿Te gustaría saber más?',
      'La norma regula el procedimiento. [1]\n\n¿Quieres indicarme tu vínculo?',
      'La norma regula el procedimiento. [1]\n\n¿Quieres saber cuántas horas trabajas?',
      'La norma regula el procedimiento. [1]\n\n¿Quieres decirme cuántas horas trabajas?',
      'La norma regula el procedimiento. [1]\n\nSugerencias: ¿Cuál es tu vínculo laboral?',
    ]) {
      expect(
        extractPendingFollowUp([{ content, role: 'assistant' }]),
      ).toBeNull();
    }
  });

  it('convierte ofertas concretas con «te interesa / puedo ayudarte / te parece»', () => {
    const cases: Array<[string, string]> = [
      [
        '¿Te interesa saber más sobre los requisitos?',
        'Dame más información sobre los requisitos.',
      ],
      ['¿Puedo ayudarte con los requisitos?', 'Ayúdame con los requisitos.'],
      ['¿Te parece si revisamos tu caso?', 'Revisa mi caso.'],
      [
        '¿Necesitas algo más sobre la reasignación?',
        'Dime más sobre la reasignación.',
      ],
      ['¿Te animas a revisar tu caso?', 'Quiero revisar mi caso.'],
      ['¿Te resumo lo que hablamos?', 'Resume lo que hablamos.'],
      [
        '¿Te hago un resumen de lo que hablamos?',
        'Hazme un resumen de lo que hablamos.',
      ],
    ];

    for (const [question, expected] of cases) {
      const pending = extractPendingFollowUp([
        {
          content: `La norma regula el procedimiento. [1]\n\n${question}`,
          role: 'assistant',
        },
      ]);
      expect(pending?.question).toBe(expected);
    }
  });

  it('no confunde una pregunta general sobre niveles con un dato personal', () => {
    const pending = extractPendingFollowUp([
      {
        content:
          'La norma regula el procedimiento. [1]\n\n¿Quieres saber cuál es el nivel de un docente?',
        role: 'assistant',
      },
    ]);

    expect(pending?.question).toBe('¿Cuál es el nivel de un docente?');
  });

  it('no confunde una duración general con las horas de la jornada personal', () => {
    const pending = extractPendingFollowUp([
      {
        content:
          'La norma regula el procedimiento. [1]\n\n¿Quieres saber cuántas horas dura el trámite?',
        role: 'assistant',
      },
    ]);

    expect(pending?.question).toBe('¿Cuántas horas dura el trámite?');
  });

  it('limpia los adornos finales de la pregunta sugerida', () => {
    const pending = extractPendingFollowUp([
      {
        content:
          'La norma regula el procedimiento. [1]\n\nSugerencias: **¿Quieres que te explique los requisitos?**',
        role: 'assistant',
      },
    ]);

    expect(pending?.question).toBe('Explícame los requisitos.');
  });

  it('recupera la propuesta si un «sí» anterior quedó sin respuesta', () => {
    const pending = extractPendingFollowUp([
      assistantWithSuggestion,
      { content: 'sí', role: 'user' },
      { content: 'sí', role: 'user' },
    ]);

    expect(pending?.question).toBe(
      '¿Qué documentos debo presentar para acceder a estos cargos?',
    );
  });

  it('no reutiliza la propuesta si en medio hay una pregunta sustantiva', () => {
    expect(
      extractPendingFollowUp([
        assistantWithSuggestion,
        { content: 'sí', role: 'user' },
        { content: '¿Cuánto gana un director?', role: 'user' },
        { content: 'sí', role: 'user' },
      ]),
    ).toBeNull();
  });

  it('acepta una oferta final sin el bloque «Sugerencias:»', () => {
    const pending = extractPendingFollowUp([
      {
        content:
          'La norma regula el procedimiento. [1]\n\n¿Quieres que te explique los requisitos?',
        role: 'assistant',
      },
    ]);

    expect(pending?.question).toBe('Explícame los requisitos.');
  });

  it('no acepta con «sí» una aclaración que pide un dato', () => {
    const pending = extractPendingFollowUp([
      {
        content:
          'Para darte la cifra correcta necesito un solo dato: ¿tu vínculo es contratado o nombrado?',
        role: 'clarification',
      },
    ]);

    expect(pending).toBeNull();
  });

  it('no acepta una pregunta informativa final que no es una oferta', () => {
    const pending = extractPendingFollowUp([
      {
        content:
          'El plazo es de cinco días. [1]\n\n¿Cuál es tu nivel educativo?',
        role: 'assistant',
      },
    ]);

    expect(pending).toBeNull();
  });

  it('no toma el «Sugerencias:» de una respuesta sin pregunta', () => {
    const pending = extractPendingFollowUp([
      {
        content:
          'La respuesta está sustentada. [1]\n\nSugerencias: revisa los documentos oficiales.',
        role: 'assistant',
      },
    ]);

    expect(pending).toBeNull();
  });

  it('no interpreta una respuesta social sin propuesta pendiente', () => {
    expect(
      extractPendingFollowUp([
        { content: 'Hola, ¿en qué te ayudo?', role: 'assistant' },
        { content: 'gracias', role: 'user' },
      ]),
    ).toBeNull();
  });

  it('detecta cierres genéricos pendientes sin convertirlos en consulta', () => {
    for (const content of [
      '¿Necesitas algo más?',
      '¿Quieres saber más?',
      '¿Te gustaría saber más?',
      '¿Te interesa saber más?',
      '¿Te ayudo con algo más?',
      '¿Puedo ayudarte con algo más?',
    ]) {
      expect(
        extractPendingFollowUp([{ content, role: 'assistant' }]),
      ).toBeNull();
      expect(hasGenericPendingOffer([{ content, role: 'assistant' }])).toBe(
        true,
      );
    }
    expect(
      hasGenericPendingOffer([
        { content: '¿Te preparo un resumen?', role: 'assistant' },
      ]),
    ).toBe(false);
  });
});
