import type { ReactNode } from "react";

/**
 * Portales oficiales que el asistente sugiere visitar. En el bloque
 * «Sugerencias:» cada mención se convierte en un enlace, para que el docente
 * llegue a la página sin buscarla. Solo enlaces verificados (2026-10-01): el
 * modelo nunca escribe URL, así no hay direcciones inventadas.
 */
const OFFICIAL_LINKS: ReadonlyArray<{
  href: string;
  name: string;
  pattern: RegExp;
}> = [
  {
    href: "https://www.gob.pe/minedu",
    name: "MINEDU",
    pattern: /\bMINEDU\b|Ministerio de Educación/u,
  },
  {
    href: "https://www.gob.pe/busquedas?term=UGEL",
    name: "UGEL",
    pattern: /\bUGEL(?:es)?\b/u,
  },
  {
    href: "https://www.gob.pe/busquedas?term=DRE",
    name: "DRE",
    pattern: /\b(?:DRE|GRE)\b/u,
  },
  { href: "https://www.gob.pe/sunedu", name: "SUNEDU", pattern: /\bSUNEDU\b/u },
  { href: "https://www.gob.pe/servir", name: "SERVIR", pattern: /\bSERVIR\b/u },
  {
    href: "https://www.perueduca.pe",
    name: "PerúEduca",
    pattern: /\bPer[uú] ?Educa\b/u,
  },
  {
    href: "https://busquedas.elperuano.pe",
    name: "El Peruano",
    pattern: /\bEl Peruano\b/u,
  },
  {
    href: "https://www.gob.pe/essalud",
    name: "EsSalud",
    pattern: /\b(?:EsSalud|ESSALUD|Essalud)\b/u,
  },
  {
    href: "https://www.derrama.org.pe",
    name: "Derrama Magisterial",
    pattern: /\bDerrama Magisterial\b/u,
  },
];

/**
 * Una sigla dentro de un código de norma («RM N.° 123-2024-MINEDU») no es una
 * mención del portal: no se enlaza si la rodean guiones, barras o puntos.
 */
const NOT_IN_CODE_BEFORE = "(?<![-/.\\w])";
const NOT_IN_CODE_AFTER = "(?![-/]\\w)";

const ANY_OFFICIAL = new RegExp(
  OFFICIAL_LINKS.map(
    (link) => `${NOT_IN_CODE_BEFORE}(?:${link.pattern.source})${NOT_IN_CODE_AFTER}`,
  ).join("|"),
  "gu",
);

/** Bloque de sugerencias: la línea «Sugerencias:» y lo que la sigue. */
export function startsSuggestions(line: string): boolean {
  // «Sugerencias:», «**Sugerencias:**», «**Sugerencias**:» o «### Sugerencias».
  return /^(?:#{1,6}\s+)?(?:\*\*)?sugerencias?(?:\*\*)?\s*(?::|$)/iu.test(
    line.trim(),
  );
}

/** Convierte las menciones de portales oficiales en enlaces seguros. */
export function linkifyOfficialEntities(
  text: string,
  keyPrefix: string,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(ANY_OFFICIAL)) {
    const index = match.index ?? 0;
    const link = OFFICIAL_LINKS.find((candidate) =>
      new RegExp(`^(?:${candidate.pattern.source})$`, candidate.pattern.flags).test(
        match[0],
      ),
    );
    if (!link) continue;
    if (index > last) nodes.push(text.slice(last, index));
    nodes.push(
      <a
        className="avend-chat-official-link"
        href={link.href}
        key={`${keyPrefix}-${index}`}
        rel="noopener noreferrer"
        target="_blank"
      >
        {match[0]}{" "}
        <span className="avend-visually-hidden">
          {`(portal oficial de ${link.name}, se abre en una pestaña nueva)`}
        </span>
        <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
          <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
        </svg>
      </a>,
    );
    last = index + match[0].length;
  }
  if (last === 0) return [text];
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** «Pensado por 12 segundos»: cuánto tardó el asistente en responder. */
export function ThoughtDuration({ seconds }: { seconds: number }) {
  const rounded = Math.max(1, Math.round(seconds));
  return (
    <p className="avend-chat-thought">
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5l-1.9-5.7-5.6-1.9L10.1 9 12 3.5Z" />
      </svg>
      Pensado por {rounded} {rounded === 1 ? "segundo" : "segundos"}
    </p>
  );
}

/** Etiqueta que se dejó de usar: se oculta en las respuestas ya guardadas. */
const LEGACY_ADVISORY_LEAD_IN =
  /^\s*Orientación general \(sin cita de norma\):\s*/u;

export function withoutLegacyLeadIn(content: string): string {
  return content.replace(LEGACY_ADVISORY_LEAD_IN, "");
}
