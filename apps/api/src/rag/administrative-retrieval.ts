import type { RetrievedChunk } from './retrieval.gateway';
import { normalizeSpanishText } from './text-normalization';

/**
 * Expansiones semánticas para situaciones administrativas expresadas en
 * lenguaje cotidiano. Las consultas no agregan reglas ni requisitos: solo
 * emplean los nombres técnicos del propio corpus para recuperar la fuente que
 * deberá respaldar la respuesta.
 */
const MEDICAL_LEAVE_SIGNAL =
  /\b(?:descanso\s+medic(?:o|a)|incapacidad\s+temporal|enferm(?:o|a|edad).{0,64}\b(?:dia|dias|faltar|ausen|licencia)|(?:dia|dias|faltar|ausen).{0,64}\benferm(?:o|a|edad))\b/u;
const PERSONAL_ABSENCE_SIGNAL =
  /\b(?:motivos?|asuntos?)\s+particulares?\b|\bfaltar.{0,48}\b(?:dia|dias)\b/u;
const VACATION_SIGNAL = /\bvacacion(?:es)?\b/u;
const EMPLOYMENT_STATUS_SIGNAL = /\b(?:nombrad[oa]s?|contratad[oa]s?)\b/u;
const ESCALAFON_SIGNAL = /\b(?:escalafon(?:ario)?|informe\s+escalafonario)\b/u;
const TARDINESS_SIGNAL =
  /\b(?:tardanz(?:a|as)|lleg(?:ar|ue|o)\s+tarde|retras(?:o|os))\b/u;
const DISCIPLINARY_PROCESS_SIGNAL =
  /\b(?:procedimiento\s+disciplinario|proceso\s+administrativo\s+disciplinario|\bpad\b)\b/u;
const DISCIPLINARY_SUBJECT_SIGNAL =
  /\b(?:sancion(?:es|ad[oa]s?)?|sancionar|defen[sd](?:a|er(?:se)?)|descargos?)\b/u;
const DISCIPLINARY_CONTEXT_SIGNAL =
  /\b(?:docent(?:e|es)?|derecho|notificaci[oó]n|procedimiento)\b/u;
const WORKDAY_SIGNAL =
  /\b(?:jornada|horas?|carga\s+horaria|horas?\s+de\s+clase|pedagogic[ao]s?|complementarias?)\b/u;
const SCHOOL_LEVEL_SIGNAL =
  /\b(?:secundaria|inicial|primaria|eb[rae]|cetpro)\b/u;

function evidenceText(
  source: Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'>,
): string {
  return normalizeSpanishText(`${source.documentTitle} ${source.chunkContent}`);
}

function hasDisciplinarySignal(text: string): boolean {
  return (
    DISCIPLINARY_PROCESS_SIGNAL.test(text) ||
    (DISCIPLINARY_SUBJECT_SIGNAL.test(text) &&
      DISCIPLINARY_CONTEXT_SIGNAL.test(text))
  );
}

export function administrativeEvidenceQueries(question: string): string[] {
  const text = normalizeSpanishText(question);
  const queries: string[] = [];

  if (MEDICAL_LEAVE_SIGNAL.test(text)) {
    queries.push(
      'licencia por incapacidad temporal descanso médico CITT certificado médico profesor',
    );
  }

  if (PERSONAL_ABSENCE_SIGNAL.test(text)) {
    queries.push(
      'permiso por motivos particulares profesor nombrado ausencia por horas requisitos',
      'licencia por motivos particulares profesor nombrado requisitos solicitud',
    );
  }

  if (VACATION_SIGNAL.test(text) && EMPLOYMENT_STATUS_SIGNAL.test(text)) {
    queries.push(
      'vacaciones profesores nombrados contratados Carrera Pública Magisterial',
    );
  }

  if (TARDINESS_SIGNAL.test(text)) {
    queries.push(
      'tardanza descuento asistencia tercera tardanza factor minuto jornada laboral profesor',
    );
  }

  if (hasDisciplinarySignal(text)) {
    queries.push(
      'proceso administrativo disciplinario docente derecho de defensa descargos notificación',
    );
  }

  if (WORKDAY_SIGNAL.test(text) && SCHOOL_LEVEL_SIGNAL.test(text)) {
    queries.push(
      'jornada de trabajo profesor secundaria horas pedagógicas horas lectivas',
    );
  }

  return [...new Set(queries)].slice(0, 4);
}

/**
 * Una fuente directa se reserva antes de completar el cupo con resultados que
 * solo comparten vocabulario laboral. Así una licencia por incapacidad no se
 * reemplaza por una licencia para acompañar a una persona con discapacidad ni
 * una sanción por una referencia incidental a "proceso".
 */
export function isDirectAdministrativeEvidence(
  question: string,
  source: Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'>,
): boolean {
  const requested = normalizeSpanishText(question);
  const evidence = evidenceText(source);

  if (MEDICAL_LEAVE_SIGNAL.test(requested)) {
    return /\blicencia\s+por\s+incapacidad\s+temporal\b|\bdescanso\s+medico\b|\bcitt\b/u.test(
      evidence,
    );
  }
  if (PERSONAL_ABSENCE_SIGNAL.test(requested)) {
    return /\b(?:licencia|permiso)\s+por\s+motivos\s+particulares\b/u.test(
      evidence,
    );
  }
  if (
    VACATION_SIGNAL.test(requested) &&
    EMPLOYMENT_STATUS_SIGNAL.test(requested)
  ) {
    return (
      /\bvacaciones?\b/u.test(evidence) &&
      /\b(?:carrera\s+publica\s+magisterial|profesor(?:es)?\s+nombrad)/u.test(
        evidence,
      )
    );
  }
  if (ESCALAFON_SIGNAL.test(requested)) {
    return /\binforme\s+escalafonario\b/u.test(evidence);
  }
  if (TARDINESS_SIGNAL.test(requested)) {
    return (
      /\btardanza(?:s)?\b/u.test(evidence) &&
      /\b(?:descuento|factor|inasistencia|asistencia)\b/u.test(evidence)
    );
  }
  if (hasDisciplinarySignal(requested)) {
    return (
      /\b(?:proceso\s+administrativo\s+disciplinario|\bpad\b)\b/u.test(
        evidence,
      ) && /\b(?:defensa|descargos?|notificaci[oó]n)\b/u.test(evidence)
    );
  }
  if (WORKDAY_SIGNAL.test(requested) && SCHOOL_LEVEL_SIGNAL.test(requested)) {
    return (
      /\bjornada\s+de\s+trabajo\b/u.test(evidence) &&
      /\bhoras\s+pedagogicas\b/u.test(evidence)
    );
  }
  return false;
}
