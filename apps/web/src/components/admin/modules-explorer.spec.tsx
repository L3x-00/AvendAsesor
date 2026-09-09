import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createModuleAction, deleteModuleAction, setModuleStatusAction, updateModuleAction } from "@/app/admin/actions";
import { ModuleManageDetails } from "./modules-explorer";
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
  beforeEach(() => vi.clearAllMocks());

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

  it("presets the parent when creating inside a module", async () => {
    const user = userEvent.setup();
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

    render(
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
    await user.click(screen.getByText("+ Crear submódulo"));
    // No parent chooser inside a module; parent is preset via a hidden field.
    expect(
      screen.queryByRole("option", { name: "Selecciona un módulo principal" }),
    ).not.toBeInTheDocument();
    const hidden = document.querySelector<HTMLInputElement>(
      'input[type="hidden"][name="parentModuleId"]',
    );
    expect(hidden?.value).toBe("m1");
  });

  it("marks every missing submodule field and clears the corrected parent", async () => {
    const user = userEvent.setup();
    render(<ModulesExplorer context={{ kind: "root" }} modules={[]} parents={parents} />);
    await user.click(screen.getByText("+ Crear módulo o submódulo"));
    await user.selectOptions(screen.getByRole("combobox", { name: "Tipo de elemento" }), "submodule");
    await user.click(screen.getByRole("button", { name: "Crear" }));

    for (const label of ["Nombre", "Código", "Módulo padre"]) {
      expect(screen.getByLabelText(label)).toHaveAttribute("aria-invalid", "true");
    }
    expect(screen.getByText("El nombre es obligatorio.")).toBeVisible();
    expect(screen.getByText("El código es obligatorio.")).toBeVisible();
    expect(screen.getByText("Este campo es obligatorio.")).toBeVisible();
    await waitFor(() => expect(screen.getByLabelText("Nombre")).toHaveFocus());
    expect(createModuleAction).not.toHaveBeenCalled();

    await user.selectOptions(screen.getByLabelText("Módulo padre"), "m1");
    await waitFor(() => expect(screen.getByLabelText("Módulo padre")).not.toHaveAttribute("aria-invalid"));
    expect(screen.queryByText("Este campo es obligatorio.")).not.toBeInTheDocument();
  });

  it("explains name, description and order constraints before submitting the module", async () => {
    const user = userEvent.setup();
    render(<ModulesExplorer context={{ kind: "root" }} modules={[]} parents={parents} />);
    await user.click(screen.getByText("+ Crear módulo o submódulo"));
    await user.type(screen.getByLabelText("Nombre"), "A");
    await user.type(screen.getByLabelText("Código"), "modulo invalido");
    await user.type(screen.getByLabelText("Descripción (opcional)"), "A");
    await user.type(screen.getByLabelText("Orden (opcional)"), "-1");
    await user.click(screen.getByRole("button", { name: "Crear" }));
    expect(screen.getByText("El nombre debe tener al menos 2 caracteres.")).toBeVisible();
    expect(screen.getByText("La descripción debe tener al menos 2 caracteres.")).toBeVisible();
    expect(screen.getByText("El valor debe ser igual o mayor que 0.")).toBeVisible();
    expect(screen.getByText(/El código empieza por una letra/)).toBeVisible();
    expect(createModuleAction).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "M".repeat(255) } });
    fireEvent.change(screen.getByLabelText("Código"), { target: { value: "MODULO" } });
    fireEvent.change(screen.getByLabelText("Descripción (opcional)"), { target: { value: "Descripción válida" } });
    fireEvent.change(screen.getByLabelText("Orden (opcional)"), { target: { value: "0" } });
    await user.click(screen.getByRole("button", { name: "Crear" }));
    await waitFor(() => expect(createModuleAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createModuleAction).mock.calls[0][1].get("name")).toHaveLength(255);
  });

  it("keeps edit, deactivate and delete field errors separate", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ModuleManageDetails
        module={rootModules[0]}
        parents={parents}
        summary="Editar, ordenar o cambiar estado"
      />,
    );
    await user.click(screen.getByText("Editar, ordenar o cambiar estado"));
    await user.clear(screen.getByLabelText("Nombre"));
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await user.click(screen.getByRole("button", { name: "Desactivar" }));
    await user.click(screen.getByRole("button", { name: "Eliminar (lógico)" }));
    expect(screen.getByLabelText("Nombre")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(/Motivo de desactivación/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(/Motivo de baja/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getAllByText("El motivo es obligatorio.")).toHaveLength(2);
    const errorIds = [...container.querySelectorAll(".avend-field-error")].map((error) => error.id);
    expect(new Set(errorIds).size).toBe(errorIds.length);
    expect(updateModuleAction).not.toHaveBeenCalled();
    expect(setModuleStatusAction).not.toHaveBeenCalled();
    expect(deleteModuleAction).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/Motivo de desactivación/), "A");
    expect(screen.getByText("El motivo debe tener al menos 2 caracteres.")).toBeVisible();
    await user.type(screen.getByLabelText(/Motivo de desactivación/), "probado");
    await waitFor(() => expect(screen.getByLabelText(/Motivo de desactivación/)).not.toHaveAttribute("aria-invalid"));
    expect(screen.getByLabelText(/Motivo de baja/)).toHaveAttribute("aria-invalid", "true");
  });
});
