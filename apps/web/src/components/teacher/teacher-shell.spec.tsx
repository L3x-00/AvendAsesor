import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TeacherShell } from "./teacher-shell";

const modules = [
  {
    code: "LICENCIAS",
    id: "4c8b56af-6d0c-4fef-881e-7c00907540dd",
    name: "Licencias",
    parentModuleId: null,
    sortOrder: 0,
  },
];

describe("TeacherShell mobile navigation", () => {
  it("announces the menu state and restores focus after selecting a module", async () => {
    const user = userEvent.setup();
    const onModuleSelect = vi.fn();
    const { container } = render(
      <TeacherShell
        activeSection="chat"
        modules={modules}
        onModuleSelect={onModuleSelect}
      >
        <h1>Consulta</h1>
      </TeacherShell>,
    );
    const details = container.querySelector("details");

    expect(details).not.toBeNull();
    const mobileNavigation = within(details as HTMLDetailsElement);
    const summary = details?.querySelector("summary") as HTMLElement;
    expect(summary).toHaveAttribute(
      "aria-label",
      "Menú: abrir navegación principal",
    );

    await user.click(summary);

    await waitFor(() =>
      expect(summary).toHaveAttribute(
        "aria-label",
        "Menú: cerrar navegación principal",
      ),
    );
    await user.click(
      mobileNavigation.getByRole("button", { name: "Licencias" }),
    );

    expect(onModuleSelect).toHaveBeenCalledWith(modules[0].id);
    await waitFor(() => {
      expect(details).not.toHaveAttribute("open");
      expect(summary).toHaveAttribute(
        "aria-label",
        "Menú: abrir navegación principal",
      );
      expect(summary).toHaveFocus();
    });
  });

  it("does not close or steal focus when the desktop module navigation is used", async () => {
    const user = userEvent.setup();
    const onModuleSelect = vi.fn();
    render(
      <TeacherShell
        activeSection="chat"
        modules={modules}
        onModuleSelect={onModuleSelect}
      >
        <h1>Consulta</h1>
      </TeacherShell>,
    );

    const desktopButton = screen
      .getAllByRole("button", { name: "Licencias" })
      .find((button) => button.closest("aside") !== null);
    expect(desktopButton).toBeDefined();
    await user.click(desktopButton as HTMLButtonElement);

    expect(onModuleSelect).toHaveBeenCalledWith(modules[0].id);
    expect(desktopButton).toHaveFocus();
  });

  it("closes the mobile menu with Escape and restores focus", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <TeacherShell activeSection="chat" modules={modules}>
        <h1>Consulta</h1>
      </TeacherShell>,
    );
    const details = container.querySelector("details") as HTMLDetailsElement;
    const summary = details.querySelector("summary") as HTMLElement;

    await user.click(summary);
    await waitFor(() => expect(details).toHaveAttribute("open"));
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(details).not.toHaveAttribute("open");
      expect(summary).toHaveFocus();
    });
  });

  it("closes the mobile menu after starting a new chat", async () => {
    const user = userEvent.setup();
    const onNewChat = vi.fn();
    const { container } = render(
      <TeacherShell
        activeSection="chat"
        modules={modules}
        onNewChat={onNewChat}
      >
        <h1>Consulta</h1>
      </TeacherShell>,
    );
    const details = container.querySelector("details") as HTMLDetailsElement;
    const mobileNavigation = within(details);
    const summary = details.querySelector("summary") as HTMLElement;

    await user.click(summary);
    await user.click(
      mobileNavigation.getByRole("button", { name: "Nuevo chat" }),
    );

    expect(onNewChat).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(details).not.toHaveAttribute("open");
      expect(summary).toHaveFocus();
    });
  });

  it("orders only root modules and exposes the selected and administrative states", () => {
    const childModule = {
      ...modules[0],
      id: "7c8b56af-6d0c-4fef-881e-7c00907540dd",
      name: "Licencia por salud",
      parentModuleId: modules[0].id,
    };
    const firstModule = {
      ...modules[0],
      id: "8c8b56af-6d0c-4fef-881e-7c00907540dd",
      name: "Evaluación docente",
      sortOrder: 0,
    };
    const lastModule = { ...modules[0], sortOrder: 2 };
    const { container } = render(
      <TeacherShell
        activeSection="chat"
        modules={[lastModule, childModule, firstModule]}
        onModuleSelect={vi.fn()}
        role="admin"
        selectedModuleId={firstModule.id}
      >
        <h1>Consulta</h1>
      </TeacherShell>,
    );
    const desktopNavigation = within(
      container.querySelector("aside") as HTMLElement,
    );
    const moduleButtons = desktopNavigation.getAllByRole("button").filter(
      (button) =>
        button.textContent === "Evaluación docente" ||
        button.textContent === "Licencias",
    );

    expect(moduleButtons.map((button) => button.textContent)).toEqual([
      "Evaluación docente",
      "Licencias",
    ]);
    expect(
      desktopNavigation.queryByRole("button", { name: "Licencia por salud" }),
    ).not.toBeInTheDocument();
    expect(moduleButtons[0]).toHaveAttribute("aria-pressed", "true");
    expect(
      desktopNavigation.getByRole("link", {
        name: "Panel de administración",
      }),
    ).toHaveAttribute("href", "/admin");
  });

  it("uses the supplied SVGs for every matching module and retains the situations icon", () => {
    const iconModules = [
      { name: "Contrato y desplazamiento", source: "/icons/contrato.svg" },
      { name: "Evaluación docente", source: "/icons/evaluacion.svg" },
      { name: "Auxiliar de educación", source: "/icons/auxiliar.svg" },
      { name: "Ley y reglamento", source: "/icons/ley.svg" },
      { name: "Cargos y plazas", source: "/icons/plaza.svg" },
      { name: "Remuneraciones", source: "/icons/renumeracion.svg" },
    ].map((module, index) => ({
      ...modules[0],
      id: `module-${index}`,
      name: module.name,
      sortOrder: index,
      source: module.source,
    }));
    const situationsModule = {
      ...modules[0],
      id: "situaciones",
      name: "Situaciones administrativas",
      sortOrder: iconModules.length,
    };
    const { container } = render(
      <TeacherShell
        activeSection="chat"
        modules={[...iconModules, situationsModule]}
        onModuleSelect={vi.fn()}
      >
        <h1>Consulta</h1>
      </TeacherShell>,
    );
    const desktopNavigation = within(
      container.querySelector("aside") as HTMLElement,
    );

    iconModules.forEach(({ name, source }) => {
      const item = desktopNavigation.getByRole("button", { name });
      const icon = item.querySelector(".avend-teacher-module-icon");
      expect(icon).toHaveAttribute("aria-hidden", "true");
      expect(icon).toHaveClass("avend-navigation-icon");
      expect(icon).toHaveAttribute("style", expect.stringContaining(source));
    });

    const situationsItem = desktopNavigation.getByRole("button", {
      name: "Situaciones administrativas",
    });
    expect(situationsItem.querySelector(".avend-teacher-module-icon")).toBeNull();
    expect(
      situationsItem.querySelector("svg.avend-navigation-icon"),
    ).toBeInTheDocument();
  });
});
