import { normalizeSpanishText } from '../../rag/text-normalization';

/**
 * El docente pregunta por el origen de una respuesta que no tuvo sustento
 * documental. Se responde de forma determinista: se explica la limitación sin
 * inventar una cita. No afirma contenido normativo.
 */
export function asksForEvidenceProvenance(question: string): boolean {
  const text = normalizeSpanishText(question);
  if (
    !/\b(?:est[ao]s?|est[ae]|es[ao]s?|eso|ello|anterior|respuesta)\b/u.test(
      text,
    )
  ) {
    return false;
  }
  // Palabras de procedencia/origen: basta una de ellas. No se incluye
  // «documento» suelto porque «¿qué documentos necesito?» no pide sustento.
  return /\b(?:sustent\p{L}*|fundament\p{L}*|fuentes?|citas?|respald\p{L}*|de donde|de que fuente|de que documento|procedencia)\b/u.test(
    text,
  );
}

/** Se usa cuando una respuesta salarial no pudo citar ningún fragmento. */
export function salaryInsufficiencyMessage(): string {
  return (
    'No pude darte una respuesta con sustento documental para esa comparación. ' +
    'No voy a inventar una cita: revisé la documentación disponible, pero no ' +
    'encontré un fragmento que permita afirmar esa tabla de incrementos. ' +
    'Puedes reformular la consulta (por ejemplo, pidiendo un año o un cargo) o ' +
    'preguntar qué documentos de remuneración hay disponibles.'
  );
}

/** Respuesta a «¿de dónde sacas esto?» después de una insuficiencia. */
export function provenanceAfterNoEvidenceMessage(): string {
  return (
    'La respuesta anterior no provino de un documento: fue una limitación de la ' +
    'evidencia disponible, no una afirmación normativa. Por eso no hay una cita ' +
    'que mostrar y no voy a fabricarla. Si quieres, puedo decirte qué documentos ' +
    'de remuneración están disponibles o puedes precisar un año o un cargo para ' +
    'buscar una cita real.'
  );
}
