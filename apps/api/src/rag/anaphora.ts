import { normalizeSpanishText } from './text-normalization';

/** Pronombres y giros que siempre remiten a lo ya hablado. */
const ALWAYS_REFERS_BACK =
  /\b(?:ese|esa|eso|esos|esas|esto|dicho|dicha|dichos|dichas|ello|aquel|aquella|aquello|aquellos|aquellas|lo mismo|(?:el|la|los|las) mism[oa]s?)\b/u;

/** «este/esta/estos/estas» + palabra: demostrativo que acompaña a un sustantivo. */
const DEMONSTRATIVE = /\b(este|esta|estos|estas)\s+([a-z]+)/gu;

/** «este año», «esta semana»: tiempo presente, no remiten a lo anterior. */
const TEMPORAL =
  /^(?:ano|anos|mes|meses|semana|semanas|dia|dias|momento|periodo|ciclo|bimestre|trimestre|semestre|verano|invierno|lunes|martes|miercoles|jueves|viernes|sabado|domingo|fin)$/u;

/**
 * Lectura verbal de «esta/estas» escrito sin tilde («la permuta esta
 * permitida», «el docente esta en planilla»): participio, adjetivo de estado o
 * preposición detrás.
 */
const VERB_COMPLEMENT =
  /^(?:[a-z]+(?:ad|id)[oa]s?|(?:sujet|exent|afect|previst|dispuest|inscrit|abiert|cubiert|escrit|hech|impres|incurs)[oa]s?|vigentes?|pendientes?|en|de|a|al|con|por|para|sin|bien|mal|como|muy|ahi|aqui)$/u;

/** «está/están/estás» con tilde: siempre el verbo estar. */
const ACCENTED_VERB = /(?<!\p{L})est(?:á|án|ás)(?!\p{L})/giu;

/**
 * Remite a lo ya hablado: «durante ese tiempo», «¿y esto afecta…?», «¿esta
 * licencia es con goce?», «¿el mismo trámite sirve…?». No cuentan el verbo
 * estar («la permuta está permitida») ni el tiempo presente («este año»): esas
 * consultas se buscan por sí mismas.
 */
export function refersBack(message: string): boolean {
  const text = normalizeSpanishText(message.replace(ACCENTED_VERB, ' '));
  if (ALWAYS_REFERS_BACK.test(text)) return true;
  for (const [, demonstrative, next] of text.matchAll(DEMONSTRATIVE)) {
    if (TEMPORAL.test(next)) continue;
    if (demonstrative.startsWith('esta') && VERB_COMPLEMENT.test(next))
      continue;
    return true;
  }
  return false;
}
