import { jornadaClarificationExplanation } from './clarification-explanation';
import type { ChatContextMessage } from './chat-history.gateway';

const pending: ChatContextMessage = {
  role: 'clarification',
  content:
    'Para darte la cifra correcta necesito un solo dato: ¿tu jornada es de 30 o de 40 horas? Con eso te indico el monto vigente que te corresponde y su alcance.',
};

describe('explicación de la aclaración de jornada', () => {
  it.each([
    'que tiene que ver la horanda?',
    'pero que tiene que ver la jornada? no entiendo',
    '¿Qué tiene que ver la jornada de 30 o 40 horas?',
    '¿Por qué me preguntas por la jornada?',
    '¿Para qué necesitas ese dato?',
    '¿Para qué sirve la jornada?',
    '¿Y por qué 30 o 40 horas?',
    'no entiendo',
    'No entiendo, ¿qué tiene que ver la jornada?',
    'Disculpa, ¿por qué me preguntas por la jornada?',
    'Disculpa, no entiendo, ¿qué tiene que ver la jornada?',
  ])('explica el dato solicitado: %s', (question) => {
    const answer = jornadaClarificationExplanation(question, pending);
    expect(answer).toContain('Este dato es importante porque');
    expect(answer).toContain('montos asociados a jornadas diferentes');
    expect(answer).not.toContain('¿tu jornada es');
    expect(answer).not.toMatch(/S\/?\.|\[\d+\]/u);
  });

  it('mantiene pendiente el dato si vuelve a pedir una explicación', () => {
    const answer = jornadaClarificationExplanation('no entiendo', pending)!;
    expect(
      jornadaClarificationExplanation('¿Qué tiene que ver eso?', {
        content: answer,
        role: 'clarification',
      }),
    ).toBe(answer);
  });

  it.each([
    '30',
    '40 horas',
    'Mi jornada es de 30 horas',
    'No entiendo, mi jornada es de 40 horas',
    'Disculpa, mi jornada es de 40 horas',
    'No entiendo, ¿qué tiene que ver la jornada con los requisitos?',
    'Disculpa, ¿qué dispone la RSG 326-2017-MINEDU sobre la jornada?',
    '¿Por qué se amplió la jornada?',
    '¿Qué tiene que ver la jornada con los requisitos de contratación?',
    '¿Qué dispone la RSG 326-2017-MINEDU sobre la jornada?',
    '¿Para qué necesitas ese dato y cuáles son los requisitos?',
    'Otra consulta: ¿qué tiene que ver la jornada?',
    'No pregunto por sueldo, ¿qué requisitos necesito para ser auxiliar?',
  ])(
    'conserva el flujo normal para respuesta, tema propio o consulta mixta: %s',
    (question) => {
      expect(jornadaClarificationExplanation(question, pending)).toBeNull();
    },
  );

  it.each<ChatContextMessage | undefined>([
    undefined,
    { ...pending, role: 'assistant' },
    { ...pending, role: 'user' },
    { ...pending, role: 'no_evidence' },
    { role: 'clarification', content: '¿Qué trámite deseas consultar?' },
    {
      role: 'clarification',
      content:
        'Para darte la cifra correcta necesito un solo dato: ¿tu vínculo es contratado o nombrado?',
    },
  ])(
    'no explica una jornada sin que siga pendiente esa aclaración: %j',
    (previous) => {
      expect(
        jornadaClarificationExplanation('no entiendo', previous),
      ).toBeNull();
    },
  );
});
