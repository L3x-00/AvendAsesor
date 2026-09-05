import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ModulesExplorer, type ModuleView } from "./modules-explorer";

vi.mock("@/app/admin/actions", () => ({
  createModuleAction: vi.fn(async () => ({ status: "idle" })),
  deleteModuleAction: vi.fn(async () => ({ status: "idle" })),
  setModuleStatusAction: vi.fn(async () => ({ status: "idle" })),
  updateModuleAction: vi.fn(async () => ({ status: "idle" })),
}));

const rootModules: ModuleView[] = [
  {
    code: "EVAL",
    documentCount: 73,
    description: "Procesos de evaluación",
    id: "m1",
    isActive: true,
    name: "Evaluación docente",
    parentModuleId: null,
    sortOrder: 1,
    submoduleCount: 8,
  },
  {
    code: "CONTRATO",
    documentCount: 0,
    description: null,
    id: "m2",
    isActive: false,
    name: "Contrato y desplazamiento",
    parentModuleId: null,
    sortOrder: 2,
    submoduleCount: 0,
  },
];

const parents = rootModules.map((module) => ({
  code: module.code,
  id: module.id,
  name: module.name,
}));

describe("ModulesExplorer", () => {
  it("shows module cards with submodule counts and the right primary action", () => {
    render(
      <ModulesExplorer
        context={{ kind: "root" }}
        modules={rootModules}
        parents={parents}
      />,
    );

    const evaluation = screen
      .getByRole("heading", { name: "Evaluación docente" })
      .closest("li");
    if (!evaluation) throw new Error("Missing module card");
    expect(
      within(evaluation).getByText("8 submódulos · 73 documentos"),
    ).toBeVisible();
    expect(within(evaluation).getByText("Activo")).toBeVisible();
    expect(
      within(evaluation).getByRole("link", { name: "Ver submódulos" }),
    ).toHaveAttribute("href", "/admin/modules/m1");

    const contrato = screen
      .getByRole("heading", { name: "Contrato y desplazamiento" })
      .closest("li");
    if (!contrato) throw new Error("Missing module card");
    expect(
      within(contrato).getByText("0 submódulos · 0 documentos"),
    ).toBeVisible();
    expect(within(contrato).getByText("Inactivo")).toBeVisible();
    expect(
      within(contrato).getByRole("link", { name: "Gestionar documentos" }),
    ).toHaveAttribute("href", "/admin/modules/m2");
  });

  it("filters cards by the search box", async () => {
    const user = userEvent.setup();
    render(
      <ModulesExplorer
        context={{ kind: "root" }}
        modules={rootModules}
        parents={parents}
      />,
    );

    await user.type(
      screen.getByRole("searchbox", {
        name: "Buscar módulo por nombre o código",
      }),
      "contrato",
    );

    expect(
      screen.queryByRole("heading", { name: "Evaluación docente" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Contrato y desplazamiento" }),
    ).toBeVisible();
  });

  it("offers a parent selector when creating a submodule at the root level", async () => {
    const user = userEvent.setup();
    render(
      <ModulesExplorer
        context={{ kind: "root" }}
        modules={rootModules}
        parents={parents}
      />,
    );

    await user.click(screen.getByText("+ Crear módulo o submódulo"));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Tipo de elemento" }),
      "submodule",
    );
    expect(
      screen.getByRole("option", { name: "Selecciona un módulo principal" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Evaluación docente (EVAL)" }),
    ).toBeInTheDocument();
  });

  it("presets the parent when creating inside a module", () => {
    const child: ModuleView[] = [
      {
        code: "CONTRAT_DOC",
        documentCount: 18,
        description: null,
        id: "s1",
        isActive: true,
        name: "Contratación Docente",
        parentModuleId: "m1",
        sortOrder: 1,
        submoduleCount: 0,
      },
    ];

    const { container } = render(
      <ModulesExplorer
        context={{
          kind: "module",
          moduleId: "m1",
          moduleName: "Evaluación docente",
        }}
        modules={child}
        parents={parents}
      />,
    );

    expect(screen.getByText("+ Crear submódulo")).toBeVisible();
    // No parent chooser inside a module; parent is preset via a hidden field.
    expect(
      screen.queryByRole("option", { name: "Selecciona un módulo principal" }),
    ).not.toBeInTheDocument();
    const hidden = container.querySelector<HTMLInputElement>(
      'input[type="hidden"][name="parentModuleId"]',
    );
    expect(hidden?.value).toBe("m1");
  });
});
