import {
  asksForEvidenceProvenance,
  provenanceAfterNoEvidenceMessage,
  salaryInsufficiencyMessage,
} from './evidence-provenance';

describe('asksForEvidenceProvenance', () => {
  it.each([
    '¿De dónde sacas esa información?',
    '¿Dónde está la sustentación documental de esta información?',
    '¿Cuál es el fundamento de esta respuesta?',
    '¿Qué documento respalda esa respuesta?',
    '¿De qué fuente sale esto?',
  ])('reconoce la pregunta por el origen: %s', (question) => {
    expect(asksForEvidenceProvenance(question)).toBe(true);
  });

  it.each([
    '¿Cuánto gana un docente?',
    'Hola',
    '¿Qué hago si me sancionan?',
    '¿Qué documentos necesito para una licencia?',
    '¿Cuál es la fuente del descuento?',
  ])('no activa la ruta en otras preguntas: %s', (question) => {
    expect(asksForEvidenceProvenance(question)).toBe(false);
  });
});

describe('mensajes de insuficiencia', () => {
  it('no afirma contenido normativo ni inventa citas', () => {
    for (const message of [
      salaryInsufficiencyMessage(),
      provenanceAfterNoEvidenceMessage(),
    ]) {
      expect(message).not.toMatch(/\[\d+\]/u);
      expect(message).not.toContain('Artículo');
      expect(message.toLowerCase()).toContain('no');
    }
  });
});
