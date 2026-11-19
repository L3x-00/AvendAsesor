import { describe, expect, it } from "vitest";
import { moduleStartersFor } from "./chat-module-starters";

describe("moduleStartersFor", () => {
  it("reconoce el módulo por su código", () => {
    const starters = moduleStartersFor({
      code: "REMUNERACIONES",
      name: "Otro nombre cualquiera",
    });

    expect(starters).toHaveLength(4);
    expect(starters).toContain(
      "¿Qué asignaciones y bonificaciones me corresponden?",
    );
  });

  it("reconoce el módulo por su nombre cuando el código no coincide", () => {
    expect(
      moduleStartersFor({
        code: "MODULO-LEGADO",
        name: "Contratación  y Desplazamientos",
      }),
    ).toContain("¿Cómo se solicita una encargatura docente?");
    expect(
      moduleStartersFor({ name: "Cargos y plazas" }),
    ).toContain("¿Cuál es la diferencia entre una plaza orgánica y una eventual?");
  });

  it("entrega preguntas distintas a cada módulo", () => {
    const remuneraciones = moduleStartersFor({ name: "Remuneraciones" });
    const evaluacion = moduleStartersFor({ name: "Evaluación docente" });

    expect(remuneraciones).not.toEqual(evaluacion);
  });

  it("redacta preguntas propias para un tema desconocido", () => {
    const starters = moduleStartersFor({ name: "Cargos de confianza" });

    expect(starters).toHaveLength(4);
    expect(starters[0]).toBe(
      "¿Qué requisitos necesito para un trámite de Cargos de confianza?",
    );
  });

  it("no inventa preguntas cuando no hay tema", () => {
    expect(moduleStartersFor(null)).toEqual([]);
    expect(moduleStartersFor({ name: "   " })).toEqual([]);
  });
});
