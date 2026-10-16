import type { RetrievedChunk } from './retrieval.gateway';
import { normalizeSpanishText } from './text-normalization';

export interface ExactDocumentReference {
  /** Si aporta la identidad mínima necesaria para una búsqueda unívoca. */
  complete: boolean;
  /** Código editorial que distingue normas con el mismo número y año. */
  documentType: string;
  /** Texto normalizado de la referencia para mostrarlo sin inventar un nombre. */
  display: string;
  /** Identidad comparable sin espacios ni signos: `3262017MINEDU`. */
  key: string;
  /** Token validado que recibe la RPC: `RSG:3262017MINEDU`. */
  lookupKey: string;
}

const LEGAL_DOCUMENT_PREFIX =
  '(?:decreto\\s+(?:supremo|legislativo)|resolucion\\s+(?:de\\s+secretaria\\s+general|ministerial|viceministerial|directoral)|ley|directiva|ds|dl|rm|rvm|rsg|rd)';

/**
 * Exige el tipo de norma antes del número. Así un monto, una página o «30
 * horas en 2025» nunca se interpreta como una identidad documental.
 */
const EXACT_REFERENCE = new RegExp(
  `\\b(${LEGAL_DOCUMENT_PREFIX})\\s*(?:(?:n(?:ro)?|numero)\\s*)?[.°º:–—-]*\\s*(\\d{1,8}(?:\\s*-\\s*(?:19|20)\\d{2}(?:\\s*-\\s*[a-z]{2,20})?)?)\\b`,
  'giu',
);

const DOCUMENT_PREFIX: Readonly<
  Record<string, { display: string; documentType: string; lookupCode: string }>
> = {
  'decreto legislativo': {
    display: 'Decreto Legislativo',
    documentType: 'DECRETO_LEGISLATIVO',
    lookupCode: 'DL',
  },
  'decreto supremo': {
    display: 'Decreto Supremo',
    documentType: 'DECRETO_SUPREMO',
    lookupCode: 'DS',
  },
  directiva: {
    display: 'Directiva',
    documentType: 'DIRECTIVA',
    lookupCode: 'DIRECTIVA',
  },
  dl: {
    display: 'DL',
    documentType: 'DECRETO_LEGISLATIVO',
    lookupCode: 'DL',
  },
  ds: {
    display: 'DS',
    documentType: 'DECRETO_SUPREMO',
    lookupCode: 'DS',
  },
  ley: { display: 'Ley', documentType: 'LEY', lookupCode: 'LEY' },
  rd: {
    display: 'RD',
    documentType: 'RESOLUCION_DIRECTORAL',
    lookupCode: 'RD',
  },
  'resolucion directoral': {
    display: 'Resolución Directoral',
    documentType: 'RESOLUCION_DIRECTORAL',
    lookupCode: 'RD',
  },
  'resolucion ministerial': {
    display: 'Resolución Ministerial',
    documentType: 'RESOLUCION_MINISTERIAL',
    lookupCode: 'RM',
  },
  'resolucion de secretaria general': {
    display: 'Resolución de Secretaría General',
    // La RSG tiene tipo propio desde ADR-0025; `OTRO` sigue aceptándose como
    // bolsa heredada en `sourceMatchesExactDocumentReference`, siempre con la
    // etiqueta explícita de la norma.
    documentType: 'RESOLUCION_SECRETARIA_GENERAL',
    lookupCode: 'RSG',
  },
  'resolucion viceministerial': {
    display: 'Resolución Viceministerial',
    documentType: 'RESOLUCION_VICEMINISTERIAL',
    lookupCode: 'RVM',
  },
  rm: {
    display: 'RM',
    documentType: 'RESOLUCION_MINISTERIAL',
    lookupCode: 'RM',
  },
  rsg: {
    display: 'RSG',
    documentType: 'RESOLUCION_SECRETARIA_GENERAL',
    lookupCode: 'RSG',
  },
  rvm: {
    display: 'RVM',
    documentType: 'RESOLUCION_VICEMINISTERIAL',
    lookupCode: 'RVM',
  },
};

export function normalizeDocumentReferenceKey(value: string): string {
  return normalizeSpanishText(value)
    .replace(/[^a-z0-9]+/gu, '')
    .toUpperCase();
}

const REGISTERED_NUMBER_PREFIXES: Readonly<Record<string, string[]>> = {
  DIRECTIVA: ['DIRECTIVA'],
  DL: ['DL', 'DECRETOLEGISLATIVO'],
  DS: ['DS', 'DECRETOSUPREMO'],
  LEY: ['LEY'],
  RD: ['RD', 'RESOLUCIONDIRECTORAL'],
  RM: ['RM', 'RESOLUCIONMINISTERIAL'],
  RSG: ['RSG', 'RESOLUCIONDESECRETARIAGENERAL'],
  RVM: ['RVM', 'RESOLUCIONVICEMINISTERIAL'],
};

function normalizedRegisteredNumber(
  value: string,
  reference: ExactDocumentReference,
): string {
  let normalized = normalizeDocumentReferenceKey(value);
  const lookupCode = reference.lookupKey.split(':', 1)[0] ?? '';
  const prefix = (REGISTERED_NUMBER_PREFIXES[lookupCode] ?? []).find(
    (candidate) => normalized.startsWith(candidate),
  );
  if (prefix) normalized = normalized.slice(prefix.length);
  return normalized.replace(/^N(?:RO|UMERO)?/u, '');
}

/**
 * Tipos gobernados que pueden responder por cada código de referencia. Espejo
 * de `private.document_types_for_reference_code` en la base: la RSG tiene tipo
 * propio (ADR-0025) y conserva la bolsa heredada `OTRO`.
 */
const REFERENCE_LOOKUP_TYPES: Readonly<Record<string, readonly string[]>> = {
  DIRECTIVA: ['DIRECTIVA'],
  DL: ['DECRETO_LEGISLATIVO'],
  DS: ['DECRETO_SUPREMO'],
  LEY: ['LEY'],
  RD: ['RESOLUCION_DIRECTORAL'],
  RM: ['RESOLUCION_MINISTERIAL'],
  RSG: ['RESOLUCION_SECRETARIA_GENERAL', 'OTRO'],
  RVM: ['RESOLUCION_VICEMINISTERIAL'],
};

/** Número registrado comparable; `null` cuando el campo está vacío. */
function registeredNumberKey(
  source: Pick<RetrievedChunk, 'resolutionNumber'>,
  reference: ExactDocumentReference,
): string | null {
  if (!source.resolutionNumber?.trim()) return null;
  const key = normalizedRegisteredNumber(source.resolutionNumber, reference);
  return key.length ? key : null;
}

/** La RSG solo responde con la etiqueta explícita de Secretaría General. */
function declaresSecretariaGeneral(
  source: Pick<RetrievedChunk, 'documentTitle' | 'resolutionNumber'>,
): boolean {
  const labeledIdentity = normalizeDocumentReferenceKey(
    `${source.resolutionNumber ?? ''} ${source.documentTitle ?? ''}`,
  );
  return (
    labeledIdentity.includes('RSG') ||
    labeledIdentity.includes('RESOLUCIONDESECRETARIAGENERAL')
  );
}

/** Referencias explícitas y acotadas que la persona nombró en su pregunta. */
export function exactDocumentReferencesIn(
  question: string,
): ExactDocumentReference[] {
  const normalized = normalizeSpanishText(question)
    // En textos jurídicos son habituales «R.S.G.», «D. S.» o «R. M.».
    // Compactarlos aquí evita que una puntuación editorial desactive la ruta
    // exacta y haga caer la consulta a similitud semántica.
    .replace(/\br\s*\.?\s*s\s*\.?\s*g\s*\.?/gu, 'rsg')
    .replace(/\br\s*\.?\s*v\s*\.?\s*m\s*\.?/gu, 'rvm')
    .replace(/\bd\s*\.?\s*s\s*\.?/gu, 'ds')
    .replace(/\bd\s*\.?\s*l\s*\.?/gu, 'dl')
    .replace(/\br\s*\.?\s*m\s*\.?/gu, 'rm')
    .replace(/\br\s*\.?\s*d\s*\.?/gu, 'rd');
  const found = new Map<string, ExactDocumentReference>();

  for (const match of normalized.matchAll(EXACT_REFERENCE)) {
    const prefix = match[1]?.replace(/\s+/gu, ' ').trim();
    const identifier = match[2]?.replace(/\s*-\s*/gu, '-').trim();
    if (!prefix || !identifier) continue;
    const prefixIdentity = DOCUMENT_PREFIX[prefix];
    if (!prefixIdentity) continue;
    const key = normalizeDocumentReferenceKey(identifier);
    const lookupKey = `${prefixIdentity.lookupCode}:${key}`;
    if (key.length < 4 || found.has(lookupKey)) continue;
    found.set(lookupKey, {
      complete:
        prefixIdentity.lookupCode === 'LEY' ||
        prefixIdentity.lookupCode === 'DL' ||
        /^\d{1,8}-(?:19|20)\d{2}-[a-z]{2,20}$/iu.test(identifier),
      display: `${prefixIdentity.display} N.° ${identifier.toUpperCase()}`,
      documentType: prefixIdentity.documentType,
      key,
      lookupKey,
    });
  }

  return [...found.values()].slice(0, 5);
}

/** Defensa adicional: ninguna fuente parecida sustituye la norma nombrada. */
export function sourceMatchesExactDocumentReference(
  source: Pick<
    RetrievedChunk,
    'documentTitle' | 'documentType' | 'resolutionNumber'
  >,
  reference: ExactDocumentReference,
): boolean {
  const lookupCode = reference.lookupKey.split(':', 1)[0] ?? '';
  const acceptedTypes = REFERENCE_LOOKUP_TYPES[lookupCode];
  if (!acceptedTypes) return false;
  if (!source.documentType || !acceptedTypes.includes(source.documentType)) {
    return false;
  }
  if (lookupCode === 'RSG' && !declaresSecretariaGeneral(source)) return false;
  const registeredNumber = registeredNumberKey(source, reference);
  // El número registrado manda: si existe y no coincide, el título no puede
  // sustituirlo (evita que una norma que menciona a otra responda por ella).
  if (registeredNumber) return registeredNumber === reference.key;
  // Sin número registrado la identidad puede estar declarada en el título, con
  // la misma exigencia de etiqueta y número que una pregunta.
  return exactDocumentReferencesIn(source.documentTitle ?? '').some(
    (declared) => declared.lookupKey === reference.lookupKey,
  );
}
