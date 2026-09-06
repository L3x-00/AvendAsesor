import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ConsultationRouteFields } from "./consultation-route-fields";

const roots = [
  { id: "root-a", name: "Situaciones administrativas", parentModuleId: null },
  { id: "root-b", name: "Evaluación docente", parentModuleId: null },
];
const submodules = [
  { id: "sub-a", name: "Licencias", parentModuleId: "root-a" },
  { id: "sub-b", name: "Contratación docente", parentModuleId: "root-b" },
];

describe("ConsultationRouteFields", () => {
  it("limits the selected submodule to the selected root module", async () => {
    const user = userEvent.setup();
    render(
      <ConsultationRouteFields
        initialModuleId="root-a"
        initialSubmoduleId="sub-a"
        roots={roots}
        submodules={submodules}
      />,
    );

    const root = screen.getByRole("combobox", {
      name: "Módulo principal detectado",
    });
    const submodule = screen.getByRole("combobox", {
      name: "Submódulo detectado",
    });
    expect(submodule).toHaveValue("sub-a");
    expect(
      screen.queryByRole("option", { name: "Contratación docente" }),
    ).toBeNull();

    await user.selectOptions(root, "root-b");
    expect(submodule).toHaveValue("");
    expect(screen.getByRole("option", { name: "Contratación docente" })).toBeVisible();
    expect(screen.queryByRole("option", { name: "Licencias" })).toBeNull();
  });

  it("disables submodule selection until a root module is selected", () => {
    render(
      <ConsultationRouteFields
        initialModuleId={null}
        initialSubmoduleId={null}
        roots={roots}
        submodules={submodules}
      />,
    );

    expect(
      screen.getByRole("combobox", { name: "Submódulo detectado" }),
    ).toBeDisabled();
  });
});
