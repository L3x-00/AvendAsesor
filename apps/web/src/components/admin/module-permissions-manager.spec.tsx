import { render, screen } from "@testing-library/react";
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
    expect(screen.getByText("Módulos con acceso (1)")).toBeInTheDocument();
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
});
