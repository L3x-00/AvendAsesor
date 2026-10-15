import type { RetrievedChunk } from './retrieval.gateway';
import { exactDocumentReferencesIn } from './legal-reference';
import { normalizeSpanishText } from './text-normalization';

/**
 * Desambiguación contextual de procesos cuya respuesta depende de la causal.
 * Cuando la consulta nombra el proceso pero no la causal, y la propia
 * evidencia recuperada muestra que el resultado cambia según el motivo, se
 * pide esa causal en una sola pregunta breve en lugar de presentar un
 * subconjunto especial (salud, emergencia, violencia) como si fuera la regla
 * general del trámite.
 */

const CAUSAL_PROCESS = /\b(?:reasignacion(?:es)?|reasignar(?:me|se)?)\b/u;

const CAUSALS: ReadonlyArray<{ id: string; label: string; pattern: RegExp }> = [
  {
    id: 'salud',
    label: 'salud',
    pattern:
      /\b(?:salud|enfermedad|discapacidad|tratamiento medico|licencia por salud)\b/u,
  },
  { id: 'emergencia', label: 'emergencia', pattern: /\bemergencias?\b/u },
  { id: 'violencia', label: 'violencia', pattern: /\bviolencia\b/u },
  {
    id: 'unidad-familiar',
    label: 'unidad familiar',
    pattern: /\bunidad familiar\b/u,
  },
  {
    id: 'interes-personal',
    label: 'interés personal',
    pattern: /\b(?:interes personal|motivos personales|razones personales)\b/u,
  },
];

/** Causales que la propia consulta ya nombra. */
export function causalsInQuestion(question: string): string[] {
  const text = normalizeSpanishText(question);
  return CAUSALS.filter((causal) => causal.pattern.test(text)).map(
    (causal) => causal.id,
  );
}

/** Causales distintas que la evidencia recuperada distingue. */
export function causalsInEvidence(sources: RetrievedChunk[]): string[] {
  const found = new Set<string>();
  for (const source of sources) {
    const text = normalizeSpanishText(source.chunkContent);
    for (const causal of CAUSALS) {
      if (causal.pattern.test(text)) found.add(causal.id);
    }
  }
  return CAUSALS.filter((causal) => found.has(causal.id)).map(
    (causal) => causal.label,
  );
}

/**
 * Una sola pregunta con la causal cuando la consulta es general y la evidencia
 * demuestra que el trámite se resuelve por causales distintas. Devuelve null
 * cuando la consulta ya nombra su causal, cuando identifica expresamente una
 * norma —entonces corresponde responderla con esa norma, no pedir la causal— o
 * cuando la evidencia no identifica ninguna causal. Incluso una sola causal
 * especial («por salud») no se presenta como la regla general: sin el motivo
 * de la persona corresponde pedirlo de forma breve.
 */
export function causalClarificationFor(
  question: string,
  sources: RetrievedChunk[],
): { message: string } | null {
  const text = normalizeSpanishText(question);
  if (!CAUSAL_PROCESS.test(text)) return null;
  if (causalsInQuestion(question).length) return null;
  // Lo que la persona escribió manda: una norma nombrada (RM, RSG, DS, Ley con
  // su número y año) acota la consulta a ese documento; pedir la causal dejaría
  // el turno sin respuesta. La ruta exacta ya limita la evidencia.
  if (
    exactDocumentReferencesIn(question).some((reference) => reference.complete)
  ) {
    return null;
  }

  const labels = causalsInEvidence(sources);
  if (!labels.length) return null;

  return {
    message: `Los requisitos de la reasignación cambian según el motivo. Para darte la respuesta que corresponde a tu caso, ¿cuál es la causal: ${labels.join(', ')} u otra?`,
  };
}
