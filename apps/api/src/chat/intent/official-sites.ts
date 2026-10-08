/**
 * Portales oficiales que AVEND ASESOR indica cuando se los piden («¿puedo
 * saber la página del MINEDU?»). Antes, la pregunta llegaba al RAG: el modelo
 * contestaba que no tenía acceso a la página, repetía el enlace acortado de un
 * documento y la web solo enlazaba la UGEL de «Sugerencias:», como si la
 * respuesta dependiera de una UGEL concreta (PO, 2026-10-08).
 *
 * Solo direcciones verificadas el 2026-10-08; el modelo nunca escribe URL. Las
 * UGEL y las DRE/GRE no tienen una página única: se enlaza el directorio de
 * instituciones de gob.pe filtrado (191 UGEL; 29 DRE y GRE). La web enlaza las
 * mismas direcciones en «Sugerencias:»
 * (apps/web/src/components/chat/official-links.tsx): si cambia una, cambian
 * las dos.
 */
export interface OfficialSite {
  /** Qué encontrará la persona al abrir el enlace. */
  description: string;
  href: string;
  /** Texto del enlace. */
  label: string;
  /** Mención de la entidad sobre texto normalizado (sin tildes, minúsculas). */
  pattern: RegExp;
}

export const UGEL_DIRECTORY_URL =
  'https://www.gob.pe/busquedas?contenido%5B%5D=instituciones&term=UGEL';
export const DRE_DIRECTORY_URL =
  'https://www.gob.pe/busquedas?contenido%5B%5D=instituciones&term=DRE+GRE';

export const OFFICIAL_SITES: readonly OfficialSite[] = [
  {
    description:
      'normas, convocatorias, trámites y comunicados del sector educación.',
    href: 'https://www.gob.pe/minedu',
    label: 'Página oficial del Ministerio de Educación (MINEDU)',
    // Incluye errores de escritura frecuentes («minudo», «minedo») y
    // «ministerial», en que el corrector ortográfico del chat puede convertir
    // «ministerio» si el vocabulario de documentos solo trae la segunda.
    pattern: /\b(?:minedu|minudo|minedo|ministeri(?:o|al) de educacion)\b/u,
  },
  {
    description:
      'cada UGEL tiene su propia página; busca la tuya por el nombre de tu UGEL o de tu provincia.',
    href: UGEL_DIRECTORY_URL,
    label: 'Directorio oficial de las UGEL en gob.pe',
    pattern:
      /\b(?:ugel(?:es|s)?|unidad(?:es)? de gestion educativa(?: local)?)\b/u,
  },
  {
    description:
      'cada región tiene su Dirección o Gerencia Regional de Educación; busca la de tu región.',
    href: DRE_DIRECTORY_URL,
    label: 'Directorio oficial de las DRE y GRE en gob.pe',
    pattern:
      /\b(?:dre|gre|direccion(?:es)? regional(?:es)? de educacion|gerencias? regional(?:es)? de educacion)\b/u,
  },
  {
    description: 'registro y verificación de grados y títulos universitarios.',
    href: 'https://www.gob.pe/sunedu',
    label: 'Página oficial de la SUNEDU',
    pattern: /\bsunedu\b/u,
  },
  {
    description: 'Autoridad Nacional del Servicio Civil.',
    href: 'https://www.gob.pe/servir',
    label: 'Página oficial de SERVIR',
    // «servir» también es un verbo («me puede servir»): solo cuenta como
    // entidad tras una preposición o con su nombre completo.
    pattern:
      /\b(?:autoridad nacional del servicio civil|(?:de|del|a|en) servir)\b/u,
  },
  {
    description:
      'portal educativo del MINEDU con recursos y cursos para docentes.',
    href: 'https://www.perueduca.pe',
    label: 'Portal PerúEduca',
    pattern: /\bperu ?educa\b/u,
  },
  {
    description: 'buscador de normas legales del diario oficial.',
    href: 'https://busquedas.elperuano.pe',
    label: 'Normas legales de El Peruano',
    pattern: /\b(?:diario )?el peruano\b/u,
  },
  {
    description: 'seguro social de salud.',
    href: 'https://www.gob.pe/essalud',
    label: 'Página oficial de EsSalud',
    pattern: /\bessalud\b/u,
  },
  {
    description: 'servicios y beneficios para el magisterio.',
    href: 'https://www.derrama.org.pe',
    label: 'Página oficial de la Derrama Magisterial',
    pattern: /\bderrama magisterial\b/u,
  },
];

/**
 * Lo que nombra una página web: «página», «portal», «link», «enlace»… Sin
 * bandera global (un `.test()` repetido no arrastra `lastIndex`); quien lo use
 * para reemplazar todas las apariciones crea su copia con «gu».
 */
export const WEB_NOUN =
  /\b(?:paginas? web|paginas?|portal(?:es)?(?: web)?|sitios? web|sitios?|webs?|enlaces?|links?|url|direccion(?:es)? (?:web|electronicas?)|website)\b/u;

/** Entidades nombradas en el texto normalizado, en el orden del catálogo. */
export function officialSitesIn(normalized: string): OfficialSite[] {
  return OFFICIAL_SITES.filter((site) => site.pattern.test(normalized));
}

/** Respuesta con los enlaces oficiales pedidos (enlaces en formato Markdown). */
export function buildOfficialSitesReply(
  sites: readonly OfficialSite[],
): string {
  const items = sites.map(
    (site) => `- [${site.label}](${site.href}): ${site.description}`,
  );
  return [
    sites.length === 1
      ? 'Claro, aquí tienes el enlace oficial:'
      : 'Claro, aquí tienes los enlaces oficiales:',
    '',
    ...items,
    '',
    'Si buscas un trámite o una norma en particular, cuéntame cuál y te oriento con los documentos disponibles.',
  ].join('\n');
}
