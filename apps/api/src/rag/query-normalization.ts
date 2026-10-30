import { normalizeSpanishText } from './text-normalization';
import { hasStrongDomainSignal } from './domain-lexicon';

/**
 * Normalización de la consulta para búsqueda y clasificación: expande
 * abreviaturas del ámbito («RM» → «resolución ministerial») y corrige errores
 * frecuentes que el vocabulario dinámico no cubre. El texto que se guarda en el
 * historial sigue siendo el que escribió la persona.
 */
const ABBREVIATIONS: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\brm\b/giu, replacement: 'resolución ministerial' },
  { pattern: /\brd\b/giu, replacement: 'resolución directoral' },
  { pattern: /\brv\b/giu, replacement: 'resolución viceministerial' },
  { pattern: /\brvm\b/giu, replacement: 'resolución viceministerial' },
  {
    pattern: /\brsg\b/giu,
    replacement: 'resolución de secretaría general',
  },
  { pattern: /\bds\b/giu, replacement: 'decreto supremo' },
  { pattern: /\bdl\b/giu, replacement: 'decreto legislativo' },
  { pattern: /\bmemo\b/giu, replacement: 'memorándum' },
];

/**
 * Combinaciones observadas que unen palabras y además intercambian letras.
 * Se corrigen como frase completa para no convertir por aproximación cualquier
 * término parecido en una consulta jurídica distinta.
 */
const OBSERVED_PHRASE_TYPOS: ReadonlyArray<{
  pattern: RegExp;
  replacement: string;
}> = [
  {
    pattern: /^\s*¿?\s*cu[aá]nto\s+ganau\s+nprofesro\s*[?!.]?\s*$/iu,
    replacement: 'cuanto gana un profesor',
  },
];

/**
 * Errores frecuentes demostrados por la campaña real o por pruebas
 * explícitas. Se comparan sin tildes —la gente escribe «renumeración» con
 * tilde y sin ella— y siempre por palabra completa: una corrección difusa
 * cambiaría números de norma, años, siglas, nombres propios o términos
 * jurídicos válidos («numeración» no es «remuneración»). Las claves van sin
 * tilde porque la comparación usa `normalizeSpanishText`.
 */
const COMMON_WORD_TYPOS: ReadonlyMap<string, string> = new Map([
  ['reasingnacion', 'reasignación'],
  ['reasingnaciones', 'reasignaciones'],
  ['rekisitos', 'requisitos'],
  ['renumeracion', 'remuneración'],
  ['renumeraciones', 'remuneraciones'],
  ['renumreacion', 'remuneración'],
  ['renumreaciones', 'remuneraciones'],
  ['licensia', 'licencia'],
  ['licensias', 'licencias'],
  ['permisso', 'permiso'],
  ['permisoos', 'permisos'],
  ['tardansa', 'tardanza'],
  ['tardansas', 'tardanzas'],
  ['disiplinario', 'disciplinario'],
  ['disiplinaria', 'disciplinaria'],
  ['sansion', 'sanción'],
  ['sansiones', 'sanciones'],
  ['bacaciones', 'vacaciones'],
  ['bacacion', 'vacación'],
  ['nombramineto', 'nombramiento'],
  ['nombraminetos', 'nombramientos'],
  ['ratificasion', 'ratificación'],
  ['ratificasiones', 'ratificaciones'],
  ['encargatur', 'encargatura'],
  ['encargaturaz', 'encargatura'],
  ['encargaturz', 'encargatura'],
]);

/**
 * Vocabulario pequeño y estático de términos cotidianos de las consultas
 * docentes. No se construye desde títulos, módulos ni documentos: esos datos
 * cambian y no son una base segura para corregir por similitud una consulta
 * normativa. Los identificadores, las siglas y las palabras jurídicas menos
 * inequívocas continúan fuera de esta lista.
 */
const RECOVERABLE_DOMAIN_TERMS = [
  'asignación',
  'asignaciones',
  'auxiliar',
  'auxiliares',
  'bonificación',
  'bonificaciones',
  'contratación',
  'contrataciones',
  'contratado',
  'contratada',
  'contratados',
  'contratadas',
  'docente',
  'docentes',
  'documento',
  'documentos',
  'destaque',
  'destaques',
  'encargatura',
  'encargaturas',
  'horas',
  'jornada',
  'jornadas',
  'licencia',
  'licencias',
  'maestra',
  'maestro',
  'maestras',
  'maestros',
  'nombrada',
  'nombrado',
  'nombradas',
  'nombrados',
  'nombramiento',
  'nombramientos',
  'pensión',
  'pensiones',
  'permiso',
  'permisos',
  'plazo',
  'plazos',
  'profesora',
  'profesor',
  'profesoras',
  'profesores',
  'reasignación',
  'reasignaciones',
  'remuneración',
  'remuneraciones',
  'requisitos',
  'vacaciones',
] as const;

/**
 * Términos de proceso que pueden confirmar, por sí solos, que una consulta
 * breve pertenece al ámbito educativo. Los roles o conceptos cotidianos como
 * «sueldo» y «escala» no activan recuperación: así no se corrige una palabra
 * española válida fuera de una pregunta educativa explícita.
 */
const SPECIFIC_RECOVERY_TERMS = new Set(
  [
    'contratación',
    'contratado',
    'contratada',
    'contratados',
    'contratadas',
    'destaque',
    'destaques',
    'encargatura',
    'encargaturas',
    'licencia',
    'licencias',
    'nombrada',
    'nombrado',
    'nombradas',
    'nombrados',
    'nombramiento',
    'nombramientos',
    'reasignación',
    'reasignaciones',
  ].map((term) => normalizeSpanishText(term)),
);

/**
 * Palabras normativas correctas que aparecen al expandir las siglas. Se
 * excluyen de la búsqueda aproximada para que «ministerial», por ejemplo, no
 * se confunda con «magisterial».
 */
const PROTECTED_EXACT_TERMS = new Set(
  [
    'decreto',
    'contrato',
    'contratos',
    'directoral',
    'legislativo',
    'memorándum',
    'ministerial',
    'resolución',
    'resignación',
    'secretaría',
    'supremo',
    'viceministerial',
  ].map((term) => normalizeSpanishText(term)),
);

interface RecoveryCandidate {
  distance: number;
  term: string;
}

export interface OrthographicClarification {
  /** Palabra literal escrita por la persona; no se altera al guardarla. */
  originalWord: string;
  /** Una o más alternativas empatadas; no se adivina entre ellas. */
  suggestions: readonly string[];
  /**
   * Consulta propuesta solo cuando hay una única alternativa. Un empate exige
   * que la persona elija/escriba el término: nunca se acepta con un «sí».
   */
  suggestedQuestion: string | null;
}

export interface DomainQueryRecovery {
  /** Consulta segura para clasificación y recuperación. */
  normalizedQuestion: string;
  /** Se completa solo cuando una corrección cambiaría el sentido por duda. */
  clarification: OrthographicClarification | null;
}

/** Conserva la capitalización original (inicio de oración o palabra en mayúsculas). */
function matchWordCase(original: string, replacement: string): string {
  const upper = original.toLocaleUpperCase('es');
  const lower = original.toLocaleLowerCase('es');
  if (original === upper && original !== lower) {
    return replacement.toLocaleUpperCase('es');
  }
  const first = original[0];
  if (first && first === upper[0] && first !== lower[0]) {
    return `${replacement.charAt(0).toLocaleUpperCase('es')}${replacement.slice(1)}`;
  }
  return replacement;
}

/** Solo corrige palabras completas del mapa: no toca cifras ni siglas. */
function correctCommonTypos(text: string): string {
  let corrected = text;
  for (const { pattern, replacement } of OBSERVED_PHRASE_TYPOS) {
    corrected = corrected.replace(pattern, replacement);
  }
  return corrected.replace(/[\p{L}]+/gu, (word) => {
    const replacement = COMMON_WORD_TYPOS.get(normalizeSpanishText(word));
    return replacement ? matchWordCase(word, replacement) : word;
  });
}

/**
 * Distancia de edición con transposición adyacente. Se usa únicamente contra
 * `RECOVERABLE_DOMAIN_TERMS`, nunca contra el contenido dinámico del corpus.
 */
function damerauLevenshtein(left: string, right: string): number {
  const previousPrevious = new Array<number>(right.length + 1).fill(0);
  let previous = new Array<number>(right.length + 1).fill(0);

  for (let rightIndex = 0; rightIndex <= right.length; rightIndex += 1) {
    previous[rightIndex] = rightIndex;
  }

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = new Array<number>(right.length + 1).fill(0);
    current[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost =
        left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );
      if (
        leftIndex > 1 &&
        rightIndex > 1 &&
        left[leftIndex - 1] === right[rightIndex - 2] &&
        left[leftIndex - 2] === right[rightIndex - 1]
      ) {
        current[rightIndex] = Math.min(
          current[rightIndex],
          previousPrevious[rightIndex - 2] + 1,
        );
      }
    }

    previousPrevious.splice(0, previousPrevious.length, ...previous);
    previous = current;
  }

  return previous[right.length] ?? Math.max(left.length, right.length);
}

function isProtectedToken(word: string): boolean {
  const upper = word.toLocaleUpperCase('es');
  const lower = word.toLocaleLowerCase('es');
  return (
    word.length < 4 || /\d/u.test(word) || (word === upper && word !== lower)
  );
}

function candidatesFor(word: string): RecoveryCandidate[] {
  if (isProtectedToken(word)) return [];

  const normalizedWord = normalizeSpanishText(word);
  if (PROTECTED_EXACT_TERMS.has(normalizedWord)) return [];
  // En voces muy cortas, dos cambios ya permiten demasiadas coincidencias
  // accidentales («Hola» y «horas»). Solo se solicita confirmación desde seis
  // letras; la recuperación automática de una sola letra sigue disponible.
  const maximumDistance = normalizedWord.length < 6 ? 1 : 2;
  let bestDistance = Number.POSITIVE_INFINITY;
  const candidates: RecoveryCandidate[] = [];

  for (const term of RECOVERABLE_DOMAIN_TERMS) {
    const distance = damerauLevenshtein(
      normalizedWord,
      normalizeSpanishText(term),
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      candidates.splice(0, candidates.length, { distance, term });
    } else if (distance === bestDistance) {
      candidates.push({ distance, term });
    }
  }

  return bestDistance <= maximumDistance ? candidates : [];
}

/**
 * Las sustituciones simples («plazas» → «plazos») pueden transformar una
 * palabra española correcta en otro concepto. La recuperación automática se
 * limita a omitir/agregar una letra o intercambiar dos letras contiguas, que
 * son los errores mecánicos observados en la consulta docente.
 */
function isSingleStructuralTypo(word: string, candidate: string): boolean {
  if (Math.abs(word.length - candidate.length) === 1) {
    const [shorter, longer] =
      word.length < candidate.length ? [word, candidate] : [candidate, word];
    let shorterIndex = 0;
    let longerIndex = 0;
    let skipped = false;
    while (shorterIndex < shorter.length && longerIndex < longer.length) {
      if (shorter[shorterIndex] === longer[longerIndex]) {
        shorterIndex += 1;
        longerIndex += 1;
      } else if (!skipped) {
        skipped = true;
        longerIndex += 1;
      } else {
        return false;
      }
    }
    return true;
  }

  if (word.length !== candidate.length) return false;
  let firstDifference = -1;
  for (let index = 0; index < word.length; index += 1) {
    if (word[index] !== candidate[index]) {
      firstDifference = index;
      break;
    }
  }
  if (firstDifference < 0 || firstDifference + 1 >= word.length) return false;
  return (
    word[firstDifference] === candidate[firstDifference + 1] &&
    word[firstDifference + 1] === candidate[firstDifference] &&
    word.slice(firstDifference + 2) === candidate.slice(firstDifference + 2)
  );
}

function hasSpecificRecoveryAnchor(text: string): boolean {
  for (const match of text.matchAll(/[\p{L}]+/gu)) {
    const word = match[0];
    const candidates = candidatesFor(word);
    const candidate = candidates[0] ?? null;
    if (
      candidate &&
      candidates.length === 1 &&
      SPECIFIC_RECOVERY_TERMS.has(normalizeSpanishText(candidate.term)) &&
      candidate.distance === 1 &&
      isSingleStructuralTypo(
        normalizeSpanishText(word),
        normalizeSpanishText(candidate.term),
      )
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Recupera errores de una letra de forma automática solo cuando hay un único
 * término docente cercano. A dos ediciones, o ante un empate, conserva la
 * consulta literal y pide confirmación antes de buscar: evita que una palabra
 * jurídica válida sea interpretada como otro trámite.
 */
function recoverControlledTypos(text: string): DomainQueryRecovery {
  const hasRecoveryAnchor =
    hasStrongDomainSignal(normalizeSpanishText(text)) ||
    hasSpecificRecoveryAnchor(text);
  if (!hasRecoveryAnchor) {
    return { clarification: null, normalizedQuestion: text };
  }

  let normalizedQuestion = '';
  let suggestedQuestion = '';
  let lastIndex = 0;
  let clarification: Omit<
    OrthographicClarification,
    'suggestedQuestion'
  > | null = null;

  for (const match of text.matchAll(/[\p{L}]+/gu)) {
    const word = match[0];
    const index = match.index ?? lastIndex;
    const before = text.slice(lastIndex, index);
    normalizedQuestion += before;
    suggestedQuestion += before;

    const candidates = candidatesFor(word);
    const candidate = candidates[0] ?? null;
    const hasUniqueCandidate = candidates.length === 1;

    const canCorrectAutomatically =
      candidate &&
      candidate.distance === 1 &&
      hasUniqueCandidate &&
      isSingleStructuralTypo(
        normalizeSpanishText(word),
        normalizeSpanishText(candidate.term),
      );
    const needsClarification =
      candidate && (candidate.distance === 2 || !hasUniqueCandidate);

    if (canCorrectAutomatically && candidate) {
      const corrected = matchWordCase(word, candidate.term);
      normalizedQuestion += corrected;
      suggestedQuestion += corrected;
    } else {
      normalizedQuestion += word;
      if (!clarification && candidate && needsClarification) {
        clarification = {
          originalWord: word,
          suggestions: candidates.map((item) => item.term),
        };
        suggestedQuestion += hasUniqueCandidate
          ? matchWordCase(word, candidate.term)
          : word;
      } else {
        suggestedQuestion += word;
      }
    }

    lastIndex = index + word.length;
  }

  normalizedQuestion += text.slice(lastIndex);
  suggestedQuestion += text.slice(lastIndex);
  return {
    clarification: clarification
      ? {
          ...clarification,
          suggestedQuestion:
            clarification.suggestions.length === 1 ? suggestedQuestion : null,
        }
      : null,
    normalizedQuestion,
  };
}

export function recoverDomainQuery(question: string): DomainQueryRecovery {
  let explicitlyNormalized = correctCommonTypos(question);
  for (const { pattern, replacement } of ABBREVIATIONS) {
    explicitlyNormalized = explicitlyNormalized.replace(pattern, replacement);
  }
  return recoverControlledTypos(explicitlyNormalized);
}

export function normalizeDomainQuery(question: string): string {
  return recoverDomainQuery(question).normalizedQuestion;
}
