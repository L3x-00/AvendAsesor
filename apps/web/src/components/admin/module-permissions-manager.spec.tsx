import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AdminModulePermission } from "@/lib/admin-api/types";
import { ModulePermissionsManager } from "./module-permissions-manager";

vi.mock("@/app/admin/actions", () => ({
  setAdminModuleGrantsAction: vi.fn(async () => ({ status: "idle" })),
  setAdminModulePermissionAction: vi.fn(async () => ({ status: "idle" })),
}));

const modules = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Remuneraciones",
    parentModuleId: null,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Escala",
    parentModuleId: "11111111-1111-4111-8111-111111111111",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Licencias",
    parentModuleId: null,
  },
];

const permissions: AdminModulePermission[] = [
  {
    canAccess: true,
    fullName: "Admin Uno",
    moduleIds: ["11111111-1111-4111-8111-111111111111"],
    role: "admin",
    updatedAt: null,
    updatedBy: null,
    userId: "44444444-4444-4444-8444-444444444444",
  },
  {
    canAccess: true,
    fullName: "Super Dos",
    moduleIds: [],
    role: "superadmin",
    updatedAt: null,
    updatedBy: null,
    userId: "55555555-5555-4555-8555-555555555555",
  },
];

describe("ModulePermissionsManager", () => {
  it("marca los módulos concedidos y ofrece casillas por módulo y submódulo", () => {
    render(
      <ModulePermissionsManager modules={modules} permissions={permissions} />,
    );

    const root = screen.getByRole("checkbox", {
      name: "Remuneraciones",
    }) as HTMLInputElement;
    const child = screen.getByRole("checkbox", {
      name: /Escala/,
    }) as HTMLInputElement;
    const other = screen.getByRole("checkbox", {
      name: "Licencias",
    }) as HTMLInputElement;

    expect(root).toBeChecked();
    expect(child).not.toBeChecked();
    expect(other).not.toBeChecked();
    expect(root).toHaveAttribute("name", "moduleId");
    // El resumen del encabezado dice cuántos módulos tiene concedidos.
    expect(screen.getByText("1 de 3 módulos con acceso")).toBeInTheDocument();
  });

  it("los superadministradores no reciben casillas de concesión", () => {
    render(
      <ModulePermissionsManager modules={modules} permissions={permissions} />,
    );

    // Solo el árbol del administrador editable: 3 casillas.
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    // El superadministrador conserva acceso total y no se configura aquí.
    expect(screen.queryByText("Super Dos")).toBeNull();
  });

  it("separa el acceso al área en un control visible", () => {
    const { container } = render(
      <ModulePermissionsManager modules={modules} permissions={permissions} />,
    );

    const withAccess = screen.getByRole("radio", { name: "Con acceso" });
    const withoutAccess = screen.getByRole("radio", { name: "Sin acceso" });

    expect(withAccess).toBeChecked();
    expect(withoutAccess).not.toBeChecked();
    expect(withAccess).toHaveAttribute("name", "canAccess");
    expect(withAccess).toHaveAttribute("value", "true");
    expect(withoutAccess).toHaveAttribute("value", "false");
    expect(screen.getByText("Habilitado")).toBeVisible();
    // El control de acceso no se repliega: solo los módulos se despliegan.
    expect(container.querySelector("details")).toBeNull();
    expect(container.querySelector("summary")).toBeNull();
  });

  it("pliega los submódulos por defecto y los despliega al pulsar el módulo", () => {
    const { container } = render(
      <ModulePermissionsManager modules={modules} permissions={permissions} />,
    );

    const toggle = screen.getByRole("button", {
      name: "Submódulos de Remuneraciones",
    });
    const panel = container.querySelector<HTMLElement>(
      `#${toggle.getAttribute("aria-controls") ?? ""}`,
    );

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(panel).not.toBeNull();
    expect(panel).toHaveAttribute("data-open", "false");
    expect(panel).toHaveAttribute("inert");

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(panel).toHaveAttribute("data-open", "true");
    expect(panel).not.toHaveAttribute("inert");

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(panel).toHaveAttribute("data-open", "false");
  });

  it("las casillas plegadas siguen dentro del formulario y se envían", () => {
    const { container } = render(
      <ModulePermissionsManager modules={modules} permissions={permissions} />,
    );

    const form = [...container.querySelectorAll("form")].find((candidate) =>
      candidate.querySelector('input[name="moduleId"]'),
    );
    expect(form).not.toBeNull();
    if (!form) return;

    // Aunque el panel esté cerrado, los módulos y submódulos concedidos viajan
    // con el formulario: se ocultan con `inert`, nunca con `hidden` ni
    // `disabled`.
    const submitted = [
      ...form.querySelectorAll<HTMLInputElement>('input[name="moduleId"]'),
    ].map((input) => input.value);
    expect(submitted).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
    ]);
    expect(
      screen.getByRole("checkbox", { name: "Remuneraciones" }),
    ).not.toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /Escala/ })).not.toBeDisabled();
  });

  it("ya no ofrece marcar o desmarcar todos los módulos", () => {
    render(
      <ModulePermissionsManager modules={modules} permissions={permissions} />,
    );

    expect(screen.queryByRole("button", { name: "Marcar todos" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Desmarcar todos" })).toBeNull();
    // Un módulo sin submódulos no ofrece desglose, solo su casilla.
    expect(screen.queryByRole("button", { name: "Licencias" })).toBeNull();
  });
});
