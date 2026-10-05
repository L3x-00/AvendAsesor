import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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
  it("empieza cerrada y permite elegir un tema mediante clic", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <SubmoduleFolder
        moduleName="Licencias"
        onSelect={onSelect}
        submodules={modules(3)}
      />,
    );

    const toggle = screen.getByRole("button", {
      name: "Mostrar temas. 3 temas",
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Tema 1").closest("button")).toBeDisabled();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("button", { name: "Tema 1" }));
    expect(onSelect).toHaveBeenCalledWith(modules(3)[0].id);
  });

  it("mantiene abierta la carpeta del tema seleccionado", () => {
    const items = modules(2);
    render(
      <SubmoduleFolder
        moduleName="Licencias"
        onSelect={vi.fn()}
        selectedModuleId={items[1].id}
        submodules={items}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Ocultar temas. 2 temas" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("button", { name: "Licencia por estudios" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("filtra de forma local una lista de más de treinta temas", async () => {
    const user = userEvent.setup();
    render(
      <SubmoduleFolder
        moduleName="Licencias"
        onSelect={vi.fn()}
        submodules={modules(35)}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Mostrar temas. 35 temas" }),
    );
    await user.type(screen.getByRole("searchbox", { name: "Buscar un tema" }), "estudios");

    expect(
      screen.getByRole("button", { name: "Licencia por estudios" }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Tema 1" })).toBeNull();
  });
});
