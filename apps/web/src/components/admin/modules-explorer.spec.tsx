import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createModuleAction, deleteModuleAction, setModuleStatusAction, updateModuleAction } from "@/app/admin/actions";
import type { AdminActionState } from "@/lib/admin-api/action-state";
import { ModuleManageDetails } from "./modules-explorer";
import { ModulesExplorer, type ModuleView } from "./modules-explorer";

const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ showToast }),
}));

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
  beforeEach(() => {
    vi.clearAllMocks();
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    Element.prototype.scrollIntoView = vi.fn();
  });

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
      within(evaluation).getByRole("link", { name: /Ingresar/ }),
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
      within(contrato).getByRole("link", { name: /Ingresar/ }),
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

  it("offers navigation but no create action for a read-only module container", () => {
    render(
      <ModulesExplorer
        canCreate={false}
        context={{ kind: "module", moduleId: "m1", moduleName: "Evaluación docente" }}
        modules={[{ ...rootModules[0], parentModuleId: "m1" }]}
        parents={parents}
      />,
    );

    expect(screen.getByRole("searchbox", { name: "Buscar submódulo por nombre o código" })).toBeVisible();
    expect(screen.getByRole("link", { name: /Ingresar/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: "+ Crear submódulo" })).not.toBeInTheDocument();
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

    await user.click(screen.getByText("+ Crear módulo"));
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

  it("asks the server to open the parent after creating a submodule from the root", async () => {
    const user = userEvent.setup();
    render(
      <ModulesExplorer context={{ kind: "root" }} modules={rootModules} parents={parents} />,
    );

    await user.click(screen.getByText("+ Crear módulo"));
    await user.selectOptions(screen.getByLabelText("Tipo de elemento"), "submodule");
    await user.type(screen.getByLabelText("Nombre"), "Submódulo nuevo");
    await user.type(screen.getByLabelText("Código"), "SUB_NUEVO");
    await user.selectOptions(screen.getByLabelText("Módulo padre"), "m1");
    await user.click(screen.getByRole("button", { name: "Crear" }));

    // La navegación la hace la acción con redirect(): una sola recarga, la del
    // padre. El cliente no navega por su cuenta.
    await waitFor(() => expect(createModuleAction).toHaveBeenCalledTimes(1));
    const sent = vi.mocked(createModuleAction).mock.calls[0][1];
    expect(sent.get("afterCreate")).toBe("parent");
    expect(sent.get("parentModuleId")).toBe("m1");
  });

  it("closes the modal and focuses the newly created submodule after success", async () => {
    const user = userEvent.setup();
    vi.mocked(createModuleAction).mockResolvedValueOnce({
      entityId: "s2",
      message: "Módulo creado.",
      status: "success",
    });
    const child: ModuleView = {
      code: "NUEVO",
      documentCount: 0,
      description: "Submódulo nuevo",
      id: "s2",
      isActive: true,
      name: "Submódulo nuevo",
      parentModuleId: "m1",
      sortOrder: 2,
      submoduleCount: 0,
    };
    const props = {
      context: {
        kind: "module" as const,
        moduleId: "m1",
        moduleName: "Evaluación docente",
      },
      parents,
    };
    const view = render(<ModulesExplorer {...props} modules={[]} />);

    await user.click(screen.getByRole("button", { name: "+ Crear submódulo" }));
    await user.type(screen.getByLabelText("Nombre"), child.name);
    await user.type(screen.getByLabelText("Código"), child.code);
    await user.click(screen.getByRole("button", { name: "Crear submódulo" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );

    view.rerender(<ModulesExplorer {...props} modules={[child]} />);
    const card = screen.getByRole("heading", { name: child.name }).closest("li");
    await waitFor(() => expect(card).toHaveFocus());
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("marks every missing submodule field and clears the corrected parent", async () => {
    const user = userEvent.setup();
    render(<ModulesExplorer context={{ kind: "root" }} modules={[]} parents={parents} />);
    await user.click(screen.getByText("+ Crear módulo"));
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
    await user.click(screen.getByText("+ Crear módulo"));
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
        module={{ ...rootModules[0], submoduleCount: 0 }}
        parents={parents}
        summary="Editar, ordenar o cambiar estado"
      />,
    );
    await user.click(screen.getByText("Editar, ordenar o cambiar estado"));
    await user.clear(screen.getByLabelText("Nombre"));
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await user.click(screen.getByRole("button", { name: "Desactivar" }));
    // Eliminar va en dos pasos: el botón rojo despliega la confirmación.
    await user.click(screen.getByRole("button", { name: /^Eliminar (módulo|submódulo)$/ }));
    await user.click(screen.getByRole("button", { name: /^Sí, eliminar/ }));
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

  it("blocks deleting a module that still has submodules and says why", async () => {
    const user = userEvent.setup();
    render(
      <ModuleManageDetails
        module={rootModules[0]}
        parents={parents}
        summary="Editar, ordenar o cambiar estado"
      />,
    );
    await user.click(screen.getByText("Editar, ordenar o cambiar estado"));

    expect(
      screen.queryByRole("button", { name: /^Eliminar (módulo|submódulo)$/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Elimina primero sus submódulos/i),
    ).toBeVisible();
  });
});

const moduleContext = {
  kind: "module" as const,
  moduleId: "m1",
  moduleName: "Evaluación docente",
};

const newChild: ModuleView = {
  code: "NUEVO",
  documentCount: 0,
  description: null,
  id: "s2",
  isActive: true,
  name: "Submódulo nuevo",
  parentModuleId: "m1",
  sortOrder: 2,
  submoduleCount: 0,
};

const existingChild: ModuleView = {
  ...newChild,
  code: "PREVIO",
  id: "s1",
  name: "Contratación docente",
  sortOrder: 1,
};

function cardOf(name: string): HTMLElement {
  const card = screen.getByRole("heading", { name }).closest("li");
  if (!card) throw new Error(`Missing card for ${name}`);
  return card;
}

describe("ModulesExplorer — barra de herramientas (R2)", () => {
  it("places the search box first and the create button after it", () => {
    render(
      <ModulesExplorer context={{ kind: "root" }} modules={rootModules} parents={parents} />,
    );
    const search = screen.getByRole("searchbox");
    const button = screen.getByRole("button", { name: "+ Crear módulo" });
    expect(search.parentElement).toBe(button.parentElement);
    expect(
      search.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps the search box in the same place when there is no create button", () => {
    render(
      <ModulesExplorer
        canCreate={false}
        context={{ kind: "root" }}
        modules={rootModules}
        parents={parents}
      />,
    );
    const search = screen.getByRole("searchbox");
    expect(search.parentElement?.firstElementChild).toBe(search);
    expect(screen.queryByRole("button", { name: /Crear/ })).not.toBeInTheDocument();
  });
});

describe("ModulesExplorer — resaltado del elemento creado (R3/R4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    Element.prototype.scrollIntoView = vi.fn();
    window.history.replaceState(null, "", "/admin/modules/m1");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("clears an active search, highlights the new card and always ends the highlight", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(createModuleAction).mockResolvedValueOnce({
      entityId: "s2",
      message: "Submódulo creado.",
      parentEntityId: "m1",
      status: "success",
    });
    const view = render(
      <ModulesExplorer context={moduleContext} modules={[existingChild]} parents={parents} />,
    );

    // La búsqueda activa no coincide con el nombre del submódulo que se creará.
    await user.type(screen.getByRole("searchbox"), "contratación");
    await user.click(screen.getByRole("button", { name: "+ Crear submódulo" }));
    await user.type(screen.getByLabelText("Nombre"), newChild.name);
    await user.type(screen.getByLabelText("Código"), newChild.code);
    await user.click(screen.getByRole("button", { name: "Crear submódulo" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    expect(screen.getByRole("searchbox")).toHaveValue("");
    view.rerender(
      <ModulesExplorer
        context={moduleContext}
        modules={[existingChild, newChild]}
        parents={parents}
      />,
    );

    const card = cardOf(newChild.name);
    await waitFor(() => expect(card).toHaveFocus());
    expect(card).toHaveAttribute("data-highlighted", "true");
    expect(cardOf(existingChild.name)).not.toHaveAttribute("data-highlighted");
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
    expect(showToast).toHaveBeenCalledWith("Submódulo creado.");

    act(() => {
      vi.advanceTimersByTime(3600);
    });
    expect(card).not.toHaveAttribute("data-highlighted");
    // El foco no se pierde: la tarjeta sigue siendo enfocable mientras lo tenga.
    expect(card).toHaveAttribute("tabindex", "-1");
    expect(card).toHaveFocus();

    act(() => {
      card.blur();
    });
    expect(card).not.toHaveAttribute("tabindex");
  });

  it("ends the highlight even if the new card never becomes visible", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(createModuleAction).mockResolvedValueOnce({
      entityId: "s2",
      message: "Submódulo creado.",
      status: "success",
    });
    const view = render(
      <ModulesExplorer context={moduleContext} modules={[existingChild]} parents={parents} />,
    );
    await user.click(screen.getByRole("button", { name: "+ Crear submódulo" }));
    await user.type(screen.getByLabelText("Nombre"), newChild.name);
    await user.type(screen.getByLabelText("Código"), newChild.code);
    await user.click(screen.getByRole("button", { name: "Crear submódulo" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    act(() => {
      vi.advanceTimersByTime(3600);
    });
    // Si la lista llega tarde, la tarjeta ya no se resalta de forma permanente.
    view.rerender(
      <ModulesExplorer
        context={moduleContext}
        modules={[existingChild, newChild]}
        parents={parents}
      />,
    );
    expect(cardOf(newChild.name)).not.toHaveAttribute("data-highlighted");
  });

  it("highlights a submodule created from the root once and removes ?creado from the address", async () => {
    window.history.replaceState(null, "", "/admin/modules/m1?creado=s9&page=1");
    const created = { ...newChild, id: "s9" };
    const view = render(
      <ModulesExplorer
        context={moduleContext}
        initialHighlightId="s9"
        modules={[existingChild, created]}
        parents={parents}
      />,
    );

    const card = cardOf(created.name);
    await waitFor(() => expect(card).toHaveFocus());
    expect(card).toHaveAttribute("data-highlighted", "true");
    expect(showToast).toHaveBeenCalledWith("Submódulo creado.");
    expect(window.location.search).toBe("?page=1");

    act(() => {
      vi.advanceTimersByTime(3600);
    });
    expect(card).not.toHaveAttribute("data-highlighted");

    // Volver con «Atrás» monta otra vez la vista con el mismo identificador:
    // no debe repetir ni el aviso ni el parpadeo.
    view.unmount();
    showToast.mockClear();
    render(
      <ModulesExplorer
        context={moduleContext}
        initialHighlightId="s9"
        modules={[existingChild, created]}
        parents={parents}
      />,
    );
    expect(cardOf(created.name)).not.toHaveAttribute("data-highlighted");
    expect(showToast).not.toHaveBeenCalled();
  });
});

describe("ModulesExplorer — modal de creación", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("keeps the modal open and shows the server error when creation fails", async () => {
    const user = userEvent.setup();
    vi.mocked(createModuleAction).mockResolvedValueOnce({
      message: "No se pudo crear el submódulo. Revisa que el código no lo use otro módulo.",
      status: "error",
    });
    render(<ModulesExplorer context={moduleContext} modules={[]} parents={parents} />);

    await user.click(screen.getByRole("button", { name: "+ Crear submódulo" }));
    await user.type(screen.getByLabelText("Nombre"), newChild.name);
    await user.type(screen.getByLabelText("Código"), newChild.code);
    await user.click(screen.getByRole("button", { name: "Crear submódulo" }));

    const dialog = await screen.findByRole("dialog");
    expect(
      await within(dialog).findByText(/No se pudo crear el submódulo/),
    ).toBeVisible();
    expect(showToast).not.toHaveBeenCalled();
  });

  it("cannot be closed while the creation is still being processed", async () => {
    const user = userEvent.setup();
    let finish: (state: AdminActionState) => void = () => undefined;
    vi.mocked(createModuleAction).mockImplementationOnce(
      () => new Promise<AdminActionState>((resolveAction) => {
        finish = resolveAction;
      }),
    );
    render(<ModulesExplorer context={moduleContext} modules={[]} parents={parents} />);

    await user.click(screen.getByRole("button", { name: "+ Crear submódulo" }));
    await user.type(screen.getByLabelText("Nombre"), newChild.name);
    await user.type(screen.getByLabelText("Código"), newChild.code);
    await user.click(screen.getByRole("button", { name: "Crear submódulo" }));
    await screen.findByRole("button", { name: "Procesando…" });

    expect(screen.getByRole("button", { name: "Cerrar" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await act(async () => {
      finish({ entityId: "s2", message: "Submódulo creado.", status: "success" });
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(showToast).toHaveBeenCalledWith("Submódulo creado.");
  });

  it("creates the submodule as inactive when the parent module is inactive", async () => {
    const user = userEvent.setup();
    render(
      <ModulesExplorer
        context={{ ...moduleContext, moduleIsActive: false }}
        modules={[]}
        parents={parents}
      />,
    );
    await user.click(screen.getByRole("button", { name: "+ Crear submódulo" }));

    const status = screen.getByRole("combobox", { name: /Estado/ });
    expect(status).toHaveValue("false");
    expect(within(status).getByRole("option", { name: "Activo" })).toBeDisabled();
    expect(screen.getByText(/El módulo padre está inactivo/)).toBeVisible();
  });

  it("forces an inactive submodule when an inactive parent is chosen at the root", async () => {
    const user = userEvent.setup();
    render(
      <ModulesExplorer context={{ kind: "root" }} modules={rootModules} parents={parents} />,
    );
    await user.click(screen.getByText("+ Crear módulo"));
    await user.selectOptions(screen.getByLabelText("Tipo de elemento"), "submodule");
    expect(screen.getByRole("combobox", { name: /Estado/ })).toHaveValue("true");

    await user.selectOptions(screen.getByLabelText("Módulo padre"), "m2");
    expect(screen.getByRole("combobox", { name: /Estado/ })).toHaveValue("false");
    expect(screen.getByText(/El módulo padre está inactivo/)).toBeVisible();
  });

  it("does not offer parents that already hold their own documents", async () => {
    const user = userEvent.setup();
    const withDocuments: ModuleView = {
      ...rootModules[1],
      code: "NORMAS",
      documentCount: 4,
      id: "m3",
      isActive: true,
      name: "Normas sueltas",
    };
    const modules = [...rootModules, withDocuments];
    render(
      <ModulesExplorer
        context={{ kind: "root" }}
        modules={modules}
        parents={modules.map(({ code, id, name }) => ({ code, id, name }))}
      />,
    );
    await user.click(screen.getByText("+ Crear módulo"));
    await user.selectOptions(screen.getByLabelText("Tipo de elemento"), "submodule");

    expect(
      screen.getByRole("option", { name: /Normas sueltas \(NORMAS\) — tiene documentos propios/ }),
    ).toBeDisabled();
    expect(screen.getByRole("option", { name: "Evaluación docente (EVAL)" })).toBeEnabled();
  });

  it("explains why a module with its own documents cannot receive submodules", () => {
    render(
      <ModulesExplorer
        context={{ ...moduleContext, hasDirectDocuments: true }}
        modules={[]}
        parents={parents}
      />,
    );
    expect(screen.queryByRole("button", { name: "+ Crear submódulo" })).not.toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(/ya tiene documentos propios/);
    expect(screen.queryByText(/Puedes crear uno/)).not.toBeInTheDocument();
  });

  it("labels submodule cards with the same spelling as the rest of the interface", () => {
    render(<ModulesExplorer context={moduleContext} modules={[existingChild]} parents={parents} />);
    expect(screen.getByText(`Submódulo: ${existingChild.name}`)).toBeInTheDocument();
    expect(screen.queryByText(/Sub Módulo/)).not.toBeInTheDocument();
  });
});

describe("modules-explorer.module.css — contratos visuales", () => {
  const css = readFileSync(
    resolve(process.cwd(), "src/components/admin/modules-explorer.module.css"),
    "utf8",
  );

  it("puts the create button at the right on desktop and on top, full width, on mobile", () => {
    expect(css).toMatch(/\.toolbarActions\s*\{[^}]*display:\s*flex[^}]*flex-wrap:\s*wrap/);
    expect(css).not.toMatch(/\.toolbarActions\s*\{[^}]*space-between/);
    expect(css).toMatch(/\.createButton\s*\{[^}]*margin-left:\s*auto/);
    expect(css).toMatch(
      /@media \(max-width: 32rem\)\s*\{[\s\S]*?\.createButton\s*\{[^}]*order:\s*-1;[^}]*width:\s*100%/,
    );
  });

  it("blinks with a full-accent ring and a tint different from the Activo badge", () => {
    expect(css).toMatch(/\.cardNew\s*\{[^}]*animation:\s*card-created 900ms ease-in-out 3/);
    expect(css).toMatch(
      /@keyframes card-created\s*\{[\s\S]*?50%\s*\{[^}]*box-shadow:\s*0 0 0 5px var\(--avend-accent\)/,
    );
    const keyframes = /@keyframes card-created\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    expect(keyframes).toContain("var(--card-new-tint)");
    // El pico no usa el mismo azul que la insignia «Activo».
    expect(keyframes).not.toContain("--avend-soft-blue");
    expect(css).toMatch(/\.cardNew \.badgeActive\s*\{[^}]*box-shadow:\s*inset 0 0 0 1px var\(--avend-accent\)/);
    expect(css).toMatch(
      /prefers-reduced-motion: reduce\)\s*\{\s*\.cardNew\s*\{[^}]*animation:\s*none;[^}]*box-shadow:\s*0 0 0 5px var\(--avend-accent\)/,
    );
  });

  it("keeps the Activo/Inactivo badge aligned with a readable two-line label", () => {
    expect(css).toMatch(/\.cardHeader\s*\{[^}]*display:\s*grid/);
    const tag = /\.moduleTag\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(tag).toMatch(/-webkit-line-clamp:\s*2/);
    expect(tag).toMatch(/min-height:\s*calc\(2lh \+ 0\.3rem\)/);
    expect(tag).toMatch(/font-size:\s*1rem/);
    expect(tag).not.toMatch(/text-transform:\s*uppercase/);
  });

  it("leaves room above the modal submit button", () => {
    expect(css).toMatch(/\.createForm :global\(\.avend-admin-submit\)\s*\{[^}]*margin-top:\s*1\.5rem/);
  });
});
