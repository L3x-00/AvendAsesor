import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CR-07 (tanda 5): contratos de presentación del chat en teléfono. No sustituyen
 * a la revisión en navegador a 360/768/1280 px; fijan las causas que se
 * encontraron allí para que no vuelvan sin que una prueba lo note.
 */
const webRoot = process.cwd();
const read = (path: string) => readFileSync(resolve(webRoot, path), "utf8");
const globalStyles = read("src/app/globals.css");
const teacherStyles = read("src/app/teacher-experience.css");
const sourceStyles = read("src/components/chat/chat-sources.module.css");

/**
 * Cuerpos de las reglas cuyo ÚLTIMO selector es `selector` (una regla agrupada
 * como `.a,\n.b {…}` también cuenta para `.b`), unidos en un solo texto.
 */
function ruleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\>]/gu, "\\$&");
  const pattern = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`, "gu");
  const bodies = [...css.matchAll(pattern)].map((match) => match[1]);
  if (!bodies.length) throw new Error(`Regla no encontrada: ${selector}`);
  return bodies.join("\n");
}

function remValue(body: string): number {
  const match = /font-size:\s*([\d.]+)rem/u.exec(body);
  if (!match) throw new Error("Sin font-size en rem.");
  return Number(match[1]);
}

describe("contratos de presentación del chat en teléfono", () => {
  it("la barra de acciones no suma su sangría a un ancho del 100 %", () => {
    // Con `width: 100%` y el margen izquierdo del mensaje la barra se salía
    // 22 px a 360 px y el botón de reportar quedaba cortado.
    expect(ruleBody(teacherStyles, ".avend-chat-message-toolbar")).not.toMatch(
      /(?:^|[\s;])width:\s*100%/u,
    );
  });

  it("el ancho mínimo de la tabla depende de sus columnas, no de un valor fijo", () => {
    const body = ruleBody(globalStyles, ".avend-chat-table");

    expect(body).toMatch(/min-width:\s*calc\(var\(--avend-table-columns/u);
    expect(body).not.toMatch(/min-width:\s*34rem/u);
  });

  it("el desplazamiento es de la tabla y no de la página", () => {
    const body = ruleBody(globalStyles, ".avend-chat-table-scroll");

    expect(body).toMatch(/overflow-x:\s*auto/u);
    expect(body).toMatch(/max-width:\s*100%/u);
    expect(
      ruleBody(globalStyles, ".avend-chat-table-scroll:focus-visible"),
    ).toMatch(/outline:\s*3px solid/u);
  });

  it("en el teléfono la tabla recupera la sangría del avatar", () => {
    expect(globalStyles).toMatch(
      /@media \(max-width: 40rem\)\s*\{\s*\.avend-chat-table-block\s*\{[^}]*margin-inline-start:\s*-2\.375rem/u,
    );
  });

  it("la pista de desplazamiento y las descargas se leen a 16 px o más", () => {
    expect(
      remValue(ruleBody(globalStyles, ".avend-chat-table-hint")),
    ).toBeGreaterThanOrEqual(1);
    for (const selector of [
      ".downloadsHeading h2",
      ".downloadsHeading p",
      ".downloadList strong",
      ".downloadList small",
      ".toggleCopy span",
      ".rank",
    ]) {
      expect(remValue(ruleBody(sourceStyles, selector))).toBeGreaterThanOrEqual(
        1,
      );
    }
    expect(
      remValue(ruleBody(teacherStyles, ".avend-chat-message-label")),
    ).toBeGreaterThanOrEqual(1);
  });

  it("en la tarjeta de referencias cada dato va en la columna de valores", () => {
    // Sin esto el segundo dato de una celda caía en la columna estrecha de la
    // etiqueta y partía palabras («Remuneracio-nes»).
    expect(sourceStyles).toMatch(/\.table td > \*\s*\{\s*grid-column:\s*2;/u);
  });
});
