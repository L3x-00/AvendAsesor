import { normalizeSpanishText } from './text-normalization';

/**
 * Consultas jurídicas sobre la Ley de Reforma Magisterial y su reglamento.
 * Estas señales solo amplían la recuperación y conservan el módulo elegido; no
 * agregan hechos ni artículos que las fuentes no contengan.
 */
const LEGAL_NORM_SIGNAL =
  /\b(?:ley|reglamento|norma|articulo|numeral|decreto supremo|disposicion|transitori|derog|modificatori|carrera publica magisterial|29944|004-2013)\b/u;
const LEGAL_CONCEPT_SIGNAL =
  /\b(?:derechos?|deberes?|obligaciones?|sancion(?:es)?|destitucion|falta(?:s)?|licencia(?:s)?|permiso(?:s)?|pierde|perdida|nombramiento)\b/u;

/** Módulo cuyo ámbito es la ley y su reglamento, no un trámite concreto. */
export function isLegalModuleName(name: string | null | undefined): boolean {
  if (!name) return false;
  return /\b(?:ley|reglamento|reforma magisterial)\b/u.test(
    normalizeSpanishText(name),
  );
}

/**
 * Pregunta que exige interpretar una norma o una categoría jurídica. En un
 * módulo legal basta con que nombre la materia; en otros módulos la política no
 * se activa, para no alterar respuestas de trámites.
 */
export function isLegalQuestion(question: string): boolean {
  const text = normalizeSpanishText(question);
  return LEGAL_NORM_SIGNAL.test(text) || LEGAL_CONCEPT_SIGNAL.test(text);
}

export type LegalTopic =
  | 'duties'
  | 'generic'
  | 'law'
  | 'licenses'
  | 'modification'
  | 'regulation'
  | 'rights'
  | 'sanctions';

/** Materia jurídica concreta de la consulta, para orientar la evidencia. */
export function legalTopic(question: string): LegalTopic | null {
  const text = normalizeSpanishText(question);
  if (/\bderechos?\b/u.test(text)) return 'rights';
  if (/\bdeberes?\b|\bobligaciones?\b/u.test(text)) return 'duties';
  if (
    /\bsancion|\bdestitucion|\bfalta|\bdisciplin|\bpierde\b|\bp[eé]rdida\b|\bnombramiento\b/u.test(
      text,
    )
  ) {
    return 'sanctions';
  }
  if (/\breglamento\b|\b004-2013\b|\bdecreto supremo\b/u.test(text)) {
    return 'regulation';
  }
  if (/\bmodific|\bderog|\btransitori|\bvigencia|\barticulo\b/u.test(text)) {
    return 'modification';
  }
  if (/\blicencia|\bpermiso/u.test(text)) return 'licenses';
  if (/\bley\b|\b29944\b|\breforma magisterial\b/u.test(text)) return 'law';
  if (LEGAL_NORM_SIGNAL.test(text)) return 'generic';
  return null;
}

/**
 * Materias que solo pueden responderse con el texto de la ley o del reglamento.
 * Las sanciones y las licencias sí tienen normas relacionadas que las regulan.
 */
export function legalTopicNeedsPrimaryText(topic: LegalTopic | null): boolean {
  return (
    topic === 'generic' ||
    topic === 'law' ||
    topic === 'regulation' ||
    topic === 'modification' ||
    topic === 'rights' ||
    topic === 'duties'
  );
}

/**
 * La pregunta nombra una ley distinta de la 29944. En ese caso no se aplica la
 * carencia de la Ley de Reforma Magisterial: la norma citada se busca por su
 * propio número y, si no está, el flujo exacto lo declara.
 */
export function namesOtherLaw(question: string): boolean {
  const text = normalizeSpanishText(question);
  const numbers = [
    ...text.matchAll(/\bley\s*(?:n\s*[.º°]*\s*)?(\d{3,5})\b/gu),
  ].map((match) => match[1]);
  return numbers.some((number) => number !== '29944');
}

/** Documento que es la propia ley o su reglamento, no una norma que los cita. */
export function isPrimaryLegalSource(source: {
  documentTitle: string;
}): boolean {
  const title = normalizeSpanishText(source.documentTitle);
  return /\bley\s*(?:n\s*[.º°]*\s*)?29944\b|\bley de reforma magisterial\b|\breglamento de la ley\b|\b004-2013-ed\b/u.test(
    title,
  );
}

/**
 * Fuente que puede aportar al ámbito legal: la propia ley o reglamento, una
 * norma que los desarrolla o una que regula derechos, deberes, sanciones o
 * licencias. Se usa para no arrastrar tablas salariales u otros trámites.
 */
export function isLegalSource(source: {
  chunkContent: string;
  documentTitle: string;
}): boolean {
  const text = normalizeSpanishText(
    `${source.documentTitle} ${source.chunkContent}`,
  );
  return /\b(?:ley de reforma magisterial|29944|004-2013|reglamento de la ley|licencias, permisos y vacaciones|proceso administrativo disciplinario|derechos de los profesores|deberes de los profesores|destitucion|sancion(?:es)?)\b/u.test(
    text,
  );
}

/**
 * Fragmento que abre la sección que responde la consulta legal concreta
 * (5.20 para licencias por motivos particulares, sanciones del PAD, etc.).
 * Ordena la evidencia admitida; no amplía el corpus.
 */
export function isCoreLegalEvidence(
  question: string,
  source: { chunkContent: string; documentTitle: string },
): boolean {
  const asked = normalizeSpanishText(question);
  const text = normalizeSpanishText(
    `${source.documentTitle} ${source.chunkContent}`,
  );
  const title = normalizeSpanishText(source.documentTitle);
  if (/\blicencia|\bpermiso/u.test(asked)) {
    return (
      /licencias, permisos y vacaciones de profesores/u.test(title) &&
      /\b5\.20\b|\blicencia por motivos particulares\b/u.test(text)
    );
  }
  if (/\bderechos?\b/u.test(asked)) {
    return /\bderechos de los profesores\b|\bderechos del profesor\b/u.test(
      text,
    );
  }
  if (/\bdeberes?\b|\bobligaciones?\b/u.test(asked)) {
    return /\bdeberes de los profesores\b|\bdeberes del profesor\b/u.test(text);
  }
  if (
    /\bsancion|\bdestitucion|\bfalta|\bdisciplin|\bpierde\b|\bp[eé]rdida\b|\bnombramiento\b/u.test(
      asked,
    )
  ) {
    return (
      /proceso administrativo disciplinario|29988|hostigamiento sexual/u.test(
        title,
      ) &&
      /\bdestitucion\b|\bsancion(?:es)?\b|\bproceso administrativo disciplinario\b/u.test(
        text,
      )
    );
  }
  return /\bley de reforma magisterial\b|\b29944\b|\b004-2013\b/u.test(text);
}

/**
 * Traducciones de la pregunta cotidiana a la denominación del corpus. No
 * presuponen que la ley o el reglamento estén cargados: solo buscan los
 * fragmentos que los citan o desarrollan.
 */
export function legalEvidenceQueries(
  question: string,
  force = false,
): string[] {
  const text = normalizeSpanishText(question);
  // Solo el módulo legal amplía la búsqueda con estas consultas. Fuera de él
  // una mención genérica a «norma» o «sanción» no debe inyectar la Ley 29944
  // en el enrutado de otro módulo.
  if (!force) return [];
  const queries: string[] = [];
  if (/\breglamento\b|\b004-2013\b|\bdecreto supremo\b/u.test(text)) {
    queries.push(
      'Decreto Supremo 004-2013-ED Reglamento de la Ley de Reforma Magisterial disposiciones',
    );
  }
  if (/\bderechos?\b/u.test(text)) {
    queries.push(
      'derechos de los profesores Carrera Pública Magisterial Ley de Reforma Magisterial',
    );
  }
  if (/\bdeberes?\b|\bobligaciones?\b/u.test(text)) {
    queries.push(
      'deberes de los profesores Carrera Pública Magisterial Ley de Reforma Magisterial',
    );
  }
  if (
    /\bsancion|\bdestitucion|\bfalta|\bdisciplin|\bpierde\b|\bp[eé]rdida\b|\bnombramiento\b/u.test(
      text,
    )
  ) {
    queries.push(
      'sanción destitución cese temporal profesor proceso administrativo disciplinario Ley 29944',
    );
  }
  if (/\blicencia|\bpermiso/u.test(text)) {
    queries.push(
      'licencia por motivos particulares profesores requisitos norma técnica licencias permisos vacaciones',
    );
    if (/motivos particulares/u.test(text)) {
      queries.push(
        '5.20 licencia por motivos particulares dos años continuos o discontinuos período cinco años docente nombrado',
      );
    }
  }
  if (/\bmodific|\bderog|\btransitori|\bvigencia|\barticulo\b/u.test(text)) {
    queries.push(
      'modificación derogación disposiciones transitorias Ley 29944 vigencia artículo',
    );
  }
  // La consulta general solo se añade si no hay un concepto específico o si la
  // persona nombró expresamente la ley, su número o un artículo. Evita que una
  // pregunta por licencias se responda con cualquier norma que cite la ley.
  if (!queries.length || /\bley\b|\b29944\b|\barticulo\b/u.test(text)) {
    queries.unshift(
      'Ley 29944 Ley de Reforma Magisterial reglamento Decreto Supremo 004-2013-ED artículos vigencia',
    );
  }
  return [...new Set(queries)].slice(0, 4);
}
