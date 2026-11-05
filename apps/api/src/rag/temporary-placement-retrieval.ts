import { normalizeSpanishText } from './text-normalization';

/** Vocabulario de búsqueda, sin convertir una inferencia en respuesta. */
export function temporaryPlacementQueries(question: string): string[] {
  const text = normalizeSpanishText(question);
  if (
    /\bno\s+(?:quiero|deseo|necesito|busco)\s+(?:trabajar|irme|trasladarme|desplazarme|cambiarme)\b/u.test(
      text,
    )
  )
    return [];
  if (
    /\b(?:auxiliar(?:es)?|contratad[oa]s?|estacionamiento|aparcamiento|parking|vehicul\p{L}*)\b/u.test(
      text,
    )
  )
    return [];
  const school =
    /\b(?:colegio|escuela|institucion educativa|docente|profesor(?:a)?)\b/u.test(
      text,
    );
  const otherWorkplace =
    /\b(?:otr[oa]\s+(?:colegio|escuela|institucion educativa|ugel|dre)|(?:trasladar|desplazar|mover|cambiar)(?:me|se)?\s+(?:a|hacia))\b/u.test(
      text,
    );
  const temporary =
    /\b(?:temporal(?:mente)?|por\s+(?:un|algun)\s+tiempo|provisionalmente)\b/u.test(
      text,
    );
  const retainsPosition =
    /\b(?:sin\s+perder|no\s+(?:quiero|deseo)\s+perder|conservar|mantener)\b.{0,45}\b(?:plaza|cargo)\b/u.test(
      text,
    );
  return school && otherWorkplace && temporary && retainsPosition
    ? ['destaque docente temporal plaza de origen requisitos solicitud']
    : [];
}
