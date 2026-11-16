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
// Preguntas de posibilidad o destino («¿puedo ir a otra UGEL?») tienen una
// respuesta general verificable antes de que la causal refine requisitos y
// documentos. No se deben cortar con una aclaración vacía.
const REASSIGNMENT_ELIGIBILITY = /\b(?:puedo|puede|es\s+posible)\b/u;
const REASSIGNMENT_DESTINATION =
  /\b(?:otra|distinta)\s+(?:ugel|dre|provincia|region)\b|\b(?:ir(?:se)?|trasladar(?:me|se)?)\s+a\s+(?:otra|distinta)\b/u;

/**
 * La consulta pide identificar la norma del proceso, no resolver el caso
 * propio. Interrumpirla con la causal dejaría sin respuesta exactamente lo que
 * se preguntó («¿cuál es la norma técnica de la reasignación?»), así que se
 * responde con la norma que el corpus ya identifica.
 *
 * La condición es la IDENTIDAD de la norma (qué norma es, cuál la regula, cuál
 * es su base legal). «Qué requisitos pide la norma para la reasignación» solo
 * menciona la norma como fuente de un pedido que sigue dependiendo de la
 * causal, y conserva su aclaración.
 */
const NORM_IDENTITY_REQUEST =
  /\bnorma(?:s)?\s+(?:tecnica(?:s)?|que\s+(?:regula|rige)|aplicable(?:s)?|vigente(?:s)?)\b|\bcual(?:es)?\s+(?:es|son)\s+(?:(?:la|las|el)\s+)?(?:norma(?:s)?|ley|resolucion|marco\s+legal|base\s+legal)\b|\bque\s+norma(?:s)?\s+(?:regula|rige|aplica)\b|\bbase\s+legal\b|\bmarco\s+legal\b|\bque\s+(?:ley|resolucion|documento)\s+(?:regula|rige|aprueba)\b/u;

const CAUSALS: ReadonlyArray<{
  id: string;
  label: string;
  pattern: RegExp;
  /** La evidencia solo acredita la causal con su nombre técnico. */
  evidencePattern?: RegExp;
}> = [
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
    // La persona suele describir la causal con su situación, no con el nombre
    // técnico: «mi familia vive allá», «mis hijos», «mi esposo». La evidencia,
    // en cambio, debe nombrar la causal del proceso.
    pattern:
      /\b(?:unidad familiar|familia(?:r|res)?|hij[oa]s?|conyuge|espos[oa]|pareja|reunirme con mi familia)\b/u,
    evidencePattern: /\bunidad familiar\b/u,
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

/**
 * Nombres con que el corpus denomina las causales declaradas. Se usan para
 * ampliar la consulta de búsqueda con la sección que rige ese motivo, no para
 * afirmar que la persona cumpla el supuesto.
 */
export function causalLabelsInQuestion(question: string): string[] {
  const declared = causalsInQuestion(question);
  return CAUSALS.filter((causal) => declared.includes(causal.id)).map(
    (causal) => causal.label,
  );
}

/** Causales distintas que la evidencia recuperada distingue. */
export function causalsInEvidence(sources: RetrievedChunk[]): string[] {
  const found = new Set<string>();
  for (const source of sources) {
    const text = normalizeSpanishText(source.chunkContent);
    for (const causal of CAUSALS) {
      if ((causal.evidencePattern ?? causal.pattern).test(text)) {
        found.add(causal.id);
      }
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
  if (
    REASSIGNMENT_ELIGIBILITY.test(text) &&
    REASSIGNMENT_DESTINATION.test(text)
  )
    return null;
  if (causalsInQuestion(question).length) return null;
  // La identidad de la norma se responde con la norma; pedir la causal la
  // dejaría sin contestar. Un pedido de requisitos, plazos o documentos solo
  // menciona la norma como fuente: esos datos cambian según la causal.
  // «Procedimiento» no cuenta: forma parte del nombre de la norma («norma
  // técnica del procedimiento de reasignación»).
  if (
    NORM_IDENTITY_REQUEST.test(text) &&
    !/\b(?:requisitos?|plazos?|documentos?|etapas?)\b/u.test(text)
  )
    return null;
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
