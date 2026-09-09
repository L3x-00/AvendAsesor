import { render, waitFor, within } from "@testing-library/react";
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
    const summary = mobileNavigation.getByText("Menú");
    expect(summary).toHaveAttribute("aria-label", "Abrir navegación principal");

    await user.click(summary);

    await waitFor(() =>
      expect(summary).toHaveAttribute(
        "aria-label",
        "Cerrar navegación principal",
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
        "Abrir navegación principal",
      );
      expect(summary).toHaveFocus();
    });
  });
});
