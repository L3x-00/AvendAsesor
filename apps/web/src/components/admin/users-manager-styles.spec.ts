import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = process.cwd();
const globalStyles = readFileSync(
  resolve(webRoot, "src/app/globals.css"),
  "utf8",
);
const usersManagerStyles = readFileSync(
  resolve(webRoot, "src/components/admin/users-manager.module.css"),
  "utf8",
);

function relativeLuminance(hex: string): number {
  const channels = hex
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
  if (!channels || channels.length !== 3) throw new Error("Invalid RGB color.");
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  const darker = Math.min(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  return (lighter + 0.05) / (darker + 0.05);
}

const stylesWithoutComments = usersManagerStyles.replace(/\/\*[\s\S]*?\*\//g, "");

function token(name: string): string {
  const value = globalStyles.match(
    new RegExp(`--${name}:\\s*#([0-9a-f]{6})`, "i"),
  )?.[1];
  if (!value) throw new Error(`Token --${name} not found.`);
  return value;
}

/** Contenido de todos los bloques @media cuya condición contiene `query`. */
function mediaContent(css: string, query: string): string {
  let content = "";
  let index = css.indexOf("@media");
  while (index !== -1) {
    const open = css.indexOf("{", index);
    const condition = css.slice(index, open);
    let depth = 1;
    let cursor = open + 1;
    while (depth > 0 && cursor < css.length) {
      if (css[cursor] === "{") depth += 1;
      if (css[cursor] === "}") depth -= 1;
      cursor += 1;
    }
    if (condition.includes(query)) content += css.slice(open + 1, cursor - 1);
    index = css.indexOf("@media", cursor);
  }
  return content;
}

/** Reglas de primer nivel (fuera de @media), como pares selector/cuerpo. */
function topLevelRules(css: string): Array<{ body: string; selector: string }> {
  let flat = css;
  let index = flat.indexOf("@media");
  while (index !== -1) {
    const open = flat.indexOf("{", index);
    let depth = 1;
    let cursor = open + 1;
    while (depth > 0 && cursor < flat.length) {
      if (flat[cursor] === "{") depth += 1;
      if (flat[cursor] === "}") depth -= 1;
      cursor += 1;
    }
    flat = flat.slice(0, index) + flat.slice(cursor);
    index = flat.indexOf("@media");
  }
  return [...flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    body: match[2],
    selector: match[1].trim(),
  }));
}

function declaredProperties(body: string): string[] {
  return body
    .split(";")
    .map((declaration) => declaration.split(":")[0]?.trim())
    .filter((property): property is string => Boolean(property));
}

describe("superadministrator user directory visual contracts", () => {
  it("keeps the search action above WCAG AA contrast", () => {
    const strongAccent = globalStyles.match(
      /--avend-accent-strong:\s*#([0-9a-f]{6})/i,
    )?.[1];

    expect(strongAccent).toBeDefined();
    expect(
      contrastRatio("ffffff", strongAccent as string),
    ).toBeGreaterThanOrEqual(4.5);
    expect(usersManagerStyles).toMatch(
      /\.searchButton\s*\{[^}]*background:\s*var\(--avend-accent-strong\)/,
    );
    expect(usersManagerStyles).toMatch(
      /\.searchButton:hover\s*\{[^}]*background:\s*var\(--avend-navy\)/,
    );
  });
});

describe("barra de acciones de Usuarios: contratos visuales", () => {
  const rules = topLevelRules(stylesWithoutComments);
  // Prefiere la regla propia del selector; si no la hay, la primera lista de
  // selectores que lo incluya.
  const rule = (selector: string) => {
    const found =
      rules.find((candidate) => candidate.selector === selector) ??
      rules.find((candidate) =>
        candidate.selector
          .split(",")
          .map((part) => part.trim())
          .includes(selector),
      );
    if (!found) throw new Error(`No rule for ${selector}`);
    return found.body;
  };

  it("el estado abierto, hover y presionado no cambian el tamaño de ningún botón", () => {
    // Solo se permiten propiedades que no afectan al tamaño ni a la posición.
    const allowed = new Set([
      "background",
      "border-color",
      "box-shadow",
      "color",
      "transform",
    ]);
    const stateRules = rules.filter(({ selector }) =>
      /\.(primaryAction|secondaryAction)[^,{]*(\[aria-expanded="true"\]|:hover|:active)|\[aria-expanded="true"\]\s*>\s*\.actionChevron/.test(
        selector,
      ),
    );

    expect(stateRules.length).toBeGreaterThanOrEqual(4);
    for (const { body, selector } of stateRules) {
      for (const property of declaredProperties(body)) {
        expect({ property, selector }).toEqual({
          property: expect.toSatisfy((name: string) => allowed.has(name)),
          selector,
        });
      }
    }
  });

  it("ningún botón de la barra crece para ocupar el espacio de los demás", () => {
    const base = rule(".primaryAction");
    expect(rules.find((candidate) => candidate.selector.startsWith(".primaryAction,"))?.body).toMatch(
      /flex:\s*none/,
    );
    expect(rule(".secondaryActions")).toMatch(/flex:\s*none/);
    // Importar y Exportar van juntos al final y saltan de línea juntos.
    expect(rule(".secondaryActions")).toMatch(/margin-left:\s*auto/);
    expect(base).not.toMatch(/flex:\s*1/);
    // Ya no hay <details> que se ensanche al abrirse.
    expect(stylesWithoutComments).not.toMatch(/\[open\]/);
  });

  it("los botones y el cierre del panel miden al menos 44px de alto", () => {
    expect(
      rules.find((candidate) => candidate.selector.startsWith(".primaryAction,"))?.body,
    ).toMatch(/min-height:\s*2\.75rem/);
    expect(rule(".actionPanelClose")).toMatch(/min-height:\s*2\.75rem/);
  });

  it("los secundarios son discretos pero legibles: azul con contraste AA, no gris", () => {
    const secondary = rule(".secondaryAction");
    expect(secondary).toMatch(/color:\s*var\(--avend-accent-strong\)/);
    expect(secondary).toMatch(/background:\s*transparent/);

    const text = token("avend-accent-strong");
    for (const background of [
      "avend-surface",
      "avend-surface-muted",
      "avend-soft-blue",
    ]) {
      expect(contrastRatio(text, token(background))).toBeGreaterThanOrEqual(4.5);
    }
    // Mismo tamaño de letra que el resto del panel (16px).
    expect(
      rules.find((candidate) => candidate.selector.startsWith(".primaryAction,"))?.body,
    ).toMatch(/font-size:\s*1rem/);
  });

  it("el panel oculto no ocupa espacio", () => {
    expect(rule(".actionPanel[hidden]")).toMatch(/display:\s*none/);
  });

  it("en el celular las etiquetas pueden partirse y Excel comparte una fila", () => {
    const mobile = mediaContent(stylesWithoutComments, "max-width: 40rem");
    const mobileRules = topLevelRules(mobile);
    const mobileRule = (selector: string) =>
      mobileRules.find((candidate) => candidate.selector === selector)?.body ?? "";

    expect(mobileRule(".primaryAction")).toMatch(/white-space:\s*normal/);
    expect(mobileRule(".primaryAction")).toMatch(/flex:\s*1 1 100%/);
    expect(mobileRule(".secondaryActions")).toMatch(
      /grid-template-columns:\s*repeat\(2,/,
    );
    expect(mobileRule(".secondaryAction")).toMatch(/white-space:\s*normal/);
    // Las cuatro etiquetas quedan alineadas igual (nada centrado suelto).
    expect(mobile).not.toMatch(/justify-content:\s*center/);
  });

  it("la flecha de despliegue respeta «reducir movimiento»", () => {
    const reduced = mediaContent(
      stylesWithoutComments,
      "prefers-reduced-motion: reduce",
    );
    expect(reduced).toMatch(/\.actionChevron[^{]*\{[^}]*transition:\s*none/);
  });
});
