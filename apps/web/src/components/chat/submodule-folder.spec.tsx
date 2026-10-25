import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  it("muestra etiquetas informativas sin permitir elegir un subtema", async () => {
    const user = userEvent.setup();
    render(
      <SubmoduleFolder
        moduleName="Licencias"
        submodules={modules(3)}
      />,
    );

    const toggle = screen.getByRole("button", {
      name: "Ocultar temas. 3 temas",
    });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Tema 1").closest("button")).toBeNull();
    expect(
      screen.getByText(/Puedes preguntar sobre cualquiera de ellos/i),
    ).toBeVisible();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});
