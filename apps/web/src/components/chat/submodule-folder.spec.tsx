import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ChatModule } from "@/lib/chat-api/types";
import { SubmoduleFolder } from "./submodule-folder";

function modules(count: number): ChatModule[] {
  return Array.from({ length: count }, (_, index) => ({
    code: `T-${index + 1}`,
    description: null,
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    name: index === count - 1 ? "Licencia por estudios" : `Tema ${index + 1}`,
    parentModuleId: "11111111-1111-4111-8111-111111111111",
    sortOrder: index,
  }));
}

describe("SubmoduleFolder", () => {
  it("muestra los temas como fichas informativas, sin selección ni plegado", () => {
    render(<SubmoduleFolder moduleName="Licencias" submodules={modules(3)} />);

    const topics = screen.getByRole("region", { name: "Temas de Licencias" });
    expect(topics).toBeVisible();
    expect(screen.getByText("Tema 1")).toBeVisible();
    expect(screen.getByText("Licencia por estudios")).toBeVisible();
    // Son etiquetas: no se pueden pulsar ni abren nada.
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText(/Puedes preguntar sobre cualquiera/i)).toBeNull();
  });
});
