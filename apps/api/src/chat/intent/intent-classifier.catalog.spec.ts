import { classifyTurnIntent } from './intent-classifier';

describe('classifyTurnIntent — catálogo («¿de qué tienes información?»)', () => {
  it.each([
    '¿De qué tienes información?',
    'Hola, ¿de qué tienes información?',
    '¿Sobre qué tienes información?',
    '¿Qué información tienes?',
    '¿Qué documentos tienes?',
    '¿Qué documentos hay disponibles?',
    '¿Qué documentos están cargados?',
    '¿Qué normas tienes?',
    'dame la lista de documentos',
    '¿Qué puedo consultarte?',
    '¿Qué preguntas frecuentes hay?',
    '¿Qué me recomiendas preguntar?',
    'Dame algunos ejemplos de preguntas',
  ])('«%s» pide el catálogo, sin activar el RAG', (message) => {
    expect(classifyTurnIntent(message)).toEqual({
      lane: 'social',
      subtype: 'catalog',
    });
  });

  it.each([
    '¿Qué normas tienes sobre licencias?',
    '¿Qué documentos necesito para una licencia?',
    '¿Qué información tienes sobre el Coordinador Pedagógico?',
    '¿Qué puedo consultar si me descuentan?',
  ])('«%s» nombra un tema: es una consulta y va al RAG', (message) => {
    expect(classifyTurnIntent(message).lane).toBe('domain');
  });

  it('no altera la pregunta de capacidad existente', () => {
    expect(classifyTurnIntent('¿Qué temas manejas?')).toEqual({
      lane: 'social',
      subtype: 'capabilities',
    });
  });
});
