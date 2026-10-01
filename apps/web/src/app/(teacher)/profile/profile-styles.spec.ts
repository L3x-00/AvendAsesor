import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/app/teacher-experience.css"), "utf8");

function escapeSelector(selector: string): string {
  return selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Cuerpo de la primera regla cuyo selector es exactamente `selector`. */
function ruleBody(selector: string, source = styles): string {
  const match = new RegExp(`(?:^|[}\\s])${escapeSelector(selector)}\\s*\\{([^}]*)\\}`, "m").exec(source);
  if (!match) throw new Error(`No existe la regla ${selector}`);
  return match[1];
}

/** Contenido de un bloque @media/@container, respetando llaves anidadas. */
function atBlock(prelude: string): string {
  const start = styles.indexOf(prelude);
  if (start === -1) throw new Error(`No existe el bloque ${prelude}`);
  let depth = 0;
  const open = styles.indexOf("{", start);
  for (let index = open; index < styles.length; index += 1) {
    if (styles[index] === "{") depth += 1;
    if (styles[index] === "}") depth -= 1;
    if (depth === 0) return styles.slice(open + 1, index);
  }
  throw new Error(`Bloque sin cerrar: ${prelude}`);
}

describe("Mi perfil: contratos visuales", () => {
  it("el icono y la flecha de los accesos rápidos conservan el color de acento", () => {
    expect(ruleBody(".avend-profile-shortcuts .avend-profile-shortcut-icon")).toMatch(
      /color:\s*var\(--avend-accent-strong\)/,
    );
    expect(ruleBody(".avend-profile-shortcuts .avend-profile-shortcut-arrow")).toMatch(
      /color:\s*var\(--avend-accent-strong\)/,
    );
    // La regla genérica que los volvía grises ya no existe: solo la descripción va atenuada.
    expect(styles).not.toMatch(/\.avend-profile-shortcuts span\s*\{/);
    expect(ruleBody(".avend-profile-shortcuts .avend-profile-shortcut-description")).toMatch(
      /color:\s*var\(--avend-text-muted\)/,
    );
  });

  it("los accesos rápidos usan una rejilla fluida con alturas iguales y sin cortar palabras", () => {
    expect(ruleBody(".avend-profile-shortcuts")).toMatch(
      /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*18rem\),\s*1fr\)\)/,
    );
    expect(styles).not.toMatch(/\.avend-profile-shortcuts\s*\{\s*grid-template-columns:\s*repeat\(3/);
    expect(ruleBody(".avend-profile-shortcuts li")).toMatch(/display:\s*grid/);
    expect(ruleBody(".avend-profile-shortcuts a")).toMatch(/height:\s*100%/);
    expect(ruleBody(".avend-profile-shortcuts .avend-profile-shortcut-description")).toMatch(
      /overflow-wrap:\s*normal/,
    );
  });

  it("los accesos rápidos responden al toque con un estado :active visible", () => {
    expect(ruleBody(".avend-profile-shortcuts a:active")).toMatch(/background-color:\s*var\(--avend-soft-blue\)/);
  });

  it("en móvil «Cerrar sesión» sigue arriba a la derecha con ancho automático", () => {
    const mobile = atBlock("@media (max-width: 35rem)");
    expect(mobile).not.toMatch(/flex-direction:\s*column/);
    expect(mobile).not.toMatch(/width:\s*100%/);
    expect(ruleBody(".avend-profile-header")).toMatch(/justify-content:\s*space-between/);
    expect(ruleBody(".avend-profile-sign-out")).toMatch(/width:\s*auto/);
    expect(ruleBody(".avend-profile-sign-out")).toMatch(/min-height:\s*2\.75rem/);
  });

  it("la entradilla del encabezado recupera su estilo atenuado", () => {
    expect(ruleBody(".avend-profile-header .avend-profile-lead")).toMatch(/color:\s*var\(--avend-text-muted\)/);
  });

  it("la fila Departamento/Ciudad se reparte según el ancho de la tarjeta", () => {
    expect(ruleBody(".avend-profile-edit-card")).toMatch(/container-type:\s*inline-size/);
    expect(atBlock("@container (min-width: 30rem)")).toMatch(/\.avend-profile-form-row/);
    // Solo la regla base y la de la consulta de contenedor: ninguna media
    // query por ancho de ventana vuelve a forzar las dos columnas.
    expect(styles.match(/\.avend-profile-form-row\b/g)).toHaveLength(2);
  });
});
